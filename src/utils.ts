import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import * as crypto from "crypto";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as fspromises from "fs/promises";
import * as httpm from "@actions/http-client";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import * as path from "path";
import { execSync } from "child_process";

import {
  EndorctlAvailableArch,
  EndorctlAvailableOS,
  RUNNER_TO_ENDORCTL_ARCH,
  RUNNER_TO_ENDORCTL_OS,
  SupportedRunnerArch,
  SupportedRunnerOS,
} from "./constants";
import {
  ClientChecksumsType,
  PlatformInfo,
  SetupProps,
  VersionResponse,
} from "./types";

const execOptionSilent = {
  silent: true,
};

export const createHashFromFile = (filePath: string) =>
  new Promise((resolve) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (data) => hash.update(data))
      .on("end", () => resolve(hash.digest("hex")));
  });

export const commandExists = (command: string) => {
  try {
    const platform = getPlatformInfo();
    const cmd =
      platform.os === EndorctlAvailableOS.Windows
        ? `where ${command}`
        : `which ${command}`;

    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Returns the OS and Architecture to be used for downloading endorctl binary,
 * based on the current runner OS and Architecture. Returns the error if runner
 * OS/Arch combination is not supported
 */
export const getPlatformInfo = () => {
  const defaultInfo: PlatformInfo = {
    os: undefined,
    arch: undefined,
    error: undefined,
  };
  const { RUNNER_ARCH, RUNNER_OS } = process.env;
  const allOsList = Object.values(SupportedRunnerOS) as string[];
  const allArchList = Object.values(SupportedRunnerArch) as string[];
  const armOsList = [SupportedRunnerOS.Macos] as string[];
  if (!RUNNER_OS || !allOsList.includes(RUNNER_OS)) {
    return {
      ...defaultInfo,
      error:
        "Unsupported OS! This actions requires one of [Linux, macOS, Windows].",
    };
  }
  if (!RUNNER_ARCH || !allArchList.includes(RUNNER_ARCH)) {
    return {
      ...defaultInfo,
      error:
        "Unsupported Architecture! This actions requires one of [AMD64(X64), ARM64].",
    };
  }
  if (
    RUNNER_ARCH === SupportedRunnerArch.Arm64 &&
    !armOsList.includes(RUNNER_OS)
  ) {
    return {
      ...defaultInfo,
      error: `Architecture ${RUNNER_ARCH} not supported for ${RUNNER_OS}!`,
    };
  }
  return {
    ...defaultInfo,
    os: RUNNER_TO_ENDORCTL_OS[RUNNER_OS as SupportedRunnerOS],
    arch: RUNNER_TO_ENDORCTL_ARCH[RUNNER_ARCH as SupportedRunnerArch],
  };
};

/**
 * Returns the checksum for the given OS and Architecture
 */
export const getEndorctlChecksum = (
  clientChecksums: ClientChecksumsType,
  os?: EndorctlAvailableOS,
  arch?: EndorctlAvailableArch
) => {
  const platformString = `${os}_${arch}`;
  switch (platformString) {
    case `${EndorctlAvailableOS.Linux}_${EndorctlAvailableArch.Amd64}`:
      return clientChecksums.ARCH_TYPE_LINUX_AMD64;
    case `${EndorctlAvailableOS.Macos}_${EndorctlAvailableArch.Amd64}`:
      return clientChecksums.ARCH_TYPE_MACOS_AMD64;
    case `${EndorctlAvailableOS.Macos}_${EndorctlAvailableArch.Arm64}`:
      return clientChecksums.ARCH_TYPE_MACOS_ARM64;
    case `${EndorctlAvailableOS.Windows}_${EndorctlAvailableArch.Amd64}`:
      return clientChecksums.ARCH_TYPE_WINDOWS_AMD64;
    default:
      return "";
  }
};

export const writeJsonToFile = async (jsonString: string) => {
  try {
    const { GITHUB_RUN_ID, RUNNER_TEMP } = process.env;
    const fileName = `result-${GITHUB_RUN_ID}.json`;
    const uploadPath = path.resolve(RUNNER_TEMP ?? __dirname);
    const filePath = path.resolve(RUNNER_TEMP ?? __dirname, fileName);
    await fspromises.writeFile(filePath, jsonString, "utf8");
    return { fileName, filePath, uploadPath };
  } catch (e) {
    return { error: e as Error };
  }
};

/**
 * Type guard for object/Record
 */
export const isObject = (value: unknown): value is Record<string, unknown> => {
  return "object" === typeof value && null !== value;
};

/**
 * Type guard for VersionResponse
 */
export const isVersionResponse = (value: unknown): value is VersionResponse => {
  return (
    isObject(value) &&
    // expect: `Service` property exists
    "Service" in value &&
    isObject(value.Service) &&
    // expect: `Service` property exists
    "ClientChecksums" in value &&
    isObject(value.ClientChecksums)
  );
};

/**
 * @throws {Error} when api is unreachable or returns invalid response
 */
export const fetchLatestEndorctlVersion = async (api: string) => {
  const _http: httpm.HttpClient = new httpm.HttpClient("endor-http-client");

  const res: httpm.HttpClientResponse = await _http
    .get(`${api}/meta/version`)
    // eslint-disable-next-line github/no-then
    .catch((error) => {
      throw new Error(
        `Failed to fetch latest version of endorctl from Endor Labs API: ${error.toString()}`
      );
    });
  const body: string = await res.readBody();

  let data: VersionResponse | undefined;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new Error(`Invalid response from Endor Labs API: \`${body}\``);
  }

  if (!isVersionResponse(data)) {
    throw new Error(`Invalid response from Endor Labs API: \`${body}\``);
  }

  if (!data.ClientVersion) {
    data.ClientVersion = data.Service.Version;
  }

  return data;
};

export const setupEndorctl = async ({ version, checksum, api }: SetupProps) => {
  try {
    const platform = getPlatformInfo();

    if (platform.error) {
      throw new Error(platform.error);
    }

    const isWindows = platform.os === EndorctlAvailableOS.Windows;

    let endorctlVersion = version;
    let endorctlChecksum = checksum;
    if (!version) {
      core.info(`Endorctl version not provided, using latest version`);

      const data = await fetchLatestEndorctlVersion(api);
      endorctlVersion = data.ClientVersion;
      endorctlChecksum = getEndorctlChecksum(
        data.ClientChecksums,
        platform.os,
        platform.arch
      );
    }

    core.info(`Downloading endorctl version ${endorctlVersion}`);
    const url = `${api}/download/endorlabs/${endorctlVersion}/binaries/endorctl_${endorctlVersion}_${
      platform.os
    }_${platform.arch}${isWindows ? ".exe" : ""}`;
    let downloadPath: string | null = null;

    downloadPath = await tc.downloadTool(url);
    const hash = await createHashFromFile(downloadPath);
    if (hash !== endorctlChecksum) {
      throw new Error(
        "The checksum of the downloaded binary does not match the expected value!"
      );
    } else {
      core.info(`Binary checksum: ${endorctlChecksum}`);
    }

    await exec.exec("chmod", ["+x", downloadPath], execOptionSilent);
    const binPath = ".";
    const endorctlPath = path.join(
      binPath,
      `endorctl${isWindows ? ".exe" : ""}`
    );
    await io.cp(downloadPath, endorctlPath);
    core.addPath(binPath);

    core.info(`Endorctl downloaded and added to the path`);
    // Check to see if tsserver is installed -- if not install it (needed for javascript callgraphs)
    const command = "tsserver";
    core.info(`Checking for tsserver`);
    if (!commandExists(command)) {
      const requiredVersion = 4.2;
      const nodeVersionString = process.version.replace(/^v/, "");
      const parts = nodeVersionString.split(".");
      let currentVersion;
      if (parts.length > 2) {
        const nodeVersionStringParts = parts.slice(0, 2).join(".");
        currentVersion = parseFloat(nodeVersionStringParts);
      } else {
        currentVersion = parseFloat(nodeVersionString);
      }

      if (currentVersion >= requiredVersion) {
        core.info(`Installing tsserver`);
        // Determine the correct version based on the current version of node
        let typescriptVersion;
        if (currentVersion < 12.2) {
          typescriptVersion = 4.9;
        } else if (currentVersion < 14.17) {
          typescriptVersion = 5.0;
        }

        let typescriptPackage = "typescript";
        if (typescriptVersion != null) {
          typescriptPackage = `${typescriptPackage}@${typescriptVersion}`;
        }

        try {
          await exec.exec("npm", ["install", "-g", typescriptPackage]);
        } catch (error: any) {
          core.warning(
            `Unable to install ${typescriptPackage}. JavaScript call graphs will not be generated`
          );
        }
      } else {
        core.warning(
          `Unable to install >=typescript@4.7 (node >= ${requiredVersion} is required). JavaScript call graphs will not be generated.`
        );
      }
    }
  } catch (error: any) {
    core.setFailed(error);
  }
};

export const uploadArtifact = async (scanResult: string) => {
  const artifactClient = new artifact.DefaultArtifactClient();
  const maxExistingChecks = 8;
  let artifactName = "endor-scan";
  // TODO - list artifacts and add a random identifier if artifact already exists
  let artifactExists = true;
  let checkCount = 0;
  while (artifactExists && checkCount < maxExistingChecks) {
    checkCount += 1;
    try {
      artifactClient.getArtifact(artifactName);
      artifactExists = false; // stops the loop
    } catch (e) {
      // the artifact exists: add a random letter and try again
      core.info(`Found existing artifact '${artifactName}'`);
      const lowercaseAsciiStart = 97;
      const letterIndex = Math.floor(Math.random() * 26);
      const letter = String.fromCharCode(lowercaseAsciiStart + letterIndex);
      artifactName += letter;
    }
  } // - while artifactExists...

  if (artifactExists) {
    core.warning(
      `Can't find a unique artifact name for scan results after ${checkCount} tries`
    );
    return;
  }

  const { filePath, uploadPath, error } = await writeJsonToFile(scanResult);
  if (error) {
    core.warning(
      `Unable to write JSON document for scan result to file: ${error}`
    );
  } else {
    const files = [filePath];
    const rootDirectory = uploadPath;
    core.info(`Writing artifact ${artifactName}`);
    try {
      const { id, size } = await artifactClient.uploadArtifact(
        artifactName,
        files,
        rootDirectory,
        {}
      );
      core.info(`Scan result exported to artifact ${id}, size ${size}`);
      core.setOutput("scan_result", artifactName);
    } catch (e) {
      if (e instanceof Error) {
        core.warning(`Some items failed to export: ${e.message}`);
      } else {
        core.warning(`Some items failed to export: ${e}`);
      }
    }
  }
};

export const doYouHaveTheTime = async (cmd: string): Promise<boolean> => {
  const options: exec.ExecOptions = {
    silent: true, // Optionally set silent true to avoid additional logs
  };

  try {
    await exec.exec(cmd, ["true"], options);
    return true; // `time true` executed successfully, return true
  } catch (error) {
    return false; // An error occurred, return false
  }
};

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fspromises from "fs/promises";
import * as path from "path";

import { EndorctlAvailableOS } from "./constants";
import { getPlatformInfo, setupEndorctl } from "./utils";

export const writeEndorctlConfiguration = async (configString: string) => {
  try {
    const home = process.env["HOME"];
    if (!home) {
      throw new Error("HOME not found in process.env");
    }
    const fileName = `config.yaml`;
    const folderPath = path.resolve(home || "", ".endorctl");
    const filePath = path.resolve(folderPath, fileName);
    await fspromises.mkdir(folderPath, { recursive: true });
    await fspromises.writeFile(filePath, configString, "utf8");
    return { fileName, filePath };
  } catch (e) {
    return { error: e as Error };
  }
};

async function run() {
  try {
    const platform = getPlatformInfo();

    if (platform.error) {
      throw new Error(platform.error);
    }

    // Common options
    const API = core.getInput("api");
    const API_KEY = core.getInput("api_key");
    const API_SECRET = core.getInput("api_secret");
    const GCP_CREDENTIALS_SERVICE_ACCOUNT = core.getInput(
      "gcp_service_account"
    );
    const ENABLE_GITHUB_ACTION_TOKEN = core.getBooleanInput(
      "enable_github_action_token"
    );
    const NAMESPACE = core.getInput("namespace");
    const ENDORCTL_VERSION = core.getInput("endorctl_version");
    const ENDORCTL_CHECKSUM = core.getInput("endorctl_checksum");
    const LOG_VERBOSE = core.getBooleanInput("log_verbose");
    const LOG_LEVEL = core.getInput("log_level");
    const RUN_STATS = core.getBooleanInput("run_stats");

    core.info(`Endor Namespace: ${NAMESPACE}`);

    if (!NAMESPACE) {
      core.setFailed(
        "namespace is required and must be passed as an input from the workflow"
      );
      return;
    }

    if (
      !ENABLE_GITHUB_ACTION_TOKEN &&
      !(API_KEY && API_SECRET) &&
      !GCP_CREDENTIALS_SERVICE_ACCOUNT
    ) {
      core.setFailed(
        "Authentication info not found. Either set enable_github_action_token: true or provide one of gcp_service_account or api_key and api_secret combination"
      );
      return;
    }
    await setupEndorctl({
      version: ENDORCTL_VERSION,
      checksum: ENDORCTL_CHECKSUM,
      api: API,
    });

    // Common options.
    const options = [`--verbose=${LOG_VERBOSE}`, `--log-level=${LOG_LEVEL}`];

    let config = `ENDOR_NAMESPACE: ${NAMESPACE}`;

    if (API) {
      config += `
ENDOR_API: ${API}`;
    }

    if (ENABLE_GITHUB_ACTION_TOKEN) {
      config += `
ENDOR_GITHUB_ACTION_TOKEN_ENABLE: true`;
    } else if (API_KEY && API_SECRET) {
      config += `
ENDOR_API_CREDENTIALS_KEY: ${API_KEY}
ENDOR_API_CREDENTIALS_SECRET: ${API_SECRET}`;
    } else if (GCP_CREDENTIALS_SERVICE_ACCOUNT) {
      config += `
ENDOR_GCP_CREDENTIALS_SERVICE_ACCOUNT: ${GCP_CREDENTIALS_SERVICE_ACCOUNT}`;
    }

    const { error } = await writeEndorctlConfiguration(config);
    if (error) {
      core.setFailed(`Endorctl setup failed`);
      return;
    }

    // Try to get oss to check if the auth did work.
    options.unshift(`get`);
    options.unshift(`api`);
    options.push(`--resource=tenant`);
    options.push(`--name=oss`);

    let endorctl_command = `endorctl`;
    if (RUN_STATS) {
      // Wrap scan commmand in `time -v` to get stats
      if (platform.os === EndorctlAvailableOS.Windows) {
        core.info("Timing is not supported on Windows runners");
      } else if (platform.os === EndorctlAvailableOS.Macos) {
        options.unshift("-l", endorctl_command);
        endorctl_command = `/usr/bin/time`;
      } else if (platform.os === EndorctlAvailableOS.Linux) {
        options.unshift("-v", endorctl_command);
        endorctl_command = `time`;
      } else {
        core.info("Timing not supported on this OS");
      }
    }
    // Run the command
    await exec.exec(endorctl_command, options);

    core.info(`Endorctl setup sucess`);
  } catch {
    core.setFailed(`Endorctl setup failed`);
  }
}

run();

export {};

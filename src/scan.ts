import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as httpm from "@actions/http-client";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs";

interface SetupProps {
  version: string;
  checksum: string;
  api: string;
}

const execOptionSilent = {
  silent: true,
};

const createHashFromFile = (filePath: string) =>
  new Promise((resolve) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (data) => hash.update(data))
      .on("end", () => resolve(hash.digest("hex")));
  });

const setupEndorctl = async ({ version, checksum, api }: SetupProps) => {
  const _http: httpm.HttpClient = new httpm.HttpClient("endor-http-client");

  try {
    let endorctlVersion = version;
    let endorctlChecksum = checksum;
    if (!version) {
      core.info(`Endorctl version not provided, using latest version`);
      const res: httpm.HttpClientResponse = await _http.get(
        `${api}/meta/version`
      );
      const body: string = await res.readBody();
      const obj = JSON.parse(body);
      endorctlVersion = obj?.Service?.Version;
      endorctlChecksum = obj?.ClientChecksums?.ARCH_TYPE_LINUX_AMD64;
    }

    core.info(`Downloading endorctl version ${endorctlVersion}`);
    let url = `https://storage.googleapis.com/endorlabs/${endorctlVersion}/binaries/endorctl_${endorctlVersion}_linux_amd64`;
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
    const endorctlPath = path.join(binPath, "endorctl");
    await io.mv(downloadPath, endorctlPath);
    core.addPath(binPath);

    core.info(`Endorctl downloaded and added to the path`);
  } catch (error: any) {
    core.setFailed(error);
  }
};

async function run() {
  let scanResult = "";

  const scanOptions: exec.ExecOptions = {
    listeners: {
      stdout: (data: Buffer) => {
        scanResult += data.toString();
      },
      stderr: (data: Buffer) => {
        scanResult += data.toString();
      },
    },
    ...execOptionSilent,
  };

  try {
    const API = core.getInput("api");
    const API_KEY = core.getInput("api_key");
    const API_SECRET = core.getInput("api_secret");
    const GCP_CREDENTIALS_SERVICE_ACCOUNT = core.getInput(
      "gcp_service_account"
    );
    const NAMESPACE = core.getInput("namespace");
    const ENDORCTL_VERSION = core.getInput("endorctl_version");
    const ENDORCTL_CHECKSUM = core.getInput("endorctl_checksum");
    const SHOW_PROGRESS = core.getBooleanInput("show_progress");
    const LOG_VERBOSE = core.getBooleanInput("log_verbose");
    const LOG_LEVEL = core.getInput("log_level");
    const SCAN_SUMMARY_OUTPUT_TYPE = core.getInput("scan_summary_output_type");
    const CI_RUN = core.getBooleanInput("ci_run");
    const CI_RUN_TAGS = core.getInput("ci_run_tags");
    const ADDITIONAL_ARGS = core.getInput("additional_args");

    core.info(`Endor Namespace: ${NAMESPACE}`);

    if (!NAMESPACE) {
      core.setFailed(
        "namespace is required and must be passed as an input from the workflow"
      );
      return;
    }
    if (!(API_KEY && API_SECRET) && !GCP_CREDENTIALS_SERVICE_ACCOUNT) {
      core.setFailed(
        "Authentication info not found. Either a gcp service account or api key and secret combination must be passed as an input from the workflow"
      );
      return;
    }
    await setupEndorctl({
      version: ENDORCTL_VERSION,
      checksum: ENDORCTL_CHECKSUM,
      api: API,
    });

    const repoName = github.context.repo.repo;

    core.info(`Scanning repository ${repoName}`);

    const options = [
      `--namespace=${NAMESPACE}`,
      `--show-progress=${SHOW_PROGRESS}`,
      `--verbose=${LOG_VERBOSE}`,
      `--output-type=${SCAN_SUMMARY_OUTPUT_TYPE}`,
      `--log-level=${LOG_LEVEL}`,
      `--ci-run=${CI_RUN}`,
    ];

    if (API) options.push(`--api=${API}`);
    if (API_KEY && API_SECRET)
      options.push(`--api-key=${API_KEY}`, `--api-secret=${API_SECRET}`);
    if (GCP_CREDENTIALS_SERVICE_ACCOUNT)
      options.push(`--gcp-service-account=${GCP_CREDENTIALS_SERVICE_ACCOUNT}`);

    if (CI_RUN_TAGS) {
      options.push(CI_RUN_TAGS);
    }
    if (ADDITIONAL_ARGS) {
      options.push(ADDITIONAL_ARGS);
    }

    await exec.exec(
      `endorctl scan --path=. ${options.join(" ")}`,
      [],
      scanOptions
    );

    core.info(`Scan Result:`);
    core.info(scanResult);
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();

export {};

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as httpm from "@actions/http-client";
import * as io from "@actions/io";
import * as tc from "@actions/tool-cache";
import * as path from "path";
import { EndorctlAvailableOS } from "./constants";
import { SetupProps, VersionResponse } from "./types";
import {
  createHashFromFile,
  getEndorctlChecksum,
  getPlatformInfo,
} from "./utils";

const execOptionSilent = {
  silent: true,
};

const setupEndorctl = async ({ version, checksum, api }: SetupProps) => {
  const _http: httpm.HttpClient = new httpm.HttpClient("endor-http-client");

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
      const res: httpm.HttpClientResponse = await _http.get(
        `${api}/meta/version`
      );
      const body: string = await res.readBody();
      const obj: VersionResponse = JSON.parse(body);
      endorctlVersion = obj?.Service?.Version;
      endorctlChecksum = getEndorctlChecksum(
        obj.ClientChecksums,
        platform.os,
        platform.arch
      );
    }

    core.info(`Downloading endorctl version ${endorctlVersion}`);
    let url = `https://storage.googleapis.com/endorlabs/${endorctlVersion}/binaries/endorctl_${endorctlVersion}_${
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
    await io.mv(downloadPath, endorctlPath);
    core.addPath(binPath);

    core.info(`Endorctl downloaded and added to the path`);
  } catch (error: any) {
    core.setFailed(error);
  }
};

async function run() {
  let scanResult = "";
  let scanError = "";

  const scanOptions: exec.ExecOptions = {
    listeners: {
      stdout: (data: Buffer) => {
        scanResult += data.toString();
      },
      stderr: (data: Buffer) => {
        scanError += data.toString();
      },
    },
  };

  try {
    const SHOW_PROGRESS = false;
    const API = core.getInput("api");
    const API_KEY = core.getInput("api_key");
    const API_SECRET = core.getInput("api_secret");
    const GCP_CREDENTIALS_SERVICE_ACCOUNT = core.getInput(
      "gcp_service_account"
    );
    const NAMESPACE = core.getInput("namespace");
    const ENDORCTL_VERSION = core.getInput("endorctl_version");
    const ENDORCTL_CHECKSUM = core.getInput("endorctl_checksum");
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
      options.push(`--ci-run-tags=${CI_RUN_TAGS}`);
    }
    if (ADDITIONAL_ARGS) {
      options.push(ADDITIONAL_ARGS);
    }

    await exec.exec(`endorctl`, ["scan", "--path=.", ...options], scanOptions);

    core.info("Scan completed successfully!");
    core.setOutput("result", scanResult);
  } catch {
    core.setFailed(`\nScan Failed\n\n${scanError}`);
  }
}

run();

export {};

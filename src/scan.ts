import * as artifact from "@actions/artifact";
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
  writeJsonToFile,
  isVersionResponse,
} from "./utils";

const execOptionSilent = {
  silent: true,
};

/**
 * @throws {Error} when api is unreachable or returns invalid response
 */
const fetchLatestEndorctlVersion = async (api: string) => {
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

const setupEndorctl = async ({ version, checksum, api }: SetupProps) => {
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
    await io.mv(downloadPath, endorctlPath);
    core.addPath(binPath);

    core.info(`Endorctl downloaded and added to the path`);
  } catch (error: any) {
    core.setFailed(error);
  }
};

const uploadArtifact = async (scanResult: string) => {
  const artifactClient = artifact.create();
  const artifactName = "endor-scan";

  const { filePath, uploadPath, error } = await writeJsonToFile(scanResult);
  if (error) {
    core.error(error);
  } else {
    const files = [filePath];
    const rootDirectory = uploadPath;
    const options = {
      continueOnError: true,
    };
    const uploadResult = await artifactClient.uploadArtifact(
      artifactName,
      files,
      rootDirectory,
      options
    );
    if (uploadResult.failedItems.length > 0) {
      core.error("Some items failed to export");
    } else {
      core.info("Scan result exported to artifact");
    }
  }
};

// Scan options
function get_scan_options(options: any[]): void {

  const CI_RUN = core.getBooleanInput("ci_run"); // deprecated
  const CI_RUN_TAGS = core.getInput("ci_run_tags"); // deprecated
  const SCAN_PR = core.getBooleanInput("pr");
  const SCAN_PR_BASELINE = core.getInput("pr_baseline");
  const SCAN_TAGS = core.getInput("tags");
  const SCAN_DEPENDENCIES = core.getBooleanInput("scan_dependencies");
  const SCAN_SECRETS = core.getBooleanInput("scan_secrets");
  const SCAN_GIT_LOGS = core.getBooleanInput("scan_git_logs");
  const SCAN_PATH = core.getInput("scan_path");
  const ADDITIONAL_ARGS = core.getInput("additional_args");

  const ADDITION_OPTIONS = ADDITIONAL_ARGS.split(" ");
  const SARIF_FILE = core.getInput("sarif_file");
  const ENABLE_PR_COMMENTS = core.getBooleanInput("enable_pr_comments");
  const GITHUB_TOKEN = core.getInput("github_token");
  const GITHUB_PR_ID = github.context.payload.pull_request?.number;

  const USE_BAZEL = core.getBooleanInput("use_bazel");
  const BAZEL_EXCLUDE_TARGETS = core.getInput("bazel_exclude_targets");
  const BAZEL_INCLUDE_TARGETS = core.getInput("bazel_include_targets");
  const BAZEL_TARGETS_QUERY = core.getInput("bazel_targets_query");

  if (!SCAN_DEPENDENCIES && !SCAN_SECRETS) {
    core.error(
      "At least one of `scan_dependencies` or `scan_secrets` must be enabled"
    );
  }
  if (SCAN_DEPENDENCIES) {
    options.push(`--dependencies=true`);
  }
  if (SCAN_SECRETS) {
    options.push(`--secrets=true`);
  }

  if (USE_BAZEL) {
    options.push(`--use-bazel=true`);

    if (BAZEL_EXCLUDE_TARGETS) {
      options.push(`--bazel-exclude-targets=${BAZEL_EXCLUDE_TARGETS}`);
    }
    if (BAZEL_INCLUDE_TARGETS) {
      options.push(`--bazel-include-targets=${BAZEL_INCLUDE_TARGETS}`);
    }
    if (BAZEL_TARGETS_QUERY) {
      options.push(`--bazel-targets-query=${BAZEL_TARGETS_QUERY}`);
    }
  }

  if (SCAN_GIT_LOGS) {
    if (!SCAN_SECRETS) {
      core.error(
        "Please also enable `scan_secrets` to scan Git logs for secrets"
      );
    } else {
      options.push(`--git-logs=true`);
    }
  }

  if (ENABLE_PR_COMMENTS && GITHUB_PR_ID) {
    if (!SCAN_PR) {
      core.error(
        "The `pr` option must be enabled for PR comments. Either set `pr: true` or disable PR comments"
      );
    } else if (!CI_RUN) {
      core.error(
        "The `ci-run` option has been renamed to `pr` and must be enabled for PR comments. Remove the `ci-run` configuration or disable PR comments"
      );
    } else if (!GITHUB_TOKEN) {
      core.error("`github_token` is required to enable PR comments");
    } else {
      options.push(
        `--enable-pr-comments=true`,
        `--github-pr-id=${GITHUB_PR_ID}`,
        `--github-token=${GITHUB_TOKEN}`
      );
    }
  }

  if (CI_RUN && SCAN_PR) {
    // Both are enabled by default so only set this flag if neither option has been disabled
    options.push(`--pr=true`);
  }
  if (SCAN_PR_BASELINE) {
    if (!SCAN_PR) {
      core.error(
        "The `pr` option must also be enabled if `pr_baseline` is set. Either set `pr: true` or remove the PR baseline"
      );
    } else if (!CI_RUN) {
      core.error(
        "The `ci-run` option has been renamed to `pr` and must be enabled if `pr_baseline` is set. Remove the `ci-run` configuration or the PR baseline"
      );
    } else {
      options.push(`--pr-baseline=${SCAN_PR_BASELINE}`);
    }
  }

  // Deprecated
  if (CI_RUN_TAGS) {
    options.push(`--ci-run-tags=${CI_RUN_TAGS}`);
  }
  if (SCAN_TAGS) {
    options.push(`--tags=${SCAN_TAGS}`);
  }
  if (SCAN_PATH) {
    options.push(`--path=${SCAN_PATH}`);
  }
  if (ADDITIONAL_ARGS && ADDITION_OPTIONS.length > 0) {
    options.push(...ADDITION_OPTIONS);
  }
  if (SARIF_FILE) {
    options.push(`--sarif-file=${SARIF_FILE}`);
  }
}

// Sign options
function get_sign_options(options: any[]): void {

  const IMAGE_NAME = core.getInput("image_name");

  if (!IMAGE_NAME) {
    core.setFailed(
      "artifact_name is required for the sign command and must be passed as an input from the workflow"
    );
    return;
  }

  options.push(`--image-name=${IMAGE_NAME}`);
}

async function run() {
  let scanResult = "";

  const scanOptions: exec.ExecOptions = {
    listeners: {
      stdout: (data: Buffer) => {
        scanResult += data.toString();
      },
    },
  };

  try {
    const platform = getPlatformInfo();

    if (platform.error) {
      throw new Error(platform.error);
    }

    // Scan or Sign.
    let COMMAND = core.getInput("command");
    COMMAND ??= "scan";

    if (COMMAND !== "scan" && COMMAND !== "sign") {
      core.setFailed(`Unknown COMMAND: ${COMMAND}`);
      return;
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
    const EXPORT_SCAN_RESULT_ARTIFACT = core.getBooleanInput(
      "export_scan_result_artifact"
    );
    const SCAN_SUMMARY_OUTPUT_TYPE = core.getInput("scan_summary_output_type");

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

    const repoName = github.context.repo.repo;

    // Common options.
    let options = [
      `--namespace=${NAMESPACE}`,
      `--verbose=${LOG_VERBOSE}`,
      `--output-type=${SCAN_SUMMARY_OUTPUT_TYPE}`,
      `--log-level=${LOG_LEVEL}`,
    ];

    if (API) options.push(`--api=${API}`);

    if (ENABLE_GITHUB_ACTION_TOKEN) {
      options.push(`--enable-github-action-token=true`);
    } else if (API_KEY && API_SECRET) {
      options.push(`--api-key=${API_KEY}`, `--api-secret=${API_SECRET}`);
    } else if (GCP_CREDENTIALS_SERVICE_ACCOUNT) {
      options.push(`--gcp-service-account=${GCP_CREDENTIALS_SERVICE_ACCOUNT}`);
    }

    // Command specific options
    const command_options = [];
    if (COMMAND === "scan") {
      core.info(`Scanning repository ${repoName}`);
      command_options.unshift(`scan`);
      get_scan_options(command_options);
    } else {
      command_options.unshift(`artifact sign`);
      get_sign_options(command_options);
    }

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
    await exec.exec(endorctl_command, options, scanOptions);

    core.info("${COMMAND} completed successfully!");

    if (COMMAND === "scan") {
      if (!scanResult) {
        core.info("No vulnerabilities found for given filters.");
      }

      if (
        EXPORT_SCAN_RESULT_ARTIFACT &&
        SCAN_SUMMARY_OUTPUT_TYPE === "json" &&
        scanResult
      ) {
        await uploadArtifact(scanResult);
      }
    }
  } catch {
    core.setFailed("Endorctl ${COMMAND} Failed");
  }
}

run();

export {};

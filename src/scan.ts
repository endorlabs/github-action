import * as fs from "fs";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";

import { EndorctlAvailableOS } from "./constants";
import {
  doYouHaveTheTime,
  getPlatformInfo,
  setupEndorctl,
  uploadArtifact,
} from "./utils";

// Scan options
function get_scan_options(options: any[]): void {
  const CI_RUN = core.getBooleanInput("ci_run"); // deprecated
  const CI_RUN_TAGS = core.getInput("ci_run_tags"); // deprecated
  const SCAN_PR = core.getBooleanInput("pr");
  const SCAN_PR_BASELINE = core.getInput("pr_baseline");
  const SCAN_TAGS = core.getInput("tags");
  const SCAN_DEPENDENCIES = core.getBooleanInput("scan_dependencies");
  const SCAN_TOOLS = core.getBooleanInput("scan_tools");
  const SCAN_SECRETS = core.getBooleanInput("scan_secrets");
  const SCAN_GIT_LOGS = core.getBooleanInput("scan_git_logs");
  const SCAN_PATH = core.getInput("scan_path");
  const ADDITIONAL_ARGS = core.getInput("additional_args");
  const PHANTOM_DEPENDENCIES = core.getBooleanInput("phantom_dependencies");

  const ADDITION_OPTIONS = ADDITIONAL_ARGS.split(" ");
  const SARIF_FILE = core.getInput("sarif_file");
  const ENABLE_PR_COMMENTS = core.getBooleanInput("enable_pr_comments");
  const GITHUB_TOKEN = core.getInput("github_token");
  const GITHUB_PR_ID = github.context.payload.pull_request?.number;

  const USE_BAZEL = core.getBooleanInput("use_bazel");
  const BAZEL_EXCLUDE_TARGETS = core.getInput("bazel_exclude_targets");
  const BAZEL_INCLUDE_TARGETS = core.getInput("bazel_include_targets");
  const BAZEL_TARGETS_QUERY = core.getInput("bazel_targets_query");

  if (!SCAN_DEPENDENCIES && !SCAN_SECRETS && !SCAN_TOOLS) {
    core.error(
      "At least one of `scan_dependencies`, `scan_secrets` or `scan_tools` must be enabled"
    );
  }
  if (SCAN_DEPENDENCIES) {
    options.push(`--dependencies=true`);
  }
  if (SCAN_TOOLS) {
    options.push(`--tools=true`);
  }
  if (SCAN_SECRETS) {
    options.push(`--secrets=true`);
  }
  if (PHANTOM_DEPENDENCIES) {
    options.push(`--phantom-dependencies=true`);
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
    const SCAN_OUTPUT_FILE = core.getInput("output_file");

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
    const options = [
      `--namespace=${NAMESPACE}`,
      `--verbose=${LOG_VERBOSE}`,
      `--log-level=${LOG_LEVEL}`,
    ];

    if (API) options.push(`--api=${API}`);

    options.push(`--output-type=${SCAN_SUMMARY_OUTPUT_TYPE}`);

    if (ENABLE_GITHUB_ACTION_TOKEN) {
      options.push(`--enable-github-action-token=true`);
    } else if (API_KEY && API_SECRET) {
      options.push(`--api-key=${API_KEY}`, `--api-secret=${API_SECRET}`);
    } else if (GCP_CREDENTIALS_SERVICE_ACCOUNT) {
      options.push(`--gcp-service-account=${GCP_CREDENTIALS_SERVICE_ACCOUNT}`);
    }

    core.info(`Scanning repository ${repoName}`);
    options.unshift(`scan`);
    get_scan_options(options);

    let endorctl_command = `endorctl`;
    if (RUN_STATS) {
      // Wrap scan commmand in `time -v` to get stats
      let time_command = "";
      if (platform.os === EndorctlAvailableOS.Windows) {
        core.info("Timing is not supported on Windows runners");
      } else if (platform.os === EndorctlAvailableOS.Macos) {
        time_command = `/usr/bin/time`;
      } else if (platform.os === EndorctlAvailableOS.Linux) {
        time_command = `time`;
      } else {
        core.info("Timing not supported on this OS");
      }
      if (time_command.length > 0) {
        const have_time = await doYouHaveTheTime(time_command);
        if (have_time) {
          options.unshift("-v", endorctl_command);
          endorctl_command = time_command;
        } else {
          core.warning(`run_stats requested but couldn't find ${time_command}`);
        }
      }
    }

    // Run the command
    await exec.exec(endorctl_command, options, scanOptions);

    core.info("Scan completed successfully!");

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

    if (SCAN_OUTPUT_FILE && scanResult) {
      core.info(`Writing scan results to ${SCAN_OUTPUT_FILE}`);
      fs.writeFileSync(SCAN_OUTPUT_FILE, scanResult);
      core.info(`Writing to ${SCAN_OUTPUT_FILE} complete`);
      core.setOutput("results", SCAN_OUTPUT_FILE);
    }
  } catch (e) {
    if (e instanceof Error) {
      core.error(e);
    }
    core.setFailed(`Endorctl scan failed`);
  }
}

run();

export {};

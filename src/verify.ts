import * as core from "@actions/core";
import * as exec from "@actions/exec";

import { EndorctlAvailableOS } from "./constants";
import { getPlatformInfo, setupEndorctl } from "./utils";

// Verify options
function get_verify_options(options: any[]): void {
  const ARTIFACT_NAME = core.getInput("artifact_name");
  const CERTIFICATE_OIDC_ISSUER = core.getInput("certificate_oidc_issuer");

  if (!ARTIFACT_NAME) {
    core.setFailed(
      "artifact_name is required for the verify command and must be passed as an input from the workflow"
    );
    return;
  }

  options.push(`--name=${ARTIFACT_NAME}`);

  if (!CERTIFICATE_OIDC_ISSUER) {
    core.setFailed(
      "certificate_oidc_issuer is required and must be passed as an input from the workflow"
    );
    return;
  }

  options.push(`--certificate-oidc-issuer=${CERTIFICATE_OIDC_ISSUER}`);
}

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
    const options = [
      `--namespace=${NAMESPACE}`,
      `--verbose=${LOG_VERBOSE}`,
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
    command_options.unshift(`verify`);
    command_options.unshift(`artifact`);
    get_verify_options(command_options);

    options.unshift(...command_options);

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

    core.info("Verify completed successfully!");
  } catch {
    core.setFailed(`Endorctl verify failed`);
  }
}

run();

export {};

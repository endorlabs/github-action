# Endor Labs Repository GitHub Action

Endor Labs helps developers spend less time dealing with security issues and more time accelerating development through safe Open Source Software (OSS) adoption. Our Dependency Lifecycle Management™ Solution helps organizations maximize software reuse by enabling security and development teams to select, secure, and maintain OSS at scale.

The Endor Labs GitHub action may be used to repeatably integrate Endor Labs scanning or signing jobs into your CI pipelines.

## Required Parameters and Pre-requisites

The following pre-requisites are required for the Endor Labs GitHub action to successfully run:

- The GitHub action must be able to authenticate to the Endor Labs API. It may authenticate through either:
  - A GitHub organization or repository name used for keyless authentication (Default)
  - An Endor Labs API key and secret
  - A GCP service account with workload identity federation enabled associated with the runner
- The Endor Labs namespace to authenticate against
- Access to the Endor Labs API
- If you are using keyless authentication you will also need an authorization policy set in Endor Labs

## High Level Usage Steps

1. Setup authentication to Endor Labs
   1. **Recommended:** If you are using GitHub action keyless authentication you will need to set an authorization policy in Endor Labs to allow your organization or repository to authenticate.
   2. Users may also authenticate with a GCP service account setup for [keyless authentication from GitHub actions](https://cloud.google.com/blog/products/identity-security/enabling-keyless-authentication-from-github-actions) or an Endor Labs API key added as a repository secret.
2. Checkout your code
3. Install your build toolchain
4. Build your code
5. Scan or Sign with Endor Labs

### Example: scan a Java Application (keyless auth)

Below is an example workflow to scan with Endor Labs for a Java application using the recommended keyless authentication for GitHub actions:

```yaml
name: Endor Labs Example
on: push
jobs:
  build-and-scan:
    permissions:
      id-token: write # Write permission is required to request a json web token (JWT) to perform keyless authentication
      contents: read  # Required by actions/checkout@v3 to checkout a private repository
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v3
      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          distribution: 'microsoft'
          java-version: '17'
      - name: Compile Package
        run: mvn clean install
      - name: Scan with Endor Labs
        uses: endorlabs/github-action@v1.1.4
        with:
          namespace: "example"
```

### Example: sign a container image

Below is an example workflow to sign with Endor Labs:

```yaml
on: [push, workflow_dispatch]
name: build
jobs:
  ko-publish:
    name: Release ko artifact
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      packages: write
      contents: read
    steps:
      - uses: actions/setup-go@v4
        with:
          go-version: '1.20.x'
      - uses: actions/checkout@v3
      - uses: ko-build/setup-ko@v0.6
      - run: ko build
      - name: Login to the GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Publish
        run: KO_DOCKER_REPO=ghcr.io/endorlabs/hello-sign ko publish --bare github.com/endorlabs/hello-sign

      - name: Sign with Endor Labs
        uses: endorlabs/github-action/sign@1.1.4
        with:
           artifact_name: ghcr.io/endorlabs/hello-sign@sha256:8d6e969186b7f8b6ece93c353b1f0030428540de5305405e643611911f7bd34a
           namespace: "example"
```

### Example: deploy `endorctl` and use it in a shell script

Below is an example workflow to setup Endorctl within your github actions:

```yaml
on: [push, workflow_dispatch]
name: build
jobs:
  use-endorctl:
    name: Usage of Endorctl
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      packages: write
      contents: read
    steps:
      - name: Setup with Endor Labs
        uses: endorlabs/github-action/setup@1.1.4
        with:
          namespace: "example"
          enable_github_action_token: true

      - name: Use Endorctl
        run: |
          endorctl api list -r Project
```

## Supported Configuration Parameters

### Common parameters

The following input global parameters are supported for the Endor Labs GitHub action:

| Flags | Description |
| :-- | :-- |
| `api_key` | Set the API key used to authenticate with Endor Labs. |
| `api_secret` | Set the secret corresponding to the API key used to authenticate with Endor Labs. |
| `enable_github_action_token` | Set to `false` if you prefer to use another form of authentication over GitHub action OIDC tokens. (Default: `true`) |
| `endorctl_checksum` | Set to the checksum associated with a pinned version of endorctl. |
| `endorctl_version` | Set to a version of endorctl to pin this specific version for use. Defaults to the latest version. |
| `log_level` | Set the log level. (Default: `info`) |
| `log_verbose` | Set to `true` to enable verbose logging. (Default: `false`) |
| `namespace` | Set to the namespace of the project that you are working with. (Required) |
| `gcp_service_account` | Set the target service account for GCP based authentication. GCP authentication is only enabled if this flag is set. Cannot be used with `api_key`. |

### Scanning parameters

The following input parameters are also supported for the Endor Labs GitHub action when used for scanning:

| Flags | Description |
| :-- | :-- |
| `additional_args` | Use additional_args to add custom arguments to the endorctl scan command. |
| `bazel_exclude_targets` | Specify a a list of Bazel targets to exclude from scan. |
| `bazel_include_targets` | Specify a list of Bazel targets to scan. If `bazel_targets_include` is not set the `bazel_targets_query` value is used to determine with bazel targets to scan. |
| `bazel_targets_query` | Specify a bazel query to determine with Bazel targets to scan. Ignored if `bazel_targets_include` is set. |
| `enable_pr_comments` | Set to `true` to publish new findings as review comments. Must be set together with `pr` and `github_token`. Additionally, the `pull-requests: write` permissions must be set in the workflow. (Default: `false`) |
| `export_scan_result_artifact` | Set to `false` to disable the json scan result artifact export. (Default: `true`). Artifact name appears in step output named `scan_result` |
| `github_token` | Set the token used to authenticate with GitHub. Must be provided if `enable_pr_comments` is set to `true` |
| `phantom_dependencies` | Set to `true` to enable phantom dependency analysis. (Default: `false`) |
| `output_file` | Set a file to save the scan results to; use this in lieu of `export_scan_result_artifact` to save any scan results data to a file in the workspace for processing by others steps in the same job, instead of the workflow run log. |
| `pr_baseline` | Set to the git reference that you are merging to, such as the default branch. Enables endorctl to compare findings so developers are only alerted to issues un the current changeset. Example: `pr_baseline: "main"`. Note: Not needed if `enable_pr_comments` is set to `true`. |
| `pr` | Set to `false` to track this scan as a monitored version within Endor Labs, as opposed to a point in time policy and finding test for a PR. (Default: `true`) |
| `run_stats` | Set to `false` to disable reporting of CPU/RAM/time scan statistics via `time -v` (may be required on Windows runners). (Default: `true`) |
| `sarif_file` | Set to a location on your GitHub runner to output the findings in SARIF format. |
| `scan_dependencies` | Scan git commits and generate findings for all dependencies. (Default: `true`) |
| `scan_git_logs` | Perform a more complete and detailed scan of secrets in the repository history. Must be used together with `scan_secrets`. (Default: `false`) |
| `scan_github_actions` | Scan source code repository for github actions used in workflow files to analyze vulnerabilities and malware. (Default: `false`) |
| `scan_path` | Set the path to the directory to scan. (Default: `.`) |
| `scan_secrets` | Scan source code repository and generate findings for secrets. See also `scan_git_logs`. (Default: `false`) |
| `scan_sast` | Scan source code repository and generate SAST findings. (Default: `false`) |
| `scan_summary_output_type` | Set the desired output format to `table`, `json`, `yaml`, or `summary`. (Default: `json`) |
| `scan_tools` | Scan source code repository for CI/CD tools. (Default: `false`) |
| `tags` | Specify a list of user-defined tags to add to this scan. Tags can be used to search and filter scans later. |
| `use-bazel` | Enable the usage of Bazel for the scan. (Default: `false`)|
| `scan_package` | Scan a specified artifact or a package. The path to an artifact must be set with `scan_path`. (Default: `false`)|
| `scan_container` | Scan a specified container image. The image must be set with `image` and a project can be defined with `project_name`. (Default: `false`)|
| `project_name` | Specify a project name for a container image scan or for a package scan.|
| `image` | Specify a container image to scan.|
| `disable_code_snippet_storage` | Set to `true` to disable storing or displaying of the source code snippet related to a finding. (Default: `false`) |


### Artifact Signing parameters

The following input parameters are also supported for the Endor Labs GitHub action when used for build artifact signing. The new "sign" action should be used: endorlabs/github-action/sign@version.

| Flags | Required | Description |
| :-- | :-- | :-- |
| `artifact_name` | Mandatory | Set to the name of the artifact to be signed |
| `source_repository_ref` | Optional | Set to the repository ref that the build run was based upon, e.g. `ref/tags/v1.0.1`|
| `certificate_oidc_issuer` | Optional | Set to the OIDC issuer of the token expected in the certificate, e.g. `https://token.actions.githubusercontent.com` |

Note that the above optional parameters are required only if `enable_github_action_token` is explicitly set to false. If set to true, which is the default value, both optional parameters as well as many others, are automatically populated by GitHub and are given to Endor Labs in the form of token claims.

### Artifact Verifying parameters

The following input parameters are also supported for the Endor Labs GitHub action when used for build artifact verification. The new `verify` action should be used: endorlabs/github-action/verify@version

| Flags | Required | Description |
| :-- | :-- | :-- |
| `artifact_name` | Mandatory | Set to the name of the artifact to be verified |
| `certificate_oidc_issuer` | Mandatory | Set to the OIDC issuer of the token expected in the certificate, e.g. `https://token.actions.githubusercontent.com` |

## Alternative Authentication Methods

If you are not using keyless authentication for GitHub actions, you should ensure that you do not provide `id-token: write` permissions to your GitHub token unless required by another step in this job. You must also set `enable_github_action_token: false` in your Endor Labs GitHub action configuration.

Below is an example configuration using an Endor Labs API key:

```yaml
      - name: Scan with Endor Labs
        uses: endorlabs/github-action@v1.1.4
        with:
          namespace: "example"
          api_key: ${{ secrets.ENDOR_API_CREDENTIALS_KEY }}
          api_secret: ${{ secrets.ENDOR_API_CREDENTIALS_SECRET }}
          enable_github_action_token: false
```

Below is an example configuration using a GCP service account for keyless authentication to Endor Labs:

```yaml
      - name: Scan with Endor Labs
        uses: endorlabs/github-action@v1.1.4
        with:
          namespace: "example"
          gcp_service_account: "<Insert_Your_Service_Account>@<Insert_Your_Project>.iam.gserviceaccount.com"
          enable_github_action_token: false
```

## Example workflow

The below example is what a complete configuration may look like in your CI environment. Your configuration will vary based on your unique build steps and needs.

```yaml
name: Endor Labs Scan
on:
  push:
    branches: [ main ]
  pull:
    branches: [ main ]
jobs:
  ci-commons-demo-scan:
    permissions:
      id-token: write # Required for requesting the JWT
      contents: read  # Required by actions/checkout@v3 to checkout a private repository
      pull-requests: write # Required for endorctl to write pr comments
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v3
      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          distribution: 'microsoft'
          java-version: '17'
      - name: Endor Labs Scan Pull Request
        if: github.event_name == 'pull_request'
        uses: endorlabs/github-action@v1.1.4
        with:
          namespace: "example" # Replace with your Endor Labs tenant namespace
          enable_pr_comments: true # Enable endorctl to write pr comments
          github_token: ${{ secrets.GITHUB_TOKEN }} # Required for endorctl to write pr comments
          scan_dependencies: true
          scan_secrets: true
          pr: true
          scan_summary_output_type: "table"
          tags: "actor=${{ github.actor }},run-id=${{ github.run_id }}"
```

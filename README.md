# Endor Labs Repository Scan Action

Endor Labs helps developers spend less time dealing with security issues and more time accelerating development through safe Open Source Software (OSS) adoption. Our Dependency Lifecycle Management™ Solution helps organizations maximize software reuse by enabling security and development teams to select, secure, and maintain OSS at scale.

The Endor Labs GitHub action may be used to repeatably integrate Endor Labs scanning jobs into your CI pipelines.

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
5. Scan with Endor Labs

Below is an example workflow to scan with Endor Labs for a Java application using the recommended keyless authentication for GitHub actions:

```yaml
name: Endor Labs Example
on: push
jobs:
  build-and-scan:
    permissions:
      id-token: write # Write permission is required to request a JWT token to perform keyless authentication
      contents: read  # Required by actions/checkout@v3 to checkout a private repository.
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
        uses: endorlabs/github-action@v1.1.1
        with:
          namespace: "example"
```

## Supported Configuration Parameters

The following input parameters are supported for the Endor Labs GitHub action:

| Flags | Description |
| :-- | :-- |
| `additional_args` | Use additional_args to add custom arguments to the endorctl scan command. |
| `api_key` | Set the API key used to authenticate with Endor Labs. |
| `api_secret` | Set the secret corresponding to the API key used to authenticate with Endor Labs. |
| `enable_github_action_token` | Set to `false` if you prefer to use another form of authentication over GitHub action OIDC tokens. (Default: `true`) |
| `enable_pr_comments` | Set to `true` to publish new findings as review comments. Must be set together with `pr` and `github_token`. Additionally, the `issues: write` and `pull-requests: write` permissions must be set in the workflow. (Default: `false`) |
| `endorctl_checksum` | Set to the checksum associated with a pinned version of endorctl. |
| `endorctl_version` | Set to a version of endorctl to pin this specific version for use. Defaults to the latest version. |
| `export_scan_result_artifact` | Set to `false` to disable the json scan result artifact export. (Default: `true`) |
| `gcp_service_account` | Set the target service account for GCP based authentication. GCP authentication is only enabled if this flag is set. Cannot be used with `api_key`. |
| `github_token` | Set the token used to authenticate with GitHub. Must be provided if `enable_pr_comments` is set to `true` |
| `log_level` | Set the log level. (Default: `info`) |
| `log_verbose` | Set to `true` to enable verbose logging. (Default: `false`) |
| `namespace` | Set to the namespace of the project that you are working with. (Required) |
| `pr` | Set to `false` to track this scan as a monitored version within Endor Labs, as opposed to a point in time policy and finding test for a PR. (Default: `true`) |
| `pr_baseline` | Set to the git reference that you are merging to, such as the default branch. Enables endorctl to compare findings so developers are only alerted to issues un the current changeset. Example: `pr_baseline: "main"`. Note: Not needed if `enable_pr_comments` is set to `true`. |
| `run_stats` | Set to `false` to disable reporting of CPU/RAM/time scan statistics via `time -v` (may be required on Windows runners). (Default: `true`) |
| `sarif_file` | Set to a location on your GitHub runner to output the findings in SARIF format. |
| `scan_dependencies` | Scan git commits and generate findings for all dependencies. (Default: `true`) |
| `scan_git_logs` | Perform a more complete and detailed scan of secrets in the repository history. Must be used together with `scan_secrets`. (Default: `false`) |
| `scan_secrets` | Scan source code repository and generate findings for secrets. See also `scan_git_logs`. (Default: `false`) |
| `scan_summary_output_type` | Set the desired output format to `table`, `json`, `yaml`, or `summary`. (Default: `json`) |
| `tags` | Specify a list of user-defined tags to add to this scan. Tags can be used to search and filter scans later. |

## Alternative Authentication Methods

If you are not using keyless authentication for GitHub actions, you should ensure that you do not provide `id-token: write` permissions to your GitHub token unless required by another step in this job. You must also set `enable_github_action_token: false` in your Endor Labs GitHub action configuration.

Below is an example configuration using an Endor Labs API key:

```yaml
      - name: Scan with Endor Labs
        uses: endorlabs/github-action@v1.1.1
        with:
          namespace: "example"
          api_key: ${{ secrets.ENDOR_API_CREDENTIALS_KEY }}
          api_secret: ${{ secrets.ENDOR_API_CREDENTIALS_SECRET }}
          enable_github_action_token: false
```

Below is an example configuration using a GCP service account for keyless authentication to Endor Labs:

```yaml
      - name: Scan with Endor Labs
        uses: endorlabs/github-action@v1.1.1
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
      id-token: write # This is required for requesting the JWT
      contents: read  # Required by actions/checkout@v3 to checkout a private repository
      pull-requests: write # for dorny/paths-filter to read pull requests and endorctl to write pr comments
      issues: write        # for endorctl to write pr comments
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
        uses: endorlabs/github-action@v1.1.1
        with:
          namespace: "example" # Replace with your Endor Labs tenant namespace
          enable_pr_comments: true
          github_token: ${{ secrets.GITHUB_TOKEN }} # needed for enable_pr_comments
          scan_dependencies: true
          scan_secrets: true
          pr: true
          scan_summary_output_type: "table"
          tags: "actor=${{ github.actor }},run-id=${{ github.run_id }}"
```

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

```
name: Endor Labs Example
on: push
jobs:
  build-and-scan:
    permissions:
      id-token: write   # Write permission is required to request a JWT token to perform keyless authentication
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
        uses: endorlabs/github-action@main
        with:
          namespace: "example"
```

## Supported Configuration Parameters

The following input parameters are supported configurations for the Endor Labs GitHub action:

| Flags                                 |  Description                       |
|---------------------------------------|------------------------------------|
| `namespace`                           | Set to your Endor Labs namespace (Required) |
| `endorctl_version`                    | Set to a specified version of endorctl to pin this specific version for use. If this is not used, then the latest version of endorctl will be downloaded for use |
| `endorctl_checksum`                   | Set to the checksum associated with a pinned version of endorctl. |
| `log_verbose`                         | Set to `true` to enable verbose logging mode |
| `log_level`                           | Set to `debug` to enable debug logging or `error` to enable error logging only. Defaults to info |
| `scan_summary_output_type`            | Set the desired output format of the summary to `table`, `json`, or `yaml`. Defaults to `table` |
| `sarif_file`                          | Set to a location on your GitHub runner to output the findings in SARIF format |
| `ci_run`                              | Set to `false` to track this scan as a monitored version within Endor Labs |
| `ci_run_tags`                         | Set searchable tags to search and query your CI run scans |
| `run_stats`                           | Set to `false` to disable run statistics via `time -v` (may be required on Windows runners, e.g.) |
| `enable_github_action_token`          | Set to `false` if you prefer to use another form of authentication over GitHub OIDC |
| `export_scan_result_artifact`         | Set to `false` to skip exporting the json scan result as an artifact. Defaults to true |
|  `api_key`                            | Set to your Endor Labs API key ID |
|  `api_secret`                         | Set to your Endor Labs API key secret |
| `gcp_service_account`                 | Set to the GCP service account used for keyless authentication. This may not be used in conjunction with your API key   |
| `additional_args`                     | Use additional_args to add custom arguments to your endorctl scan command |


## Alternative Authentication Methods:

If you are not using keyless authentication for GitHub actions, you should ensure that you do not provide `id-token: write` permissions to your GitHub token unless required by another step in this job. You must also set `enable_github_action_token: "false"` in your Endor Labs GitHub action configuration.

Below is an example configuration using an Endor Labs API key:

```
      - name: Scan with Endor Labs
        uses: endorlabs/github-action@main
        with:
          namespace: "example"
          api_key: ${{ secrets.ENDOR_API_CREDENTIALS_KEY }}
          api_secret: ${{ secrets.ENDOR_API_CREDENTIALS_SECRET }}
          enable_github_action_token: "false"
```

Below is an example configuration using a GCP service account for keyless authentication to Endor Labs:

```
      - name: Scan with Endor Labs
        uses: endorlabs/github-action@main
        with:
          namespace: "example"
          gcp_service_account: "<Insert_Your_Service_Account>@<Insert_Your_Project>.iam.gserviceaccount.com"
          enable_github_action_token: "false"
```

## Example workflow

The below example is what a complete configuration may look like in your CI environment. Your configuration will vary based on your unique build steps and needs.

```
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
        uses: endorlabs/github-action@main
        with:
          namespace: "example"
          scan_summary_output_type: "table"
          ci_run: "true"
      - name: Endor Labs Scan Push to main
        if: github.event_name == 'push'
        uses: endorlabs/github-action@main
        with:
          namespace: "example"
          scan_summary_output_type: "table"
          ci_run: "false"
```

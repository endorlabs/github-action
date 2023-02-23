# Endor Labs Repository Scan Action

Endor Labs helps developers spend less time dealing with security issues and more time accelerating development through safe Open Source Software (OSS) adoption. Our Dependency Lifecycle Management™ Solution helps organizations maximize software reuse by enabling security and development teams to select, secure, and maintain OSS at scale.

The Endor Labs GitHub action may be used to repeatably integrate Endor Labs scanning jobs into your CI pipelines.

## Required Parameters and Pre-requisites

The following pre-requisites are required for the Endor Labs GitHub action to successfully run:

- The GitHub action must be able to authenticate to the Endor Labs API. It may authenticate through either:
  - An Endor Labs API key and secret
  - A GCP service account with workload identity federation enabled associated with the runner
- The Endor Labs namespace to authenticate against
- Access to the Endor Labs API

Here is an example of using Endor Labs as a scan step in a job with these pre-requisites:

```
      - name: Example step to scan with Endor Labs
        uses: endorlabs/github-action@main
        with:
          api_key: ${{ secrets.ENDOR_API_KEY }}
          api_secret: ${{ secrets.ENDOR_API_SECRET }}
          namespace: "testing-tenant"
```

## High Level Usage Steps

1. Setup authentication to Endor Labs
   1. If you are using an API Key and Secret add these as repository secrets
   2. You may also use a GCP service account setup for [keyless authentication from GitHub actions](https://cloud.google.com/blog/products/identity-security/enabling-keyless-authentication-from-github-actions).
2. Checkout your code
3. Install your build toolchain
4. Build your code
5. Scan with Endor Labs

Below is an example workflow to scan with Endor Labs for a Java application.

```
name: Endor Labs Example
on: push
jobs:
  scan:
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
          api_key: ${{ secrets.ENDOR_API_KEY }}
          api_secret: ${{ secrets.ENDOR_API_SECRET }}
          namespace: "example"
```
## Supported Configuration Parameters

The following input parameters are supported configurations for the Endor Labs GitHub action:

| Flags                                 |  Description                       |
|---------------------------------------|------------------------------------|
|  `api_key`                            |  Set to your Endor Labs API key ID |
|  `api_secret`                         |  Set to your Endor Labs API key secret |
| `gcp_service_account`                 |  Set to the GCP service account used for keyless authentication. This may not be used in conjunction with your API key   |
| `namespace`                           | Set to your Endor Labs namespace (Required) |
| `endorctl_version`                    | Set to a specified version of endorctl to pin this specific version for use. If this is not used, then the latest version of endorctl will be downloaded for use |
| `endorctl_checksum`                   | Set to the checksum associated with a pinned version of endorctl. |
| `show_progress`                       | Set to true to show a progress bar for your Endor Labs scan. Defaults to false |
| `log_verbose`                         | Set to true to enable verbose logging mode |
| `log_level`                           | Set to debug to enable debug logging or error to enable error logging only. Defaults to info |
| `scan_summary_output_type`            | Set the desired output summary to table, json, or yaml |
| `ci_run`                              | Set to false to track this scan as a monitored version within Endor Labs |
| `ci_run_tags`                         | Set searchable tags to search and query your CI run scans |
| `additional_args`                     | Use additional this input to add custom arguments to your endorctl command |

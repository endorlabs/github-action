// Supported runner OS and ARCH; ref: https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners
export enum SupportedRunnerOS {
  Linux = "Linux",
  Windows = "Windows",
  Macos = "macOS",
}
export enum SupportedRunnerArch {
  Amd64 = "X64",
  Arm64 = "ARM64",
}

// OS and ARCH available with endorctl;
export enum EndorctlAvailableOS {
  Linux = "linux",
  Windows = "windows",
  Macos = "macos",
}
export enum EndorctlAvailableArch {
  Amd64 = "amd64",
  Arm64 = "arm64",
}

// map the runner OS and ARCH values to endorctl binary OS and ARCH values
export const RUNNER_TO_ENDORCTL_OS = {
  [SupportedRunnerOS.Linux]: EndorctlAvailableOS.Linux,
  [SupportedRunnerOS.Windows]: EndorctlAvailableOS.Windows,
  [SupportedRunnerOS.Macos]: EndorctlAvailableOS.Macos,
};
export const RUNNER_TO_ENDORCTL_ARCH = {
  [SupportedRunnerArch.Amd64]: EndorctlAvailableArch.Amd64,
  [SupportedRunnerArch.Arm64]: EndorctlAvailableArch.Arm64,
};

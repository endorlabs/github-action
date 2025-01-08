import { EndorctlAvailableArch, EndorctlAvailableOS } from "./constants";

export interface SetupProps {
  version: string;
  checksum: string;
  api: string;
}

export interface ServiceType {
  SHA: string;
  Version: string;
}

export interface ClientChecksumsType {
  ARCH_TYPE_LINUX_AMD64: string;
  ARCH_TYPE_LINUX_ARM64: string;
  ARCH_TYPE_MACOS_AMD64: string;
  ARCH_TYPE_MACOS_ARM64: string;
  ARCH_TYPE_WINDOWS_AMD64: string;
}

export interface VersionResponse {
  Service: ServiceType;
  ClientVersion: string;
  ClientChecksums: ClientChecksumsType;
}

export type PlatformInfo = {
  os?: EndorctlAvailableOS;
  arch?: EndorctlAvailableArch;
  error?: string;
};

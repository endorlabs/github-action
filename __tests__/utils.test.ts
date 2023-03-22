import type { ClientChecksumsType } from "../src/types";

import path from "node:path";
import {
  createHashFromFile,
  getEndorctlChecksum,
  getPlatformInfo,
} from "../src/utils";

describe("utils", () => {
  describe("createHashFromFile", () => {
    it.each<[filepath: string, expected: string]>([
      [
        "data/foo.txt",
        "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
      ],
      [
        "data/bar.txt",
        "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9",
      ],
    ])("createHashFromFile for %s is %o", async (filename, expected) => {
      const filepath = path.resolve(__dirname, filename);

      const result = await createHashFromFile(filepath);
      expect(result).toEqual(expected);
    });

    it.skip("Throws when provided file is not found", () => {
      const filepath = path.resolve(__dirname, "__non-existent__");
      return expect(createHashFromFile(filepath)).rejects.toThrow();
    });
  });

  describe("getEndorctlChecksum", () => {
    const fakeChecksums = new Proxy<ClientChecksumsType>(
      {} as ClientChecksumsType,
      { get: (_, property) => property }
    );

    it.each<[os: string, arch: string, expected: string]>([
      ["linux", "amd64", "ARCH_TYPE_LINUX_AMD64"],
      ["macos", "amd64", "ARCH_TYPE_MACOS_AMD64"],
      ["macos", "arm64", "ARCH_TYPE_MACOS_ARM64"],
      ["windows", "amd64", "ARCH_TYPE_UNSPECIFIED"],
    ])("getEndorctlChecksum for %s is %o", (os, arch, expected) => {
      const result = getEndorctlChecksum(fakeChecksums, os as any, arch as any);
      expect(result).toEqual(expected);
    });

    it.skip("Throws for unexpected os + arch", () => {
      expect(() =>
        getEndorctlChecksum(fakeChecksums, "foo" as any, "bar" as any)
      ).toThrow();
    });
  });

  describe("getPlatformInfo", () => {
    const BACKUP_ENV = process.env;

    beforeEach(() => {
      jest.resetModules(); // ensure jest cache is cleared
      process.env = { ...BACKUP_ENV }; // make shallow copy each run
    });

    afterAll(() => {
      process.env = BACKUP_ENV; // restore env
    });

    it.each<
      [
        os: string,
        arch: string,
        expected: { os: string; arch: string } | { error: true }
      ]
    >([
      ["Linux", "ARM64", { error: true }],
      ["Linux", "X64", { os: "linux", arch: "amd64" }],
      ["Linux", "X86", { error: true }],
      ["macOS", "X64", { os: "macos", arch: "amd64" }],
      ["macOS", "ARM64", { os: "macos", arch: "arm64" }],
      ["macOS", "X86", { error: true }],
      ["Windows", "ARM64", { error: true }],
      ["Windows", "X64", { os: "windows", arch: "amd64" }],
      ["Windows", "X86", { error: true }],
    ])("getPlatformInfo for %s is %o", (os, arch, expected) => {
      Object.assign(process.env, {
        RUNNER_ARCH: arch,
        RUNNER_OS: os,
      });

      const result = getPlatformInfo();

      if ("error" in expected) {
        expect(result).toEqual({
          error: expect.any(String),
        });
      } else {
        expect(result).toEqual(
          expect.objectContaining({ ...expected, error: undefined })
        );
      }
    });

    it.skip("Throws for unexpected os or arch", () => {
      Object.assign(process.env, {
        RUNNER_ARCH: "X86",
        RUNNER_OS: "Plan9",
      });

      expect(() => getPlatformInfo()).toThrow();
    });
  });
});

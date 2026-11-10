import * as core from "@actions/core";
import * as fs from "fs";
import * as httpm from "@actions/http-client";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import { pipeline } from "stream/promises";

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 429]);

class HttpStatusError extends Error {
  constructor(public readonly statusCode: number, url: string) {
    super(`Unexpected HTTP response: ${statusCode} from ${url}`);
  }
}

class GunzipError extends Error {}

export interface DownloadOptions {
  /** Seconds to wait between retries. Overridable for tests. */
  retryDelayMs?: () => number;
  /** Directory for the temporary file. Defaults to RUNNER_TEMP or the OS temp dir. */
  tempDir?: string;
}

const isRetryable = (status: number) =>
  status >= 500 || RETRYABLE_STATUS.has(status);

const defaultDelayMs = () => (10 + Math.random() * 10) * 1000;

const tempFilePath = (tempDir?: string) => {
  const dir = tempDir ?? process.env["RUNNER_TEMP"] ?? os.tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(
    dir,
    `endorctl-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
};

const attemptDownload = async (
  url: string,
  dest: string,
  acceptGzip: boolean
) => {
  const client = new httpm.HttpClient("endorlabs-github-action");
  const headers: Record<string, string> = {};
  if (acceptGzip) {
    headers["Accept-Encoding"] = "gzip";
  }
  const response = await client.get(url, headers);
  const status = response.message.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    response.message.resume();
    throw new HttpStatusError(status, url);
  }

  const encoding = String(
    response.message.headers["content-encoding"] ?? ""
  ).toLowerCase();
  const out = fs.createWriteStream(dest);
  if (encoding === "gzip") {
    core.info("Download is gzip-encoded; decompressing while writing");
    try {
      await pipeline(response.message, zlib.createGunzip(), out);
    } catch (error) {
      // Distinguish a corrupt stream from a network or disk error.
      if ((error as NodeJS.ErrnoException).code?.startsWith("Z_")) {
        throw new GunzipError(
          `Failed to decompress the endorctl download: ${
            (error as Error).message
          }`
        );
      }
      throw error;
    }
  } else {
    await pipeline(response.message, out);
  }
};

/**
 * Downloads `url` to a temp file and returns its path. Asks for gzip and
 * decodes it when the server honors that, so the returned file always holds
 * the raw bytes (callers verify the checksum of the decoded file). Retries 3
 * times on 5xx, 408, 429 and network errors, like tc.downloadTool. A corrupt
 * gzip stream is retried once without Accept-Encoding, then fails.
 */
export const downloadDecoded = async (
  url: string,
  options: DownloadOptions = {}
): Promise<string> => {
  const delay = options.retryDelayMs ?? defaultDelayMs;
  const dest = tempFilePath(options.tempDir);
  let acceptGzip = true;

  for (let attempt = 1; ; attempt++) {
    try {
      await attemptDownload(url, dest, acceptGzip);
      return dest;
    } catch (error) {
      fs.rmSync(dest, { force: true });
      if (error instanceof GunzipError) {
        if (!acceptGzip) {
          throw error;
        }
        core.warning(`${error.message}. Retrying without compression.`);
        acceptGzip = false;
        continue;
      }
      const retry =
        attempt < MAX_ATTEMPTS &&
        (!(error instanceof HttpStatusError) || isRetryable(error.statusCode));
      if (!retry) {
        throw error;
      }
      const wait = delay();
      core.info(
        `${(error as Error).message}. Retrying in ${Math.round(
          wait / 1000
        )} seconds (attempt ${attempt} of ${MAX_ATTEMPTS})`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
};

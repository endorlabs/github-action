import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
import { AddressInfo } from "net";

import { setupEndorctl } from "../src/utils";

jest.mock("@actions/core", () => ({
  ...jest.requireActual("@actions/core"),
  setFailed: jest.fn(),
  addPath: jest.fn(),
}));

const BINARY = Buffer.from("fake endorctl binary ".repeat(5000));
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const VERSION = "1.2.3";

type Handler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void | Promise<void>;

describe("setupEndorctl download", () => {
  let server: http.Server;
  let api: string;
  let handler: Handler;
  let requests: http.IncomingMessage[];
  let tmp: string;
  let cwd: string;
  const env = { ...process.env };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      requests.push(req);
      void handler(req, res);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  beforeEach(() => {
    requests = [];
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "endorctl-test-"));
    process.chdir(tmp);
    process.env["RUNNER_TEMP"] = path.join(tmp, "temp");
    process.env["ENDOR_JS_ENABLE_TSSERVER"] = "false";
    process.env["RUNNER_OS"] = "Linux";
    process.env["RUNNER_ARCH"] = "X64";
    jest.useRealTimers();
  });

  afterEach(() => {
    process.chdir(cwd);
    process.env = { ...env };
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const serve =
    (body: Buffer, gzip: boolean): Handler =>
    (req, res) => {
      if (gzip && String(req.headers["accept-encoding"]).includes("gzip")) {
        res.writeHead(200, { "Content-Encoding": "gzip" });
        res.end(zlib.gzipSync(body));
      } else {
        res.writeHead(200);
        res.end(body);
      }
    };

  const installed = () => fs.readFileSync(path.join(tmp, "endorctl"));
  const run = (checksum = sha(BINARY)) =>
    setupEndorctl({ version: VERSION, checksum, api } as never);

  it("decodes a gzip-encoded body and passes the checksum", async () => {
    handler = serve(BINARY, true);
    await run();
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(requests[0].headers["accept-encoding"]).toContain("gzip");
    expect(installed().equals(BINARY)).toBe(true);
  });

  it("accepts a raw body from an old server", async () => {
    handler = serve(BINARY, false);
    await run();
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(installed().equals(BINARY)).toBe(true);
  });

  it("fails when the decoded gzip body has the wrong checksum", async () => {
    handler = serve(Buffer.from("tampered"), true);
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("checksum") })
    );
    expect(fs.existsSync(path.join(tmp, "endorctl"))).toBe(false);
  });

  it("retries a corrupt gzip once without Accept-Encoding", async () => {
    handler = (req, res) => {
      if (req.headers["accept-encoding"]) {
        res.writeHead(200, { "Content-Encoding": "gzip" });
        res.end(Buffer.from("this is not gzip data at all"));
      } else {
        res.writeHead(200);
        res.end(BINARY);
      }
    };
    await run();
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    expect(requests[1].headers["accept-encoding"]).toBeUndefined();
    expect(installed().equals(BINARY)).toBe(true);
  });

  it("fails when gzip is corrupt even without Accept-Encoding", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Encoding": "gzip" });
      res.end(Buffer.from("this is not gzip data at all"));
    };
    await run();
    expect(requests).toHaveLength(2);
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("decompress"),
      })
    );
  });

  it("does not retry a 404", async () => {
    handler = (_req, res) => {
      res.writeHead(404);
      res.end();
    };
    await run();
    expect(requests).toHaveLength(1);
    expect(core.setFailed).toHaveBeenCalled();
  });

  it("retries a 503 and then succeeds", async () => {
    let n = 0;
    const ok = serve(BINARY, true);
    handler = (req, res) => {
      if (n++ === 0) {
        res.writeHead(503);
        res.end();
      } else {
        return ok(req, res);
      }
    };
    jest.spyOn(Math, "random").mockReturnValue(0);
    jest
      .spyOn(global, "setTimeout")
      .mockImplementation(((fn: () => void) => queueMicrotask(fn)) as never);
    await run();
    jest.restoreAllMocks();
    expect(requests).toHaveLength(2);
    expect(installed().equals(BINARY)).toBe(true);
  });

  it("replaces a pre-existing ./endorctl symlink without writing through it", async () => {
    const target = path.join(tmp, "victim");
    fs.writeFileSync(target, "original");
    fs.symlinkSync(target, path.join(tmp, "endorctl"));
    handler = serve(BINARY, true);
    await run();
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(fs.lstatSync(path.join(tmp, "endorctl")).isSymbolicLink()).toBe(
      false
    );
    expect(installed().equals(BINARY)).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("original");
  });
});

/**
 * The S3-compatible storage adapter (A-174) against an in-process fake that
 * speaks the parts of the S3 REST API Kampus uses, plus the signature itself
 * against the worked example in the AWS Signature Version 4 documentation.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PART_SIZE, S3Storage, s3ConfigFromEnv, signRequest } from "@/server/storage/s3";

interface Upload {
  parts: Map<number, Buffer>;
  contentType: string;
}

const objects = new Map<string, { data: Buffer; contentType: string }>();
const uploads = new Map<string, Upload>();
const requests: { method: string; url: string; auth: string }[] = [];
let server: Server;
let storage: S3Storage;

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://fake");
    requests.push({ method: req.method!, url: req.url!, auth: req.headers.authorization ?? "" });
    // Path style: /<bucket>/<key>
    const key = decodeURIComponent(url.pathname.replace(/^\/kampus-test\//, ""));
    const data = await body(req);
    const uploadId = url.searchParams.get("uploadId");
    const partNumber = url.searchParams.get("partNumber");
    if (req.method === "POST" && url.searchParams.has("uploads")) {
      const id = `up-${uploads.size + 1}`;
      uploads.set(id, { parts: new Map(), contentType: String(req.headers["content-type"]) });
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        `<InitiateMultipartUploadResult><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`,
      );
      return;
    }
    if (req.method === "PUT" && uploadId && partNumber) {
      uploads.get(uploadId)!.parts.set(Number(partNumber), data);
      res.writeHead(200, { etag: `"part-${partNumber}"` });
      res.end();
      return;
    }
    if (req.method === "POST" && uploadId) {
      const upload = uploads.get(uploadId)!;
      const listed = [
        ...data.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber><ETag>([^<]+)<\/ETag>/g),
      ];
      if (listed.some(([, n, etag]) => etag !== `"part-${n}"`)) {
        res.writeHead(400);
        res.end("<Error><Code>InvalidPart</Code></Error>");
        return;
      }
      const ordered = [...upload.parts.entries()].sort(([a], [b]) => a - b).map(([, p]) => p);
      objects.set(key, { data: Buffer.concat(ordered), contentType: upload.contentType });
      uploads.delete(uploadId);
      res.writeHead(200);
      res.end("<CompleteMultipartUploadResult/>");
      return;
    }
    if (req.method === "DELETE" && uploadId) {
      uploads.delete(uploadId);
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "PUT") {
      objects.set(key, { data, contentType: String(req.headers["content-type"]) });
      res.writeHead(200, { etag: '"x"' });
      res.end();
      return;
    }
    const object = objects.get(key);
    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204);
      res.end();
      return;
    }
    if (!object) {
      res.writeHead(404);
      res.end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    const headers = {
      "content-type": object.contentType,
      "content-length": String(object.data.length),
    };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ""));
    if (range) {
      const slice = object.data.subarray(Number(range[1]), Number(range[2]) + 1);
      res.writeHead(206, { ...headers, "content-length": String(slice.length) });
      res.end(slice);
      return;
    }
    res.writeHead(200, headers);
    res.end(object.data);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  storage = new S3Storage({
    endpoint: `http://127.0.0.1:${port}`,
    region: "fsn1",
    bucket: "kampus-test",
    accessKey: "AKIATEST",
    secretKey: "secret",
    forcePathStyle: true,
  });
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("S3 storage", () => {
  const key = "photos/0123456789abcdef0123456789abcdef.png";

  it("puts, reads, measures and deletes an object, signing every request", async () => {
    const stored = await storage.put(key, new Uint8Array([1, 2, 3, 4]), "image/png");
    expect(stored).toEqual({ key, contentType: "image/png", size: 4 });
    expect(await storage.size(key)).toBe(4);
    const read = await storage.get(key);
    expect(read?.contentType).toBe("image/png");
    expect(Array.from(read!.data)).toEqual([1, 2, 3, 4]);
    expect(await storage.get("photos/00000000000000000000000000000000.png")).toBeNull();
    expect(await storage.size("photos/00000000000000000000000000000000.png")).toBeNull();
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    for (const r of requests) {
      expect(r.url.startsWith("/kampus-test/photos/")).toBe(true);
      expect(r.auth).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/fsn1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]*host;[a-z0-9;-]*x-amz-date, Signature=[a-f0-9]{64}$/,
      );
    }
    await expect(storage.put("../etc/passwd", new Uint8Array(), "image/png")).rejects.toThrow(
      "Invalid storage key",
    );
  });

  it("uploads a stream in multipart pieces and serves byte ranges of it", async () => {
    const video = "recordings/abcdefabcdefabcdefabcdefabcdefab.webm";
    const total = PART_SIZE + 1000;
    const chunk = new Uint8Array(64 * 1024).map((_, i) => i % 251);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= total) return controller.close();
        const piece = chunk.subarray(0, Math.min(chunk.length, total - sent));
        sent += piece.length;
        controller.enqueue(piece);
      },
    });
    const stored = await storage.putStream(video, stream, "video/webm", total);
    expect(stored.size).toBe(total);
    expect(await storage.size(video)).toBe(total);
    expect(requests.filter((r) => r.url.includes("partNumber=")).length).toBe(2);
    const range = await storage.getRange(video, 10, 19);
    expect(range).toMatchObject({ start: 10, end: 19, size: total, contentType: "video/webm" });
    const bytes = new Uint8Array(await new Response(range!.stream).arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(chunk.subarray(10, 20)));
    const tail = await storage.getRange(video, total - 3);
    expect(tail).toMatchObject({ start: total - 3, end: total - 1 });
    expect((await new Response(tail!.stream).arrayBuffer()).byteLength).toBe(3);
    expect(await storage.getRange("recordings/00000000000000000000000000000000.webm")).toBeNull();
  });

  it("aborts an upload that grows past the limit and leaves nothing behind", async () => {
    const video = "recordings/00000000000000000000000000000001.webm";
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
        controller.close();
      },
    });
    await expect(storage.putStream(video, stream, "video/webm", 1000)).rejects.toThrow("TOO_LARGE");
    expect(uploads.size).toBe(0);
    expect(await storage.size(video)).toBeNull();
    expect(requests.at(-2)).toMatchObject({ method: "DELETE" });
  });
});

describe("signature and configuration", () => {
  it("matches the GET Object example of the AWS Signature Version 4 documentation", () => {
    const signed = signRequest(
      {
        endpoint: "https://s3.amazonaws.com",
        region: "us-east-1",
        bucket: "examplebucket",
        accessKey: "AKIAIOSFODNN7EXAMPLE",
        secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        forcePathStyle: false,
      },
      {
        method: "GET",
        key: "test.txt",
        headers: { range: "bytes=0-9" },
        payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        now: new Date("2013-05-24T00:00:00Z"),
      },
    );
    expect(signed.url).toBe("https://examplebucket.s3.amazonaws.com/test.txt");
    expect(signed.headers.authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("reads the S3 settings from the environment only when the driver is s3", () => {
    expect(s3ConfigFromEnv({})).toBeNull();
    expect(s3ConfigFromEnv({ STORAGE_DRIVER: "local", S3_BUCKET: "x" })).toBeNull();
    expect(() => s3ConfigFromEnv({ STORAGE_DRIVER: "s3", S3_BUCKET: "x" })).toThrow("S3_ENDPOINT");
    expect(
      s3ConfigFromEnv({
        STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://fsn1.your-objectstorage.com/",
        S3_BUCKET: "kampus",
        S3_ACCESS_KEY: "a",
        S3_SECRET_KEY: "b",
        S3_FORCE_PATH_STYLE: "true",
      }),
    ).toEqual({
      endpoint: "https://fsn1.your-objectstorage.com",
      region: "us-east-1",
      bucket: "kampus",
      accessKey: "a",
      secretKey: "b",
      forcePathStyle: true,
    });
  });
});

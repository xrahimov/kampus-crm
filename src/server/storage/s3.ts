import { createHash, createHmac } from "node:crypto";

import { STORAGE_KEY_PATTERN, type Storage, type StoredFile, type StoredRange } from "./storage";

/*
 * S3-compatible object storage (A-174): Hetzner Object Storage, MinIO, AWS S3
 * or any service that speaks the S3 REST API with Signature Version 4. Written
 * against `fetch` and node:crypto, so the server carries no SDK. Large uploads
 * (lesson recordings) go up in multipart pieces as they arrive.
 */

export interface S3Config {
  /** `https://fsn1.your-objectstorage.com`, `https://s3.eu-central-1.amazonaws.com`, `http://minio:9000`. */
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** `endpoint/bucket/key` instead of `bucket.endpoint/key`; needed by MinIO and most self-hosted services. */
  forcePathStyle: boolean;
}

/** Multipart pieces of this size; S3 wants at least 5 MiB per part except the last. */
export const PART_SIZE = 8 * 1024 * 1024;
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

/** Reads `S3_*` from the environment; null when object storage is not configured. */
export function s3ConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): S3Config | null {
  if ((env.STORAGE_DRIVER ?? "local").toLowerCase() !== "s3") return null;
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const accessKey = env.S3_ACCESS_KEY?.trim();
  const secretKey = env.S3_SECRET_KEY?.trim();
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error(
      "STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY",
    );
  }
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: env.S3_REGION?.trim() || "us-east-1",
    bucket,
    accessKey,
    secretKey,
    forcePathStyle: /^(1|true|yes)$/i.test(env.S3_FORCE_PATH_STYLE ?? ""),
  };
}

const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Uint8Array | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding as S3 wants it in canonical URIs and query strings. */
function uriEncode(value: string, keepSlash = false): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return keepSlash ? encoded.replace(/%2F/g, "/") : encoded;
}

/** `20130524T000000Z` and `20130524`. */
function amzDate(now: Date): { dateTime: string; date: string } {
  const dateTime = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { dateTime, date: dateTime.slice(0, 8) };
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Signs one request with AWS Signature Version 4 (the "Authorization" header
 * form). `payloadHash` is the SHA-256 of the body, or UNSIGNED-PAYLOAD for a
 * stream whose hash is not known up front (allowed over HTTPS).
 */
export function signRequest(
  config: S3Config,
  input: {
    method: string;
    key: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    payloadHash: string;
    now?: Date;
  },
): SignedRequest {
  const base = new URL(config.endpoint);
  const host = config.forcePathStyle ? base.host : `${config.bucket}.${base.host}`;
  const path = `${config.forcePathStyle ? `/${uriEncode(config.bucket)}` : ""}/${uriEncode(input.key, true)}`;
  const query = Object.entries(input.query ?? {})
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalQuery = query.map(([k, v]) => `${k}=${v}`).join("&");
  const { dateTime, date } = amzDate(input.now ?? new Date());
  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": dateTime,
  };
  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = signedNames.join(";");
  const canonicalRequest = [
    input.method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", dateTime, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretKey}`, date), config.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const { host: _host, ...sendHeaders } = headers;
  return {
    url: `${base.protocol}//${host}${path}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
    headers: { ...sendHeaders, authorization },
  };
}

export class S3Storage implements Storage {
  constructor(
    private readonly config: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private assertKey(key: string): void {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
  }

  private async send(
    method: string,
    key: string,
    options: {
      query?: Record<string, string>;
      headers?: Record<string, string>;
      body?: Uint8Array | string;
      /** Status codes that are an answer, not a failure (404 on a lookup). */
      accept?: number[];
    } = {},
  ): Promise<Response> {
    const body = options.body;
    const payloadHash =
      body === undefined ? EMPTY_SHA256 : sha256(typeof body === "string" ? body : body);
    const headers = { ...options.headers };
    if (body !== undefined) {
      headers["content-length"] = String(
        typeof body === "string" ? Buffer.byteLength(body) : body.byteLength,
      );
    }
    const signed = signRequest(this.config, {
      method,
      key,
      query: options.query,
      headers,
      payloadHash,
    });
    const response = await this.fetchImpl(signed.url, {
      method,
      headers: signed.headers,
      body: body as BodyInit | undefined,
    });
    if (!response.ok && !(options.accept ?? []).includes(response.status)) {
      const text = await response.text().catch(() => "");
      throw new Error(`S3 ${method} ${key} failed: ${response.status} ${text.slice(0, 300)}`);
    }
    return response;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredFile> {
    this.assertKey(key);
    await this.send("PUT", key, { headers: { "content-type": contentType }, body: data });
    return { key, contentType, size: data.byteLength };
  }

  async putStream(
    key: string,
    data: ReadableStream<Uint8Array>,
    contentType: string,
    maxBytes: number,
  ): Promise<StoredFile> {
    this.assertKey(key);
    const started = await this.send("POST", key, {
      query: { uploads: "" },
      headers: { "content-type": contentType },
    });
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await started.text())?.[1];
    if (!uploadId) throw new Error("S3 multipart upload without an UploadId");
    const etags: string[] = [];
    let size = 0;
    let buffered: Uint8Array[] = [];
    let bufferedBytes = 0;
    const reader = data.getReader();
    const flush = async () => {
      if (bufferedBytes === 0 && etags.length > 0) return;
      const part = concat(buffered, bufferedBytes);
      buffered = [];
      bufferedBytes = 0;
      const response = await this.send("PUT", key, {
        query: { partNumber: String(etags.length + 1), uploadId },
        body: part,
      });
      etags.push(response.headers.get("etag") ?? "");
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error("TOO_LARGE");
        buffered.push(value);
        bufferedBytes += value.byteLength;
        if (bufferedBytes >= PART_SIZE) await flush();
      }
      await flush();
      const xml = `<CompleteMultipartUpload>${etags
        .map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`)
        .join("")}</CompleteMultipartUpload>`;
      await this.send("POST", key, {
        query: { uploadId },
        headers: { "content-type": "application/xml" },
        body: xml,
      });
    } catch (error) {
      await this.send("DELETE", key, { query: { uploadId }, accept: [404] }).catch(() => undefined);
      throw error;
    }
    return { key, contentType, size };
  }

  async get(key: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    if (!STORAGE_KEY_PATTERN.test(key)) return null;
    const response = await this.send("GET", key, { accept: [404] });
    if (response.status === 404) return null;
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    if (!STORAGE_KEY_PATTERN.test(key)) return;
    await this.send("DELETE", key, { accept: [404] });
  }

  async size(key: string): Promise<number | null> {
    if (!STORAGE_KEY_PATTERN.test(key)) return null;
    const response = await this.send("HEAD", key, { accept: [404] });
    if (response.status === 404) return null;
    return Number(response.headers.get("content-length") ?? 0);
  }

  async getRange(key: string, start = 0, end?: number): Promise<StoredRange | null> {
    if (!STORAGE_KEY_PATTERN.test(key)) return null;
    const total = await this.size(key);
    if (total === null) return null;
    const contentType = "application/octet-stream";
    const last = Math.min(end ?? total - 1, total - 1);
    if (total === 0 || start > last) {
      const head = await this.send("HEAD", key);
      return {
        stream: new ReadableStream({ start: (c) => c.close() }),
        start,
        end: last,
        size: total,
        contentType: head.headers.get("content-type") ?? contentType,
      };
    }
    const response = await this.send("GET", key, { headers: { range: `bytes=${start}-${last}` } });
    return {
      stream: (response.body ??
        new ReadableStream({ start: (c) => c.close() })) as ReadableStream<Uint8Array>,
      start,
      end: last,
      size: total,
      contentType: response.headers.get("content-type") ?? contentType,
    };
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

import type { ObjectStorage, StoredObject } from "./types";

type S3Module = {
  S3Client: new (config: Record<string, unknown>) => {
    send: (command: unknown) => Promise<{ Body?: AsyncIterable<Uint8Array>; ContentType?: string }>;
  };
  PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  GetObjectCommand: new (input: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (input: Record<string, unknown>) => unknown;
};

let sdk: Promise<S3Module> | null = null;

function loadSdk(): Promise<S3Module> {
  const specifier = "@aws-sdk/client-s3";
  sdk ??= import(/* @vite-ignore */ specifier) as Promise<S3Module>;
  return sdk;
}

/**
 * S3-compatible store. R2 uses the same client with `S3_ENDPOINT` set.
 * The SDK loads only when this adapter is selected.
 */
export function s3Storage(): ObjectStorage {
  const bucket = process.env.S3_BUCKET?.trim() || "looktag-photos";
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const region = process.env.S3_REGION?.trim() || "auto";
  const publicBase = (process.env.STORAGE_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  let clientPromise: Promise<InstanceType<S3Module["S3Client"]>> | null = null;

  async function client() {
    clientPromise ??= (async () => {
      const mod = await loadSdk();
      return new mod.S3Client({
        region,
        endpoint,
        forcePathStyle: Boolean(endpoint),
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
        },
      });
    })();
    return clientPromise;
  }

  return {
    async put(key, body, contentType) {
      const mod = await loadSdk();
      const s3 = await client();
      await s3.send(
        new mod.PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async get(key): Promise<StoredObject | null> {
      const mod = await loadSdk();
      const s3 = await client();
      try {
        const result = await s3.send(new mod.GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!result.Body) return null;
        const chunks: Uint8Array[] = [];
        for await (const chunk of result.Body) chunks.push(chunk);
        const body = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { body, contentType: result.ContentType };
      } catch {
        return null;
      }
    },
    async delete(key) {
      const mod = await loadSdk();
      const s3 = await client();
      await s3.send(new mod.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    publicUrl(key) {
      if (publicBase) return `${publicBase}/${key}`;
      if (endpoint) return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
      return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    },
  };
}

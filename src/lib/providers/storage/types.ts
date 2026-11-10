export type StorageProviderName = "local" | "s3" | "r2";

export type StoredObject = {
  body: Uint8Array;
  contentType?: string;
  cacheControl?: string;
};

export type PutOptions = {
  /** Sent as Cache-Control. Look photos use a long immutable lifetime. */
  cacheControl?: string;
};

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType?: string, options?: PutOptions): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

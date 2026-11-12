import { storageFileResponse } from "../../src/lib/looks/storage-http";

interface StorageEvent {
  url: URL;
  req: { method: string };
}

/** Production (Nitro) twin of the Vite dev middleware for `/storage/*`. */
export default async function localStorageMiddleware(
  event: StorageEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  const response = await storageFileResponse(event.url.pathname);
  if (!response) return next();
  if (method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
  return response;
}

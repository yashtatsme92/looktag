/**
 * Shared live-preview OAuth client (server-only — NEVER import from the client).
 *
 * The broker accepts one preview client for any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`.
 * The id and secret are NOT in source. Set GROK_PREVIEW_CLIENT_ID and
 * GROK_PREVIEW_CLIENT_SECRET only when AUTH_PROVIDER=grok. The previous
 * hard-coded secret is in git history and should be rotated by the platform owner.
 */

export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;

export function readPreviewClient(env: {
  GROK_PREVIEW_CLIENT_ID?: string;
  GROK_PREVIEW_CLIENT_SECRET?: string;
} = process.env): { id: string; secret: string } {
  return {
    id: env.GROK_PREVIEW_CLIENT_ID?.trim() ?? "",
    secret: env.GROK_PREVIEW_CLIENT_SECRET?.trim() ?? "",
  };
}

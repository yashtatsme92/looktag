/**
 * Nitro host preset. Looktag is a Node server by default so it can ship to
 * any host (Fly, Railway, a VPS, Docker). Pass NITRO_PRESET to target a
 * specific provider, or rely on Vercel setting VERCEL=1 during its build.
 *
 *   NITRO_PRESET=node-server  (default — `node .output/server/index.mjs`)
 *   NITRO_PRESET=vercel
 *   NITRO_PRESET=bun | netlify | cloudflare_pages | ...
 */
export function resolveNitroPreset(env = process.env) {
  const explicit = String(env.NITRO_PRESET ?? "").trim();
  const preset = explicit || (env.VERCEL ? "vercel" : "node-server");
  const event = String(env.npm_lifecycle_event ?? "");
  if (env.LOOKTAG_LOG_NITRO_PRESET === "1" || event === "build") {
    console.log(`[nitro] preset ${preset}`);
  }
  return preset;
}

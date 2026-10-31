/**
 * Nitro host preset. Looktag is a Node server by default so Render
 * (`npm start` -> `node .output/server/index.mjs`) stays unchanged.
 *
 *   NITRO_PRESET  explicit, wins over everything
 *   VERCEL=1      -> vercel
 *   NETLIFY=true  -> netlify
 *   otherwise     -> node-server  (including RENDER=true)
 */
export function resolveNitroPreset(env = process.env) {
  const explicit = String(env.NITRO_PRESET ?? "").trim();
  if (explicit) return explicit;
  if (String(env.VERCEL ?? "") === "1") return "vercel";
  if (env.NETLIFY === "true") return "netlify";
  return "node-server";
}

/** PGLite wasm copy is mandatory for the Node server and unused on Netlify. */
export function shouldCopyPgliteAssets(env = process.env) {
  const preset = resolveNitroPreset(env);
  return preset !== "netlify" && preset !== "netlify-edge" && preset !== "netlify-static";
}

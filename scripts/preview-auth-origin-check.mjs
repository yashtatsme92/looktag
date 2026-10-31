/**
 * Child process for preview-runtime.test.ts.
 *
 * Loads Better Auth through Vite so `import.meta.glob` migrations apply, then
 * either expects startup to throw when APP_ENV=preview has no BETTER_AUTH_SECRET,
 * or signs up and in from the BETTER_AUTH_URL origin.
 *
 *   node scripts/preview-auth-origin-check.mjs sign-in
 *   node scripts/preview-auth-origin-check.mjs missing-secret
 */
import { createServer } from "vite";

const mode = process.argv[2];
const forbidden = ["NETLIFY", "CONTEXT", "DEPLOY_PRIME_URL", "DEPLOY_URL", "DATABASE_URL"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const key of forbidden) {
  if (process.env[key]) fail(`unexpected ${key} in the runtime environment`);
}

if ((process.env.APP_ENV ?? "").trim() !== "preview") {
  fail("APP_ENV=preview is required");
}

const origin = process.env.BETTER_AUTH_URL?.trim();

function errorText(error) {
  const parts = [];
  let current = error;
  for (let i = 0; i < 6 && current; i += 1) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join("\n");
}

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

try {
  if (mode === "missing-secret") {
    if (process.env.BETTER_AUTH_SECRET?.trim()) fail("secret should be unset");
    try {
      await vite.ssrLoadModule("/src/lib/auth/server.ts");
      fail("server started without BETTER_AUTH_SECRET");
    } catch (error) {
      const text = errorText(error);
      if (!text.includes("BETTER_AUTH_SECRET is required when APP_ENV=preview")) {
        fail(text);
      }
      console.log("PREVIEW_SECRET_REQUIRED");
    }
  } else if (mode === "sign-in") {
    if (!origin) fail("BETTER_AUTH_URL is required");
    if (process.env.APP_URL?.trim() !== origin) fail("APP_URL must match BETTER_AUTH_URL");
    if (!process.env.BETTER_AUTH_SECRET?.trim()) fail("BETTER_AUTH_SECRET is required");
    const { auth } = await vite.ssrLoadModule("/src/lib/auth/server.ts");
    const { ensureDbReady } = await vite.ssrLoadModule("/src/lib/db.ts");
    await ensureDbReady();
    const email = `preview-origin-${Date.now()}@example.com`;
    const password = "correct-horse-battery-1";
    const call = (path, body) =>
      auth.handler(
        new Request(`${origin}${path}`, {
          method: "POST",
          headers: {
            origin,
            host: new URL(origin).host,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    const signUp = await call("/api/auth/sign-up/email", {
      email,
      password,
      name: "Preview Tester",
    });
    const signUpBody = await signUp.text();
    if (signUp.status !== 200 || signUpBody.includes("INVALID_ORIGIN")) {
      fail(`SIGN_UP ${signUp.status} ${signUpBody.slice(0, 600)}`);
    }
    console.log("SIGN_UP 200");
    const signIn = await call("/api/auth/sign-in/email", { email, password });
    const signInBody = await signIn.text();
    if (signIn.status !== 200 || signInBody.includes("INVALID_ORIGIN")) {
      fail(`SIGN_IN ${signIn.status} ${signInBody.slice(0, 600)}`);
    }
    console.log("SIGN_IN 200");
  } else {
    fail(`unknown mode ${mode}`);
  }
} finally {
  await Promise.race([
    vite.close(),
    new Promise((resolve) => {
      setTimeout(resolve, 5_000);
    }),
  ]);
}

process.exit(0);

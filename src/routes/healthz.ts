import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { productionConfigProblems } from "@/lib/providers/assert-env";
import { healthDegradedBody } from "@/lib/providers/config-error";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function appVersion(): string {
  const sha = process.env.LOOKTAG_GIT_SHA?.trim();
  if (sha && sha !== "unknown") return sha;
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const version = (JSON.parse(raw) as { version?: string }).version;
    if (version) return version;
  } catch {
    /* packaged without package.json */
  }
  return "unknown";
}

async function probe(): Promise<Response> {
  const problems = productionConfigProblems(process.env);
  if (problems.length > 0) {
    return new Response(healthDegradedBody(problems), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  try {
    const sql = await getSql();
    await Promise.race([
      sql`select 1 as ok`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    return new Response(JSON.stringify({ status: "ok", version: appVersion() }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({ status: "degraded", db: "down" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: () => probe(),
      HEAD: async () => {
        const response = await probe();
        return new Response(null, { status: response.status, headers: response.headers });
      },
    },
  },
});

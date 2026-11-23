import { createFileRoute } from "@tanstack/react-router";
import { consentCookieLines } from "@/lib/consent/cookies";
import { CONSENT_POLICY_VERSION, type ConsentBasis, type ConsentValue } from "@/lib/consent/policy";

const VALUES = new Set<ConsentValue>(["granted", "denied"]);
const BASES = new Set<ConsentBasis>(["explicit", "notice", "gpc"]);

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/consent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
        }
        let body: { value?: unknown; basis?: unknown } = {};
        try {
          body = (await request.json()) as { value?: unknown; basis?: unknown };
        } catch {
          body = {};
        }
        const value = typeof body.value === "string" ? body.value : "";
        const basis = typeof body.basis === "string" ? body.basis : "";
        if (!VALUES.has(value as ConsentValue) || !BASES.has(basis as ConsentBasis)) {
          return new Response(JSON.stringify({ error: "invalid" }), {
            status: 400,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        const at = new Date().toISOString();
        const secure = new URL(request.url).protocol === "https:";
        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        for (const line of consentCookieLines({
          value: value as ConsentValue,
          basis: basis as ConsentBasis,
          at,
          secure,
        })) {
          headers.append("set-cookie", line);
        }
        return new Response(
          JSON.stringify({
            value,
            basis,
            at,
            version: CONSENT_POLICY_VERSION,
          }),
          { status: 200, headers },
        );
      },
    },
  },
});

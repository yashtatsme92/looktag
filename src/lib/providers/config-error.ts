import { problemNames, type EnvProblem } from "./assert-env.ts";

const DOC = "docs/SELF_HOSTING.md";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function configErrorJson(problems: EnvProblem[]): string {
  return JSON.stringify({
    status: "configuration_error",
    missing: problems.filter((item) => item.problem === "missing").map((item) => item.name),
    invalid: problems.filter((item) => item.problem === "invalid").map((item) => item.name),
    doc: DOC,
  });
}

export function configErrorHtml(problems: EnvProblem[]): string {
  const items = problems
    .map((item) => `<li><code>${escapeHtml(item.name)}</code> is ${item.problem}</li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Looktag configuration error</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#f4f4f4;color:#141414}
  main{max-width:36rem;margin:10vh auto;padding:1.5rem}
  h1{font-size:1.5rem;font-weight:560}
  code{font-family:ui-monospace,monospace}
  a{color:#141414}
</style>
</head>
<body>
<main>
  <h1>Configuration error</h1>
  <p>Looktag is up, but required settings are missing or invalid. Nothing was started against an in-memory database.</p>
  <ul>${items}</ul>
  <p>See <code>${DOC}</code> in the repository. This page lists variable names only.</p>
</main>
</body>
</html>`;
}

export function configErrorBody(problems: EnvProblem[], accept: string | null): { body: string; contentType: string } {
  if (accept && accept.includes("text/html")) {
    return { body: configErrorHtml(problems), contentType: "text/html; charset=utf-8" };
  }
  return { body: configErrorJson(problems), contentType: "application/json; charset=utf-8" };
}

export function healthDegradedBody(problems: EnvProblem[]): string {
  return JSON.stringify({
    status: "degraded",
    db: problemNames(problems).includes("DATABASE_URL") || problemNames(problems).includes("DB_PROVIDER") ? "down" : "unconfigured",
    missing: problemNames(problems),
  });
}

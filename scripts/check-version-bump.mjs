import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function requireVersionBump(baseVersion, currentVersion) {
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  const base = semver.exec(baseVersion ?? "");
  const current = semver.exec(currentVersion ?? "");

  if (!base || !current) {
    throw new Error("package.json versions must use semver major.minor.patch format");
  }

  const baseParts = base.slice(1).map(BigInt);
  const currentParts = current.slice(1).map(BigInt);
  const comparison = currentParts.findIndex((part, index) => part !== baseParts[index]);
  if (comparison < 0 || currentParts[comparison] < baseParts[comparison]) {
    throw new Error(`package.json version must be greater than the base version (${baseVersion})`);
  }
}

function main(baseRef) {
  if (!baseRef) throw new Error("Pass the pull request base commit as the first argument");

  const basePackage = JSON.parse(execFileSync("git", ["show", `${baseRef}:package.json`], { encoding: "utf8" }));
  const currentPackage = JSON.parse(readFileSync("package.json", "utf8"));
  requireVersionBump(basePackage.version, currentPackage.version);
  console.log(`package.json version bumped: ${basePackage.version} → ${currentPackage.version}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

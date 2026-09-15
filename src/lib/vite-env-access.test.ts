/**
 * Regression coverage for Vite client environment access.
 *
 * Vite's build-time replacement only rewrites statically identifiable
 * `import.meta.env.VITE_*` member access. Bracket access survives into the
 * bundle as a runtime lookup against an object that has no such key, which is
 * how the public Turnstile sitekey silently disappeared in the preview build
 * and the widget reported itself "not configured".
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe("client environment access", () => {
  const files = sourceFiles(SRC);

  it("never reads VITE_* variables through bracket access", () => {
    const offenders = files.filter((file) =>
      /import\.meta\.env\[\s*["'`]VITE_/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("reads the public Turnstile sitekey with statically replaceable access", () => {
    const source = readFileSync(join(SRC, "components/public/turnstile.tsx"), "utf8");
    expect(source).toContain("import.meta.env.VITE_TURNSTILE_SITE_KEY");
  });

  it("keeps the Turnstile secret and private salts out of client-reachable code", () => {
    const clientReachable = files.filter((file) => !/\.server\.tsx?$|\.test\.tsx?$/.test(file));
    const secrets = [
      "TURNSTILE_SECRET_KEY",
      "PUBLIC_IP_HASH_SALT",
      "PUBLIC_FINGERPRINT_SALT",
      "NEWSLETTER_TOKEN_SALT",
    ];
    const leaks = clientReachable.filter((file) => {
      const source = readFileSync(file, "utf8");
      return secrets.some((secret) => source.includes(secret));
    });
    expect(leaks).toEqual([]);
  });

  it("keeps Turnstile siteverify on the server boundary only", () => {
    const offenders = files.filter(
      (file) =>
        !file.endsWith(".server.ts") &&
        !/\.test\.tsx?$/.test(file) &&
        readFileSync(file, "utf8").includes("turnstile/v0/siteverify"),
    );
    expect(offenders).toEqual([]);
  });
});

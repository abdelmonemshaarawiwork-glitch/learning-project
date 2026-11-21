import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Netlify's function runtime does not allow require() of ES modules. The server
 * dependencies must load without it (regression: jwks-rsa → jose 6 broke every API route).
 */
describe("server dependencies load without require(esm)", () => {
  it("firebase-admin/app, /auth and /firestore load as CommonJS", () => {
    const out = execFileSync(
      process.execPath,
      [
        "--no-experimental-require-module",
        "-e",
        'require("firebase-admin/app"); require("firebase-admin/auth"); require("firebase-admin/firestore"); console.log("ok")',
      ],
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("ok");
  });
});


import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";

describe("Website QA Inspector integration", () => {
  it("detects a broken link and mobile overflow on the local test site", async () => {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "node_modules/tsx/dist/cli.mjs",
          "src/index.ts",
          "http://127.0.0.1:8080",
        ],
        { shell: false }
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", reject);

      child.on("close", () => {
        resolve(stdout + stderr);
      });
    });

    expect(output).toContain("[PASS] HTTP status: 200");
    expect(output).toContain("Link returned 404");
    expect(output).toContain("[FAIL] Mobile layout");
    expect(output).toContain("HTML report saved:");
  }, 30000);
});

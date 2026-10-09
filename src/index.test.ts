
import { describe, expect, it } from "vitest";
import { checkHttpStatus, checkMobileLayout } from "./checks";

describe("checkHttpStatus", () => {
  it("passes for HTTP 200", () => {
    expect(checkHttpStatus(200).status).toBe("PASS");
  });

  it("passes for HTTP 301", () => {
    expect(checkHttpStatus(301).status).toBe("PASS");
  });

  it("fails for HTTP 404", () => {
    expect(checkHttpStatus(404).status).toBe("FAIL");
  });

  it("fails for HTTP 500", () => {
    expect(checkHttpStatus(500).status).toBe("FAIL");
  });
});

describe("checkMobileLayout", () => {
  it("passes when the page fits the viewport", () => {
    expect(checkMobileLayout(375, 375, true).status).toBe("PASS");
  });

  it("fails when the page is wider than the viewport", () => {
    expect(checkMobileLayout(740, 375, true).status).toBe("FAIL");
  });

  it("warns when the page did not load successfully", () => {
    expect(checkMobileLayout(740, 375, false).status).toBe("WARN");
  });
});

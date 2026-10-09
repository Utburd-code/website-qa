
export type CheckStatus = "PASS" | "FAIL" | "WARN";

export type Check = {
  status: CheckStatus;
  title: string;
  details: string;
};

export function checkHttpStatus(status: number): Check {
  const passed = status >= 200 && status < 400;

  return {
    status: passed ? "PASS" : "FAIL",
    title: "HTTP status",
    details: String(status),
  };
}

export function checkMobileLayout(
  pageWidth: number,
  viewportWidth: number,
  pageLoadedSuccessfully: boolean
): Check {
  if (!pageLoadedSuccessfully) {
    return {
      status: "WARN",
      title: "Mobile layout",
      details: "Skipped because the page returned an unsuccessful HTTP status",
    };
  }

  const hasOverflow = pageWidth > viewportWidth;

  return {
    status: hasOverflow ? "FAIL" : "PASS",
    title: "Mobile layout",
    details: hasOverflow
      ? `Page width: ${pageWidth}px; viewport: ${viewportWidth}px`
      : "No horizontal overflow detected",
  };
}


import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkHttpStatus, checkMobileLayout } from "./checks";

type CheckStatus = "PASS" | "FAIL" | "WARN";

type Check = {
  status: CheckStatus;
  title: string;
  details: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function main() {
  const inputUrl = process.argv[2];

  if (!inputUrl) {
    console.error("Usage: npx tsx src/index.ts https://example.com");
    process.exitCode = 1;
    return;
  }

  let url: URL;

  try {
    url = new URL(inputUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsupported protocol");
    }
  } catch {
    console.error("Invalid URL. Use an http:// or https:// address.");
    process.exitCode = 1;
    return;
  }

  const checks: Check[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedImages: string[] = [];

  const addCheck = (
    status: CheckStatus,
    title: string,
    details: string
  ) => checks.push({ status, title, details });

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });

    // Собираем ошибки браузера и неудачные запросы изображений.
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    page.on("requestfailed", (request) => {
      if (request.resourceType() === "image") {
        failedImages.push(request.url());
      }
    });

    console.log("\n=== Website QA Inspector ===");
    console.log(`URL: ${url.href}`);
    console.log("Viewport: 375 x 812\n");

    // Открываем сайт.
    const response = await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const status = response?.status() ?? 0;
    const httpCheck = checkHttpStatus(status);

    addCheck(
      httpCheck.status,
      httpCheck.title,
      httpCheck.details
    );

    console.log(
      httpCheck.status === "PASS"
        ? `[PASS] HTTP status: ${status}`
        : `[FAIL] HTTP status: ${status || "No response"}`
    );

    // Проверяем внутренние ссылки.
    const links = await page.locator("a[href]").evaluateAll((elements) =>
      elements.map((element) => (element as HTMLAnchorElement).href)
    );

    const uniqueLinks = [...new Set(links)].filter((href) => {
      try {
        const linkUrl = new URL(href);

        return (
          ["http:", "https:"].includes(linkUrl.protocol) &&
          linkUrl.origin === url.origin
        );
      } catch {
        return false;
      }
    });

    const linksToCheck = uniqueLinks.filter((link) => {
      try {
        return new URL(link).href !== url.href;
      } catch {
        return false;
      }
    });

    console.log(`\nInternal links found: ${uniqueLinks.length}`);

    for (const link of linksToCheck.slice(0, 30)) {
      try {
        const linkResponse = await page.request.get(link, {
          timeout: 10000,
          maxRedirects: 5,
        });

        const linkStatus = linkResponse.status();
        const passed = linkStatus < 400;

        addCheck(
          passed ? "PASS" : "FAIL",
          "Internal link",
          `${linkStatus} — ${link}`
        );

        console.log(
          `${passed ? "[PASS]" : "[FAIL]"} Link returned ${linkStatus}: ${link}`
        );
      } catch {
        addCheck(
          "FAIL",
          "Internal link",
          `Could not access: ${link}`
        );

        console.log(`[FAIL] Could not access link: ${link}`);
      }
    }

    // Проверяем изображения, которые не загрузились.
    const brokenImages = await page.locator("img").evaluateAll((images) =>
      images
        .filter((image) => {
          const img = image as HTMLImageElement;
          return img.complete && img.naturalWidth === 0;
        })
        .map((image) => (image as HTMLImageElement).src)
    );

    addCheck(
      brokenImages.length ? "FAIL" : "PASS",
      "Broken images",
      brokenImages.length
        ? brokenImages.join("\n")
        : "No broken images detected"
    );

    for (const image of brokenImages) {
      console.log(`[FAIL] Image did not load: ${image}`);
    }

    // Учитываем неудачные сетевые запросы изображений.
    addCheck(
      failedImages.length ? "FAIL" : "PASS",
      "Failed image requests",
      failedImages.length
        ? failedImages.join("\n")
        : "No failed image requests"
    );

    // Проверяем горизонтальное переполнение на мобильном экране.
    const overflow = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));

    const mobileCheck = checkMobileLayout(
      overflow.pageWidth,
      overflow.viewportWidth,
      status >= 200 && status < 400
    );

    addCheck(
      mobileCheck.status,
      mobileCheck.title,
      mobileCheck.details
    );

    console.log(
      `[${mobileCheck.status}] ${mobileCheck.title}: ${mobileCheck.details}`
    );

    // Проверяем ошибки консоли и JavaScript.
    addCheck(
      consoleErrors.length ? "FAIL" : "PASS",
      "Browser console",
      consoleErrors.length
        ? consoleErrors.join("\n")
        : "No console errors"
    );

    addCheck(
      pageErrors.length ? "FAIL" : "PASS",
      "JavaScript exceptions",
      pageErrors.length
        ? pageErrors.join("\n")
        : "No JavaScript exceptions"
    );

    console.log(`\nConsole errors: ${consoleErrors.length}`);
    consoleErrors.forEach((error) => console.log(`  ${error}`));

    console.log(`JavaScript exceptions: ${pageErrors.length}`);
    pageErrors.forEach((error) => console.log(`  ${error}`));

    console.log("\n=== Scan finished ===");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    addCheck("FAIL", "Scan execution", message);
    console.error("Scan failed:", message);
  } finally {
    await browser.close();
  }

  // Формируем HTML-отчёт.
  const failedCount = checks.filter(
    (check) => check.status === "FAIL"
  ).length;

  const passedCount = checks.filter(
    (check) => check.status === "PASS"
  ).length;

  const warningCount = checks.filter(
    (check) => check.status === "WARN"
  ).length;

  const rows = checks
    .map(
      (check) => `
        <tr>
          <td class="${check.status.toLowerCase()}">${check.status}</td>
          <td>${escapeHtml(check.title)}</td>
          <td><pre>${escapeHtml(check.details)}</pre></td>
        </tr>`
    )
    .join("");

  const report = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Website QA Inspector Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1100px;
      margin: 40px auto;
      padding: 0 20px;
      color: #222;
    }
    h1 { margin-bottom: 8px; }
    .url { overflow-wrap: anywhere; color: #555; }
    .summary {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin: 24px 0;
    }
    .metric {
      padding: 14px 18px;
      border: 1px solid #ddd;
      border-radius: 8px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #ddd;
      vertical-align: top;
    }
    th { background: #f5f5f5; }
    .pass { color: #16803c; font-weight: bold; }
    .fail { color: #c62828; font-weight: bold; }
    .warn { color: #9a6700; font-weight: bold; }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: inherit;
      margin: 0;
    }
  </style>
</head>
<body>
  <h1>Website QA Inspector</h1>
  <p class="url">Website: ${escapeHtml(url.href)}</p>
  <p>Viewport: 375 × 812 | Generated: ${escapeHtml(new Date().toLocaleString())}</p>
  <div class="summary">
    <div class="metric">PASS: <strong>${passedCount}</strong></div>
    <div class="metric">FAIL: <strong>${failedCount}</strong></div>
    <div class="metric">WARN: <strong>${warningCount}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Check</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const reportPath = resolve(process.cwd(), "report.html");

  writeFileSync(reportPath, report, "utf8");

  console.log(`\nHTML report saved: ${reportPath}`);
  console.log(
    `Results: ${passedCount} PASS, ${failedCount} FAIL, ${warningCount} WARN`
  );

  process.exitCode = failedCount > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exitCode = 1;
});

# Website QA Inspector

A lightweight website quality inspection tool built with TypeScript and Playwright.

## Features

- HTTP status validation
- Internal link checking
- Broken image detection
- Mobile horizontal overflow detection
- Browser console error collection
- JavaScript exception collection
- HTML report generation

## Requirements

- Node.js 22 or later
- npm

## Installation

    npm install
    npx playwright install chromium

## Usage

    npx tsx src/index.ts https://example.com

The HTML report is saved as `report.html`.

## Testing

    npm run test:unit
    npm run test:integration
    npm run test:all

The integration test checks whether the inspector detects a broken link and mobile layout overflow on a local test site.

## Limitations

- Scans a single page rather than crawling the entire website.
- Checks up to 30 internal links.
- Uses a fixed mobile viewport of 375 × 812.
- Results may require manual review to distinguish actual defects from false positives.

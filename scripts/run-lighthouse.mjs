// scripts/run-lighthouse.mjs
// Simple programmable Lighthouse runner invoked via `npm run audit:lighthouse`
// Usage (powershell): $env:AUDIT_URL="http://localhost:3000"; npm run audit:lighthouse
// Optional env: AUDIT_CATEGORIES=performance,accessibility,seo,best-practices
// Produces JSON summary of category scores to stdout.

import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

async function run() {
  const url = process.env.AUDIT_URL || 'http://localhost:3000';
  const categoriesRaw = process.env.AUDIT_CATEGORIES?.trim();
  const categories = categoriesRaw ? categoriesRaw.split(',').map(c => c.trim()).filter(Boolean) : undefined;

  const chrome = await launch({ chromeFlags: ['--headless', '--disable-gpu'] });
  let result;
  try {
    result = await lighthouse(url, { port: chrome.port, onlyCategories: categories });
  } finally {
    await chrome.kill();
  }

  const scores = Object.fromEntries(
    Object.entries(result.lhr.categories).map(([key, val]) => [key, val.score])
  );

  const output = {
    requestedUrl: result.lhr.requestedUrl,
    finalUrl: result.lhr.finalDisplayedUrl || result.lhr.finalUrl,
    fetchTime: result.lhr.fetchTime,
    scores,
    warnings: result.lhr.runWarnings,
    lighthouseVersion: result.lhr.lighthouseVersion
  };

  console.log(JSON.stringify(output, null, 2));
}

run().catch(err => {
  console.error('Lighthouse audit failed:', err);
  process.exit(1);
});

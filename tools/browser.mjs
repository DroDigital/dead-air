// Shared Playwright loader for the browser tools (playtest, scenarios, shot).
// Playwright is deliberately not a project dependency. Install it once, without touching package.json:
//   npm i --no-save playwright && npx playwright install chromium
// If it lives somewhere else, put its node_modules folder on NODE_PATH.
import { createRequire } from 'node:module';

let playwright;
try {
  playwright = createRequire(import.meta.url)('playwright');
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') throw err;
  console.error('Playwright is not installed. Run:\n  npm i --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

export const { chromium } = playwright;

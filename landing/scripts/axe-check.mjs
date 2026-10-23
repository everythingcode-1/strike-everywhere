const playwrightPath =
  process.env.PLAYWRIGHT_PATH ??
  "file:///C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
import { writeFile } from "node:fs/promises";
import path from "node:path";

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    "C:/Users/HP/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe",
  headless: true,
});

async function scan(name, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto("http://localhost:4000", { waitUntil: "networkidle" });
  await page.addScriptTag({ path: path.resolve("node_modules/axe-core/axe.min.js") });
  const result = await page.evaluate(async () => {
    return await globalThis.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
  });
  await page.close();
  return {
    name,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    })),
    incomplete: result.incomplete.map((item) => item.id),
  };
}

const report = [
  await scan("desktop", { width: 1440, height: 1000 }),
  await scan("mobile", { width: 390, height: 844 }),
  await scan("narrow", { width: 320, height: 760 }),
];

await browser.close();
await writeFile(path.resolve("docs/screenshots/axe.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

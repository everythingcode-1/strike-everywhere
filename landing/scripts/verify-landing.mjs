const playwrightPath =
  process.env.PLAYWRIGHT_PATH ??
  "file:///C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve("docs/screenshots");
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ??
    "C:/Users/HP/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe",
  headless: true,
});

const errors = [];
const consoleErrors = [];

async function inspect(name, viewport, reducedMotion = false) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    deviceScaleFactor: 1,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${name}: ${message.text()}`);
  });

  await page.goto("http://localhost:4000", { waitUntil: "networkidle" });
  await page.waitForTimeout(reducedMotion ? 200 : 1400);
  await page.evaluate(async () => {
    const step = Math.max(320, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 400));
  });

  const report = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href^="#"]'));
    const missing = anchors
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href) => href && href !== "#" && !document.querySelector(href));
    const images = Array.from(document.images);
    const brokenImages = images
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.getAttribute("src"));
    return {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      h1: document.querySelectorAll("h1").length,
      h2: document.querySelectorAll("h2").length,
      jsonLd: Boolean(document.querySelector('script[type="application/ld+json"]')),
      anchors: anchors.length,
      missingAnchors: [...new Set(missing)],
      images: images.length,
      brokenImages,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyHeight: document.body.scrollHeight,
    };
  });

  await page.screenshot({
    path: path.join(out, `${name}-full.png`),
    fullPage: true,
  });
  await page.screenshot({
    path: path.join(out, `${name}-viewport.png`),
    fullPage: false,
  });

  return { report, page, context };
}

const desktop = await inspect("desktop", { width: 1440, height: 1000 });

const mobile = await inspect("mobile", { width: 390, height: 844 });

const narrow = await inspect("narrow", { width: 320, height: 760 });

await mobile.page.getByRole("button", { name: "Menu" }).click();
const menuVisible = await mobile.page.getByRole("navigation", { name: "Mobile" }).isVisible();
await mobile.page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "FAQ" }).click();
const menuClosedAfterLink = !(await mobile.page.getByRole("navigation", { name: "Mobile" }).isVisible());

await mobile.page.getByText("Does Strike Everywhere place orders?").click();
const faqOpen = await mobile.page
  .locator("details")
  .filter({ hasText: "Does Strike Everywhere place orders?" })
  .evaluate((node) => node.open);

await mobile.page.getByRole("link", { name: "Install", exact: true }).first().click();
const installVisible = await mobile.page.locator("#install").isVisible();

await desktop.page.getByRole("link", { name: "See the 30-day replay" }).click();
const riskVisible = await desktop.page.locator("#risk").isVisible();

await desktop.page.getByRole("button", { name: "Copy" }).click();
const copyButtonVisible = await desktop.page.getByRole("button", { name: "Copied" }).isVisible();
const clipboardText = await desktop.page.evaluate(() => navigator.clipboard.readText());

await browser.close();

const result = {
  desktop: desktop.report,
  mobile: mobile.report,
  narrow: narrow.report,
  checks: {
    menuVisible,
    menuClosedAfterLink,
    faqOpen,
    installVisible,
    riskVisible,
    copyButtonVisible,
    clipboardText,
  },
  errors,
  consoleErrors,
};

await writeFile(path.join(out, "verify.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

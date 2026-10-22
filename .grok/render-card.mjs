import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto("file:///workspace/.grok/og-card.html", { waitUntil: "load" });
await page.evaluate(async () => {
  await document.fonts.ready;
});
const faces = await page.evaluate(() =>
  [...document.fonts].map((f) => `${f.family} ${f.style} ${f.status}`),
);
console.log(faces.join("\n"));
await page.screenshot({
  path: "/workspace/.grok/card-raw.png",
  type: "png",
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});

const icon = await browser.newPage({
  viewport: { width: 64, height: 64 },
  deviceScaleFactor: 1,
});
await icon.setContent(
  `<style>html,body{margin:0;background:#fff}</style>` +
    `<img src="file:///workspace/.grok/favicon.svg.tmp" width="64" height="64" />`,
  { waitUntil: "load" },
);
await icon.screenshot({
  path: "/workspace/.grok/favicon-64.png",
  type: "png",
  clip: { x: 0, y: 0, width: 64, height: 64 },
});

const tiny = await browser.newPage({
  viewport: { width: 16, height: 16 },
  deviceScaleFactor: 8,
});
await tiny.setContent(
  `<style>html,body{margin:0;background:#fff}</style>` +
    `<img src="file:///workspace/.grok/favicon.svg.tmp" width="16" height="16" />`,
  { waitUntil: "load" },
);
await tiny.screenshot({
  path: "/workspace/.grok/favicon-16.png",
  type: "png",
  clip: { x: 0, y: 0, width: 16, height: 16 },
});

await browser.close();
console.log("rendered");

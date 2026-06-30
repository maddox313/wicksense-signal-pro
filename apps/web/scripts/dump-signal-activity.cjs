const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/strategy-performance", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const raw = await page.evaluate(() => localStorage.getItem("wicksense-signal-activity"));
  if (!raw) {
    console.log(JSON.stringify({ error: "NO_LOCAL_STORAGE_DATA", totalRejected: 0, rejected: [] }));
    await browser.close();
    return;
  }
  const records = JSON.parse(raw);
  const rejected = records.filter((r) => r.strategy === "ema-crossover" && r.kind === "rejected");
  console.log(JSON.stringify({ totalRejected: rejected.length, rejected }, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});

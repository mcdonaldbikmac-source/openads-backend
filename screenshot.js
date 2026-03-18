const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 800 });
  await page.goto('https://piggy-bank-cbbtc.vercel.app/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000)); // wait for ad to fetch
  await page.screenshot({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/live_piggy_bank.png' });
  await browser.close();
  console.log("Screenshot saved!");
})();

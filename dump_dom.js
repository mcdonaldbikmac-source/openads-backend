const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 800 });
  await page.goto('https://piggy-bank-cbbtc.vercel.app/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  fs.writeFileSync('piggy_bank_dom.html', html);
  await browser.close();
  console.log("DOM saved to piggy_bank_dom.html");
})();

const puppeteer = require('puppeteer');

async function run() {
    console.log("Launching headless browser to organically visit Piggy Bank...");
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Visit the user's miniapp organically
    await page.goto("https://piggy-bank-cbbtc.vercel.app/", { waitUntil: 'networkidle2' });
    console.log("Visited Piggy Bank. Organic SDK telemetry should have fired to the Vercel backend!");
    
    // Wait a few seconds for the pulse to complete
    await new Promise((r) => setTimeout(r, 4000));
    
    await browser.close();
    console.log("Organic simulation complete.");
}
run();

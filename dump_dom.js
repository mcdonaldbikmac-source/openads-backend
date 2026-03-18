const puppeteer = require('puppeteer');

async function run() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    try {
        await page.goto('http://localhost:3000/serve?publisher=0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B&placement=300x250-0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B&position=popup&preview=true', {waitUntil: 'networkidle0', timeout: 30000});
        await new Promise(r => setTimeout(r, 3000));
        const html = await page.content();
        console.log("------- EXTRACTED DOM -------");
        console.log(html);
        console.log("-----------------------------");
    } catch(e) {
        console.error(e);
    }
    await browser.close();
}
run();

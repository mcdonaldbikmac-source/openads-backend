const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 750 });
    
    // Inject mock authentication to reach the publisher dashboard
    await page.evaluateOnNewDocument(() => {
        localStorage.setItem('openads_auth', JSON.stringify({
            role: 'publisher',
            provider: 'web3_wallet',
            address: '0x1234567890123456789012345678901234567890',
            fid: '123'
        }));
    });

    await page.goto('http://localhost:3000/publisher.html', { waitUntil: 'networkidle0' });
    
    // Open the Add App Modal
    await page.evaluate(() => {
        const btn = document.getElementById('btnOpenAddAppModal');
        if (btn) btn.click();
    });
    
    await new Promise(r => setTimeout(r, 500)); // UI transition

    // Snapshot the modal specifically
    const modalElement = await page.$('#addAppModal > div.window');
    if (modalElement) {
        await modalElement.screenshot({ path: '/Users/jang-ujin/.gemini/antigravity/brain/5b5a9ec6-5974-4301-b346-e6a704a41d6a/ui_modal_clean.png' });
    }

    await browser.close();
    console.log("Snap taken successfully.");
})();

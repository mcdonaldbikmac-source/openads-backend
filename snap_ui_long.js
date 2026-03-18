const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const WALLET = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";

async function run() {
    console.log("Launching headless browser...");
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2 }); // iPhone X
    
    const artifactsDir = '/Users/jang-ujin/.gemini/antigravity/brain/5b5a9ec6-5974-4301-b346-e6a704a41d6a';

    console.log("1. Rendering Popup...");
    const popupHtml = `
      <html><body style="background:#f0f0f0; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family:sans-serif;">
        <div style="text-align:center;">
          <h3 style="color:#555;">300x250 Popup Test</h3>
          <iframe src="http://localhost:3000/serve?publisher=${WALLET}&placement=300x250-${WALLET}&position=popup&preview=true" width="300" height="250" style="border:none; margin:0 auto; display:block; box-shadow:0 10px 30px rgba(0,0,0,0.1);" frameborder="0" scrolling="no"></iframe>
        </div>
      </body></html>
    `;
    await page.setContent(popupHtml, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6000)); // Crucial to wait for slow dev recompile
    await page.screenshot({ path: path.join(artifactsDir, 'ui_popup_300x250.png') });

    console.log("2. Rendering Top Banner...");
    const bannerHtml = `
      <html><body style="background:#f0f0f0; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
        <div style="width:375px; height:812px; background:white; position:relative; box-shadow:0 0 20px rgba(0,0,0,0.1);">
           <div style="padding:40px 20px; font-family:sans-serif; text-align:center; color:#888;">Farcaster Mini App UI<br/><br/>(Top Banner Test)</div>
           <iframe src="http://localhost:3000/serve?publisher=${WALLET}&placement=320x50-${WALLET}&position=top&preview=true" width="320" height="50" style="border:none; position:absolute; top:20px; left:50%; transform:translateX(-50%); z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.1);" frameborder="0" scrolling="no"></iframe>
        </div>
      </body></html>
    `;
    await page.setContent(bannerHtml, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6000));
    await page.screenshot({ path: path.join(artifactsDir, 'ui_banner_320x50.png') });

    console.log("3. Rendering Floating Icon...");
    const floatingHtml = `
      <html><body style="background:#f0f0f0; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
        <div style="width:375px; height:812px; background:white; position:relative; box-shadow:0 0 20px rgba(0,0,0,0.1);">
           <div style="padding:40px 20px; font-family:sans-serif; text-align:center; color:#888;">Piggy Bank Start Screen<br/><br/>(Floating 64x64 Test)</div>
           <iframe src="http://localhost:3000/serve?publisher=${WALLET}&placement=64x64-${WALLET}&position=floating&preview=true" width="64" height="64" style="border:none; position:absolute; top:20px; right:20px; border-radius:50%; z-index:99999; box-shadow:0 4px 12px rgba(0,0,0,0.15);" frameborder="0" scrolling="no"></iframe>
        </div>
      </body></html>
    `;
    await page.setContent(floatingHtml, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6000));
    await page.screenshot({ path: path.join(artifactsDir, 'ui_floating_64x64.png') });

    await browser.close();
    console.log("Screenshots captured successfully!");
}

run().catch(console.error);

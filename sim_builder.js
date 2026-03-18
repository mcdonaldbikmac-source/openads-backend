require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const puppeteer = require('puppeteer');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log("1. Registering beautiful realistic ads into the API...");
  
  // Clean old test ads
  await supabase.from('campaigns').update({ status: 'completed' }).in('status', ['active']);

  // 1. Create a Realistic 300x250 Popup Ad
  const { data: ad300 } = await supabase.from('campaigns').insert({
    advertiser_wallet: '0x1234123412341234123412341234123412341234',
    creative_title: 'Base Network Bridge',
    creative_url: 'https://base.org',
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/GitHub_Invertocat_Logo.svg/300px-GitHub_Invertocat_Logo.svg.png',
    ad_type: '300x250',
    budget_wei: 5000000000,
    spend_wei: 0,
    cpm_rate_wei: 5000000,
    status: 'active'
  }).select();

  // 2. Create a Realistic 64x64 Floating Ad
  const { data: ad64 } = await supabase.from('campaigns').insert({
    advertiser_wallet: '0x1234123412341234123412341234123412341234',
    creative_title: 'Ethereum Logo',
    creative_url: 'https://ethereum.org',
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Ethereum_logo_2014.svg/64px-Ethereum_logo_2014.svg.png',
    ad_type: '64x64',
    budget_wei: 5000000000,
    spend_wei: 0,
    cpm_rate_wei: 5000000,
    status: 'active'
  }).select();
  
  console.log("Ads injected successfully.");
  
  const publisher = '0xb9a3faeb416580f4bc1c8f6e2d4773b580e9d18c';
  const iframePopup = `<iframe src="https://openads-backend.vercel.app/serve?publisher=${publisher}&position=popup&preview=true" style="position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); z-index:999999; border:none; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border-radius: 8px; background: #fff;" width="300" height="250" frameborder="0" scrolling="no"></iframe>`;
  const iframeFloating = `<iframe src="https://openads-backend.vercel.app/serve?publisher=${publisher}&position=floating&preview=true" style="position:fixed; top:20px; right:20px; z-index:999999; border:none;" width="64" height="64" frameborder="0" scrolling="no"></iframe>`;

  // Mobile HTML (Mini App)
  const mobileHtml = `
  <!DOCTYPE html><html><head>
  <style>
    body { font-family: -apple-system, sans-serif; background: #eee; margin: 0; padding: 0; display:flex; justify-content:center; }
    .app { width: 100vw; height: 100vh; max-width: 400px; background: #fff; position: relative; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
    .header { padding: 20px; text-align: center; border-bottom: 1px solid #ddd; font-weight: bold; font-size: 18px; }
    .content { padding: 20px; display:flex; flex-direction:column; gap: 20px; }
    .card { background: #f9f9f9; padding: 30px; border-radius: 12px; text-align: center; font-size: 24px; font-weight: bold; }
    .dimmer { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999998; }
  </style></head><body>
    <div class="app">
      <div class="header">🐷 Piggy Bank Mini-App</div>
      <div class="content">
        <div class="card">0.00034 CBBTC</div>
        <div class="card">0.125 DEGEN</div>
      </div>
      <!-- Dimmer for Popup -->
      <div class="dimmer"></div>
      
      <!-- INJECT ADS -->
      ${iframePopup}
      ${iframeFloating}
    </div>
  </body></html>`;

  // Desktop HTML (Web Blog)
  const desktopHtml = `
  <!DOCTYPE html><html><head>
  <style>
    body { font-family: -apple-system, sans-serif; background: #fafafa; margin: 0; padding: 0; display:flex; justify-content:center; }
    .wrap { width: 1000px; background: #fff; min-height: 100vh; padding: 50px; box-shadow: 0 0 30px rgba(0,0,0,0.05); position: relative; }
    h1 { font-size: 36px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    p { font-size: 18px; line-height: 1.6; color: #444; }
    .dimmer { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 999998; }
  </style></head><body>
    <div class="wrap">
      <h1>Welcome to OpenAds Publisher Site</h1>
      <p>This is a realistic desktop simulation. The 300x250 popup ad interrupts the user flow exactly in the center of the screen, while the 64x64 fixed icon remains persistently in the Top Right of the browser viewport.</p>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
      
      <!-- Dimmer for Popup -->
      <div class="dimmer"></div>
      
      <!-- INJECT ADS -->
      ${iframePopup}
      ${iframeFloating}
    </div>
  </body></html>`;

  fs.writeFileSync('sim_mobile.html', mobileHtml);
  fs.writeFileSync('sim_desktop.html', desktopHtml);

  console.log("2. Capturing Headless Chrome Screenshots...");
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Mobile Capture
  await page.setViewport({ width: 375, height: 812 });
  await page.goto('file://' + __dirname + '/sim_mobile.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: '/Users/jang-ujin/.gemini/antigravity/brain/5b5a9ec6-5974-4301-b346-e6a704a41d6a/mobile_sim.png' });

  // Desktop Capture
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('file://' + __dirname + '/sim_desktop.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: '/Users/jang-ujin/.gemini/antigravity/brain/5b5a9ec6-5974-4301-b346-e6a704a41d6a/desktop_sim.png' });

  await browser.close();
  console.log("Simulation complete!");
}
run();

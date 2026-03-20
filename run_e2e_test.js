const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runE2E() {
    console.log("=== PHASE 66: E2E ZERO-JS ARCHITECTURE STRESS TEST ===");
    console.log("[1] ADVERTISER: Creating an aggressive 300x250 Popup Campaign...");

    // Pause existing campaigns to isolate the test
    await supabase.from('campaigns').update({ status: 'paused' }).neq('status', 'paused');

    // Insert 300x250 campaign
    const { data: camp, error } = await supabase.from('campaigns').insert({
        advertiser_wallet: '0xTestAdvertiser',
        creative_title: 'E2E Validation Campaign (300x250)',
        ad_type: '300x250',
        creative_url: 'https://example.com/test',
        image_url: 'https://example.com/popup.png',
        budget_wei: '10000000000000000000', // 10 ETH
        spend_wei: '0',
        cpm_rate_wei: '5000000000000000', // 0.005 ETH CPM (High bid)
        status: 'active'
    }).select();

    if (error) {
        console.error("Failed to create campaign:", error);
        return;
    }
    console.log("   -> Campaign created successfully:", camp[0].name);

    console.log("\n[2] PUBLISHER BROWSER: Fetching /dynamic-css (No JS, Pure CSS Injection)");
    const cssRes = await fetch('http://localhost:3000/api/v1/serve/dynamic-css?publisher=0xTestPublisher');
    const cssBody = await cssRes.text();
    console.log("   -> CSS Response:");
    console.log(cssBody.split('\n').map(l => '      ' + l).join('\n'));

    console.log("\n[3] PUBLISHER BROWSER: Fetching /serve (Iframe HTML Content)");
    const pulseRes = await fetch('http://localhost:3000/serve?placement=responsive-0xTestPublisher&position=all');
    const pulseBody = await pulseRes.text();
    console.log("   -> Iframe HTML Response Snippet (first 300 chars):");
    console.log('      ' + pulseBody.substring(0, 300).replace(/\n/g, ' '));
    
    // Check if the pulse response actually renders the 300x250 ad image
    if (pulseBody.includes('https://example.com/popup.png') || pulseBody.includes('E2E Validation Campaign (300x250)')) {
        console.log("\n✅ SUCCESS: The /serve iframe correctly embedded the Advertiser's 300x250 image/payload.");
    } else {
        console.log("\n❌ FAIL: The 300x250 image was not found in the HTML skeleton.");
    }

    if (cssBody.includes('width: 100vw') && cssBody.includes('left: 50%') && cssBody.includes('top: 50%')) {
         console.log("✅ SUCCESS: The /dynamic-css endpoint perfectly morphed the parent HTML to fit the 300x250 Center Popup layout.");
    } else {
         console.log("❌ FAIL: The /dynamic-css did not output the 300x250 geometric coordinates.");
    }
}

runE2E();

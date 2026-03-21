const { createClient } = require('@supabase/supabase-js');
const http = require('http');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function makeJsonRequest(path, postData) {
    return new Promise((resolve) => {
        const payload = JSON.stringify(postData);
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }); }
                catch (e) { resolve({ status: res.statusCode, data }); }
            });
        });

        req.on('error', String);
        req.write(payload);
        req.end();
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log("==================================================");
    console.log("💰 OpenAds Publisher Yield Verification Script");
    console.log("==================================================\n");

    const publisherWallet = '0xTestAdminYieldWallet12345678901234567890';
    const advertiserWallet = '0xAdvPayerWalletXYZ123456789012345678901';
    const cpmUsdc = 5.0; // $5.00 eCPM

    console.log("[1] Setting up Mock Campaign & Approved Publisher Domain...");
    
    // Clear old data for deterministic testing
    await supabase.from('campaigns').delete().eq('advertiser_wallet', advertiserWallet);
    await supabase.from('apps').delete().eq('publisher_wallet', publisherWallet);
    await supabase.from('publishers').delete().eq('wallet', publisherWallet);

    await supabase.from('publishers').insert({ wallet: publisherWallet });

    const { data: pubApp, error: appErr } = await supabase.from('apps').insert({
        name: 'Yield Test App',
        domain: 'localhost',
        publisher_wallet: publisherWallet,
        logo_url: 'verified', // CRITICAL: Must be explicitly verified
        app_type: 'app|formats:300x250,64x64'
    }).select().single();

    if (appErr) throw new Error("Could not set up Publisher: " + JSON.stringify(appErr));

    const { data: camp, error: campErr } = await supabase.from('campaigns').insert({
        advertiser_wallet: advertiserWallet,
        creative_title: 'Yield Ad',
        ad_type: '300x250',
        creative_url: 'https://example.com',
        image_url: 'https://example.com/yield.png',
        budget_wei: '10000000', // 10.00 USDC
        spend_wei: '0',
        cpm_rate_wei: '5000000', // 5.00 USDC CPM
        status: 'active'
    }).select().single();

    if (campErr) throw new Error("Could not set up Campaign: " + JSON.stringify(campErr));

    console.log(`✅ Environment Ready. Initial Spend: $0.00`);

    console.log("\n[2] Triggering /serve/pulse Telemetry Event (Impression)");

    const crypto = require('crypto');
    const ts = Date.now();
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hmac = crypto.createHmac('sha256', secret).update(`${camp.id}:responsive-${publisherWallet}:${ts}`).digest('hex');
    const validToken = `${camp.id}:responsive-${publisherWallet}:${ts}:${hmac}`;

    const pulseRes = await makeJsonRequest('/api/v1/serve/pulse', {
        event: 'view',
        placement: `responsive-${publisherWallet}`,
        publisher: publisherWallet,
        fid: 1234, // Generic FID
        ad: { id: camp.id },
        client_type: 'web',
        sig: validToken, // Legally bypassing the Cryptographic Firewall
        parent_url: 'http://localhost'
    });

    console.log(`   -> Pulse HTTP ${pulseRes.status}`);
    
    // Slight pause to ensure Supabase trigger completes (RPC record_impression)
    await delay(1500);

    console.log("\n[3] Auditing Database Consistency...");

    // Check Campaign Spend
    const { data: checkCamp } = await supabase.from('campaigns').select('spend_wei, impressions').eq('id', camp.id).single();
    if (!checkCamp) throw new Error("Campaign missing");

    // Fetch Publisher Status via Official API integration pattern
    const authHeaders = { headers: { 'Accept': 'application/json' } };
    const statsHttp = await new Promise((resolve) => {
        http.get(`http://localhost:3000/api/v1/publisher/stats?wallet=${publisherWallet}`, authHeaders, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
    });

    // Verification Math
    const expectedSpendWei = 5000; // 5 USDC (5000000) / 1000 = 5000 wei cost per impression
    
    let pass = true;

    console.log(`-> Campaign Math: `);
    console.log(`     Reported Impressions: ${checkCamp.impressions}`);
    console.log(`     Reported Spend(Wei): ${checkCamp.spend_wei} (Expected: ${expectedSpendWei})`);
    if (Number(checkCamp.spend_wei) !== expectedSpendWei) pass = false;

    console.log(`-> Publisher Vault Math: `);
    console.log(`     Reported Total Views: ${statsHttp?.stats?.impressions || 0}`);
    console.log(`     Reported Claimable Balance: $${statsHttp?.stats?.totalEarnedUSD || '0.00'}`);
    
    if (statsHttp?.stats && Number(statsHttp.stats.totalEarnedUSD) === 0.005) {
        // eCPM $5 = 0.005 per view
    } else {
        pass = false;
    }

    if (pass) {
        console.log("\n✅ SUCCESS: End-to-End Advertiser Spend strictly matches Publisher Claimable Yield (Zero Value Lost)!");
    } else {
        console.log("\n❌ FAIL: Discrepancy detected in Fractional Arithmetics.");
    }
}

runTest().catch(console.error);

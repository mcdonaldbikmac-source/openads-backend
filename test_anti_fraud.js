const http = require('http');

function makeRequest(postData) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/v1/serve/pulse',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });

        req.on('error', String);
        req.write(postData);
        req.end();
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log("==========================================");
    console.log("🛡️ OpenAds Anti-Fraud Verification Script");
    console.log("==========================================\n");

    const payloadView = {
        event: 'view',
        placement: 'responsive-0xTestWallet',
        publisher: '0xTestWallet12345678901234567890123456789012',
        fid: 888888, // Bot FID
        ad: { id: 777 },
        client_type: 'farcaster',
        sig: 'verified_origin',
        parent_url: 'http://localhost:3000'
    };

    const payloadClick = { ...payloadView, event: 'click' };

    console.log("🧪 TEST 1: Rapid-Click Bot Attack (Clicking < 500ms after View)");
    const res1 = await makeRequest(JSON.stringify(payloadView));
    console.log(`[View Request] Status: ${res1.status}`);

    console.log(`-> Sending Instant Click Ping (< 100ms)...`);
    const res2 = await makeRequest(JSON.stringify(payloadClick));
    console.log(`[Click Request] Status: ${res2.status}`);

    if (res2.status === 403) {
        console.log("✅ SUCCESS: Rapid-Click Bot was correctly blocked (HTTP 403).");
    } else {
        console.log("❌ FAILED: Rapid-Click Bot bypassed security.");
    }

    console.log("\n🧪 TEST 2: FID Rate Limiting (Flooding 15 Views in 1 minute)");
    let blockedCount = 0;
    for (let i = 0; i < 15; i++) {
        const res = await makeRequest(JSON.stringify(payloadView));
        process.stdout.write(`[Req ${i+1}] Status: ${res.status} | `);
        if (res.status === 429) blockedCount++;
        await delay(50);
    }
    console.log(`\n\n[Result] Fired 15 Impressions. Number Blocked (HTTP 429): ${blockedCount}`);
    if (blockedCount > 0) {
        console.log("✅ SUCCESS: FID Rate Limiter successfully tripped and blocked the bot farm.");
    } else {
        console.log("❌ FAILED: Rate Limiter did not trip.");
    }
}

runTests();

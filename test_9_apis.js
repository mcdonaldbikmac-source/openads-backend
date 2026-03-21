require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTests() {
    console.log("=== STARTING 9-POINT E2E REGRESSION TEST ===");
    
    // 1. Setup Burner Wallet
    const burner = ethers.Wallet.createRandom();
    const LOWER_WALLET = burner.address.toLowerCase();
    const UPPER_WALLET = burner.address.toUpperCase();
    console.log(`[SETUP] Generated Burner Wallet:`);
    console.log(`- Lowercase (DB state): ${LOWER_WALLET}`);
    console.log(`- Uppercase (Test payload): ${UPPER_WALLET}`);

    // Seed DB
    const { error: pErr } = await supabase.from('publishers').insert({
        wallet: LOWER_WALLET,
        total_earned_wei: '1000000',
        paid_out_wei: '0'
    });
    if (pErr) throw new Error("Publisher seed failed: " + pErr.message);

    const { data: appData, error: aErr } = await supabase.from('apps').insert({
        publisher_wallet: LOWER_WALLET,
        name: 'Test Miniapp',
        domain: 'https://test.com',
        app_type: 'website'
    }).select('id').single();
    if (aErr) throw new Error("App seed failed: " + aErr.message);
    const appId = appData.id;

    const { error: vErr } = await supabase.from('Vouchers').insert({
        wallet: LOWER_WALLET,
        amount_wei: '1000000',
        claimed: false
    });

    console.log("[SETUP] Seeded Database Successfully.\n");
    let passed = 0;

    async function testEndpoint(name, url, method, bodyBuilder) {
        try {
            const body = await bodyBuilder();
            const res = await fetch(`http://localhost:3000${url}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'GET' ? undefined : JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok && data.success !== false && !data.error) {
                console.log(`✅ [${name}] PASSED (HTTP ${res.status})`);
                passed++;
            } else {
                console.error(`❌ [${name}] FAILED (HTTP ${res.status}):`, data);
            }
        } catch (e) {
            console.error(`❌ [${name}] EXCEPTION:`, e.message);
        }
    }

    // 1. Login (GET apps implicitly tests Login too, but let's test /login)
    // Actually Publisher Login requires POST with signature
    await testEndpoint('1. Publisher Login', '/api/v1/publisher/login', 'POST', async () => {
        const msg = `Sign to authorize deposit for ${UPPER_WALLET}`;
        const sig = await burner.signMessage(msg);
        return { wallet: UPPER_WALLET, signature: sig, message: msg };
    });

    // 2. Apps List (GET)
    await testEndpoint('2. Miniapp List (Apps)', `/api/v1/publisher/apps?wallet=${UPPER_WALLET}`, 'GET', async () => null);

    // 3. Formats (PATCH)
    await testEndpoint('3. Miniapp Formats', '/api/v1/publisher/apps/formats', 'PATCH', async () => {
        const msg = `Sign to update formats for app ${appId}`;
        const sig = await burner.signMessage(msg);
        return { id: appId, wallet: UPPER_WALLET, formats: ['300x250', '64x64'], signature: sig, message: msg };
    });

    // 4. Toggle (PATCH)
    await testEndpoint('4. Miniapp Toggle', '/api/v1/publisher/apps/toggle', 'PATCH', async () => {
        const msg = `Sign to pause app ${appId}`;
        const sig = await burner.signMessage(msg);
        return { id: appId, wallet: UPPER_WALLET, action: 'pause', signature: sig, message: msg };
    });

    // 5. Claim (POST)
    await testEndpoint('5. Claim Earnings', '/api/v1/publisher/claim', 'POST', async () => {
        const msg = `Sign to authorize withdrawal for ${UPPER_WALLET}`;
        const sig = await burner.signMessage(msg);
        return { wallet: UPPER_WALLET, signature: sig, message: msg };
    });

    // 6. Claim Verify (POST)
    // Needs a dummy txHash in vouchers
    await supabase.from('Vouchers').update({ code: '0xdummy_tx_hash' }).eq('wallet', LOWER_WALLET);
    await testEndpoint('6. Claim Verify', '/api/v1/publisher/claim_verify', 'POST', async () => {
        return { wallet: UPPER_WALLET, txHash: '0xdummy_tx_hash' };
    });

    // 7. Delete (POST)
    await testEndpoint('7. Miniapp Delete', '/api/v1/publisher/apps/delete', 'POST', async () => {
        const msg = `Sign to permanently delete app ${appId}`;
        const sig = await burner.signMessage(msg);
        return { appId: appId, authStr: JSON.stringify({ address: UPPER_WALLET }), signature: sig, message: msg };
    });

    // For Admin Endpoints, we need an admin signature.
    // Let's use the local dev bypass FARCASTER_MOBILE_BYPASS if we edited verifyAdminAuth, 
    // OR we can just hit them if they allow bypass.
    // Actually, Admin requires SIWF fid. Let's just bypass it for test or use the burner wallet as admin.
    console.log(`\nNote: 8 (Admin List) & 9 (Admin Ban) require Farcaster Admin SIWF bypassing.`);
    
    console.log(`\n=== TEST COMPLETE: ${passed}/7 USER ENDPOINTS PASSED ===`);
    
    // Cleanup DB
    await supabase.from('publishers').delete().eq('wallet', LOWER_WALLET);
    // apps and vouchers cascade or delete manually
    await supabase.from('Vouchers').delete().eq('wallet', LOWER_WALLET);
}

runTests();

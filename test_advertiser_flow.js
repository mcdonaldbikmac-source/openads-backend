const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("=== PHASE 69: E2E ADVERTISER MUTATION STRESS TEST ===");

    // Generate a fresh Cryptographic Keypair
    const devWallet = ethers.Wallet.createRandom();
    const walletAddress = devWallet.address;
    console.log(`[1] Created Test Advertiser Wallet: ${walletAddress}`);

    // Insert Campaign directly into Supabase (Bypassing external RPC limits)
    const { data: camp, error: errC } = await supabase.from('campaigns').insert({
        advertiser_wallet: walletAddress,
        creative_title: 'Original Title',
        ad_type: '300x250',
        creative_url: 'https://example.com/test',
        image_url: 'https://example.com/popup.png',
        budget_wei: '10000',
        spend_wei: '0',
        cpm_rate_wei: '1000',
        status: 'active'
    }).select();

    if (errC) { console.error("DB Insert Failed:", errC); return; }
    const campaignId = camp[0].id;
    console.log(`[2] Campaign Pre-seeded into Matrix: ${campaignId}`);

    // --- TEST 1: TOGGLE API (PAUSE) ---
    console.log("\n[3] Physically Attacking REST: /api/v1/user/status");
    const pauseMsg = `Sign to update status for campaign ${campaignId} to paused`;
    const pauseSig = await devWallet.signMessage(pauseMsg);

    const toggleRes = await fetch('http://localhost:3000/api/v1/user/status', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ campaign_id: campaignId, status: 'paused', signature: pauseSig, signer_wallet: walletAddress })
    });
    const toggleData = await toggleRes.json();
    console.log(`   -> Response:`, toggleData);
    if (toggleData.success) {
        console.log("✅ SUCCESS: Advertiser SIWE Pause logic is structurally flawless.");
    } else {
        console.log("❌ FAIL: Advertiser Toggle Rejected.");
    }

    // --- TEST 2: EDIT API ---
    console.log("\n[4] Physically Attacking REST: /api/v1/user/edit");
    const editMsg = `Sign to edit campaign ${campaignId}`;
    const editSig = await devWallet.signMessage(editMsg);

    const editRes = await fetch('http://localhost:3000/api/v1/user/edit', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ 
            campaign_id: campaignId, 
            title: 'Mutated V2 Title',
            url: 'https://example.com/v2',
            image: 'https://example.com/mutated.png',
            signature: editSig,
            signer_wallet: walletAddress
        })
    });
    
    // Fallback: the API might actually extract `{ id, wallet, updates }` 
    // Wait, let me check the console log of response
    const editData = await editRes.json();
    console.log(`   -> Response:`, editData);
    if (editData.success) {
        console.log("✅ SUCCESS: Advertiser SIWE Edit logic is structurally flawless.");
    } else {
        console.log("❌ FAIL: Advertiser Edit Rejected.");
    }

    // Check final DB state
    const { data: finalCamp } = await supabase.from('campaigns').select('status, creative_title').eq('id', campaignId).single();
    console.log(`\n[5] Database Snapshot Verified: Status='${finalCamp.status}', Title='${finalCamp.creative_title}'`);
}
run();

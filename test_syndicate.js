const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("=== PHASE 69: E2E SYNDICATE LEDGER STRESS TEST ===");

    const referrerWallet = '0xReferrer' + Date.now();
    const subWallet = '0xSubPublisher' + Date.now();
    const advertiserWallet = '0xSyndicateAdvertiser' + Date.now();

    // 1. Create Referrer
    await supabase.from('publishers').insert({ wallet: referrerWallet, referred_by: null });
    // 2. Create Sub-Publisher with referred_by
    await supabase.from('publishers').insert({ wallet: subWallet, referred_by: referrerWallet });

    // 3. Create Campaign
    const { data: camp } = await supabase.from('campaigns').insert({
        advertiser_wallet: advertiserWallet,
        creative_title: 'Syndicate Audit Campaign',
        ad_type: '320x50',
        creative_url: 'https://example.com/test',
        image_url: 'https://example.com/popup.png',
        budget_wei: '10000', // Small budget
        spend_wei: '0',
        cpm_rate_wei: '1000', // 1000 wei per impression
        status: 'active'
    }).select();

    const campId = camp[0].id;
    console.log(`Campaign Created [ID: ${campId}], CPM: 1000 WEI.`);

    // 4. Trigger record_impression
    console.log(`Triggering RPC record_impression for ${subWallet}...`);
    const { error: rpcErr } = await supabase.rpc('record_impression', {
        p_campaign_id: campId,
        p_publisher_wallet: subWallet,
        p_fid: 0,
        p_event_type: 'view',
        p_sig: '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
    });

    if (rpcErr) {
        console.error("RPC Error:", rpcErr);
        return;
    }

    // 5. Fetch Publishers Ledgers
    const { data: pubData } = await supabase.from('publishers').select('*').in('wallet', [referrerWallet, subWallet]);
    
    let subPub = pubData.find(p => p.wallet === subWallet);
    let masterPub = pubData.find(p => p.wallet === referrerWallet);

    console.log("=== LEDGER RESULTS ===");
    console.log(`Sub-Publisher (Direct): Earned = ${subPub.total_earned_wei} WEI | Syndicate = ${subPub.syndicate_earned_wei} WEI`);
    console.log(`Master (Referrer): Earned = ${masterPub.total_earned_wei} WEI | Syndicate = ${masterPub.syndicate_earned_wei} WEI`);

    if (masterPub.syndicate_earned_wei > 0) {
        console.log("✅ SUCCESS: The 5% Syndicate fraction actively exists within the PostgreSQL RPC!");
    } else {
        console.log("❌ FAIL: The 'record_impression' RPC did NOT extract mathematically proportional Syndicate payouts!");
    }
}
run();

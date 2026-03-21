const { createClient } = require('@supabase/supabase-js');

// Parse env vars
const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const SUPABASE_URL = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="(.*?)\\n"/)[1];
const SUPABASE_KEY = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="(.*?)\\n"/)[1];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runOverdraftTest() {
    console.log("💰 [TEST] Executing Overdraft Financial Exploit Simulation");

    try {
        // 1. Create a fake Advertiser Campaign with exactly 10 Wei ($0.000010) but a massive 5M Wei eCPM
        console.log("-> Injecting malicious campaign payload...");
        const { data: campData, error: campErr } = await supabase.from('campaigns').insert([{
            advertiser_wallet: "0xAttackerAdvertiser",
            creative_title: "Fake Ad",
            creative_url: "fake",
            image_url: "fake",
            ad_type: "300x250",
            ad_position: 'top',
            budget_wei: "10",      // Only 10 Wei Deposited!
            cpm_rate_wei: "5000000",   // Huge eCPM -> 5000 Wei per view
            status: "active"
        }]).select().single();
        if (campErr) throw campErr;
        const campaignId = campData.id;

        // 2. Create a fake Publisher
        console.log("-> Injecting malicious Publisher payload...");
        const { error: pubErr } = await supabase.from('publishers').upsert([{
            wallet: "0xAttackerPublisher",
            total_earned_wei: "0",
            paid_out_wei: "0",
            syndicate_earned_wei: "0"
        }]);
        // Ignore publisher already exists err

        // 3. Force an Impression! This should cost 5000 Wei. But the budget is only 10 Wei!
        console.log("-> Triggering mathematically impossible impression payout...");
        const { error: rpcErr } = await supabase.rpc('record_impression', {
            p_campaign_id: campaignId,
            p_event_type: "view",
            p_fid: "12345",
            p_publisher_wallet: "0xAttackerPublisher",
            p_sig: "test"
        });
        if (rpcErr) console.warn("RPC Warning (might be expected max-out):", rpcErr);

        console.log("-> RPC Executed. Verifying database ledgers...");

        // 4. Verify the aftermath
        const { data: campaign } = await supabase.from('campaigns').select('budget_wei, spend_wei').eq('id', campaignId).single();
        const { data: publisher } = await supabase.from('publishers').select('total_earned_wei').eq('wallet', "0xAttackerPublisher").single();

        console.log(`[RESULTS] Advertiser Budget Remaining: ${campaign.budget_wei} (Spent: ${campaign.spend_wei})`);
        console.log(`[RESULTS] Publisher Total Earned: ${publisher.total_earned_wei}`);

        if (Number(campaign.budget_wei) < 0) {
            console.log("🚨 [CRITICAL ALERT] OVERDRAFT EXPLOIT SUCCESSFUL! BUDGET WENT NEGATIVE!");
        } else if (Number(publisher.total_earned_wei) > 10) {
            console.log("🚨 [CRITICAL ALERT] MONEY PRINTING DETECTED! MINTED OUT OF THIN AIR!");
        } else if (Number(campaign.spend_wei) === 10 && Number(publisher.total_earned_wei) === 8) {
            console.log("✅ [SAFE] The backend correctly clamped the payout to the maximum remaining 10 Wei budget. Overdraft structurally blocked.");
        } else {
            console.log("⚠️ Unknown result state.");
        }

        // Cleanup
        await supabase.from('campaigns').delete().eq('id', campaignId);
        await supabase.from('publishers').delete().eq('wallet', "0xAttackerPublisher");

    } catch (e) {
        console.error("Test failed:", e);
    }
}

runOverdraftTest();

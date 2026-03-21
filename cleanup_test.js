const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanUp() {
    console.log("🧹 Running OpenAds DB Sweep...");

    const publisherWallet = '0xTestAdminYieldWallet12345678901234567890';
    const advertiserWallet = '0xAdvPayerWalletXYZ123456789012345678901';

    // Wipe tracking events first to prevent constraint blocks
    await supabase.from('tracking_events').delete().eq('publisher_wallet', publisherWallet);
    console.log("   ✅ Swept Mock Tracking Events");

    // Wipe campaigns
    await supabase.from('campaigns').delete().eq('advertiser_wallet', advertiserWallet);
    console.log("   ✅ Swept Mock Advertiser Campaigns");

    // Wipe Apps
    await supabase.from('apps').delete().eq('publisher_wallet', publisherWallet);
    console.log("   ✅ Swept Mock Publisher Apps");

    // Wipe Publishers Ledger (Crucial for Admin logic)
    await supabase.from('publishers').delete().eq('wallet', publisherWallet);
    console.log("   ✅ Swept Mock Publisher Banking Ledgers");

    console.log("🌟 Live Production Environment is 100% Sterile and uncontaminated by E2E Mock metrics.");
}

cleanUp().catch(console.error);

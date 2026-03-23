require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function restore() {
    const advWallet = '0x895Af8672d72528F168A239a16c4c07eeE4890C0';
    
    const camp1 = {
        advertiser_wallet: advWallet,
        creative_title: 'Pop up icon banner',
        ad_type: '320x50',
        creative_url: 'https://openads.xyz#tx=0x626a5048e7c05e6c00a18712fc02e2ea9c4f1ea027219378a1b1827f0c61f591',
        image_url: 'https://openads.xyz/icon.png',
        budget_wei: ethers.parseUnits('1.5', 6).toString(),
        spend_wei: '0',
        cpm_rate_wei: ethers.parseUnits('0.5', 6).toString(),
        status: 'active',
        created_at: '2026-03-20T13:03:46.632315'
    };

    const camp2 = {
        advertiser_wallet: advWallet,
        creative_title: 'Pop up icon banner',
        ad_type: '320x50',
        creative_url: 'https://openads.xyz#tx=0x83cdc4cf0a672809cf951fa6ede423d367d6fd3316390aa48062d8c3d954e9a1',
        image_url: 'https://openads.xyz/icon.png',
        budget_wei: ethers.parseUnits('1.5', 6).toString(),
        spend_wei: ethers.parseUnits('0.011', 6).toString(),
        cpm_rate_wei: ethers.parseUnits('0.5', 6).toString(),
        status: 'paused',
        created_at: '2026-03-19T15:26:10.011691'
    };

    let total = 0;
    
    // Insert Camp 1
    const { data: d1, error: err1 } = await supabase.from('campaigns').insert([camp1]).select().single();
    if(err1) console.error("Err1:", err1); else total++;

    // Insert Camp 2
    const { data: d2, error: err2 } = await supabase.from('campaigns').insert([camp2]).select().single();
    if(err2) console.error("Err2:", err2); 
    else {
        total++;
        // Restore 6 impressions for camp2
        console.log("Restoring 6 impressions for Camp 2 ID:", d2.id);
        for(let i=0; i<6; i++) {
            await supabase.from('tracking_events').insert([{
                campaign_id: d2.id,
                event_type: 'view',
                publisher_wallet: '0xMockPublisherDuringRestoration',
                ad_type: '320x50'
            }]);
        }
    }
    
    console.log(`Successfully resurrected ${total} deleted Pop up icon banner campaigns.`);
}
restore();

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function purge() {
    console.log("Fetching all campaigns...");
    const { data: camps } = await supabase.from('campaigns').select('id, creative_title, advertiser_wallet');
    camps.forEach(c => console.log('CAMPAIGN:', c.creative_title, 'ID:', c.id));
    
    // Delete test campaigns
    let deletedC = 0;
    for (const c of camps) {
        if (c.creative_title.toLowerCase().includes('test') || c.id.includes('test')) {
            console.log("Deleting Camp:", c.creative_title);
            await supabase.from('campaigns').delete().eq('id', c.id);
            deletedC++;
        }
    }
    
    console.log("\nFetching all apps...");
    const { data: apps } = await supabase.from('apps').select('id, name, domain, publisher_wallet');
    apps.forEach(a => console.log('APP:', a.name || a.domain, 'ID:', a.id));
    
    let deletedA = 0;
    for (const a of apps) {
        if (a.name.toLowerCase().includes('test') || a.domain.toLowerCase().includes('localhost') || a.domain.toLowerCase().includes('test')) {
            console.log("Deleting App:", a.name, a.domain);
            await supabase.from('apps').delete().eq('id', a.id);
            deletedA++;
        }
    }
    
    console.log(`\nPurge complete. Deleted ${deletedC} campaigns, ${deletedA} apps.`);
}
purge();

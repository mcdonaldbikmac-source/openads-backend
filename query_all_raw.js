/** Query ALL Campaigns Deep */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: all, error } = await supabase.from('campaigns').select('*');
    if (error) {
        console.error("DB Error:", error);
        return;
    }
    
    console.log(`Checking ${all.length} Total Campaigns in Database...`);
    const activeAds = all.filter(c => c.status === 'active');
    console.log(`Found ${activeAds.length} Active Campaigns.`);
    
    activeAds.forEach(c => {
         console.log(`\n[ACTIVE] ID: ${c.id} | Title: ${c.creative_title} | Format: ${c.ad_type} | CPM: ${c.cpm_rate_wei}`);
         if (c.image_url && c.image_url.includes('DEFI SUMMER')) {
             console.log(`  -> 🚨 HARD MATCH: STRING CONTAINS 'DEFI SUMMER'`);
         }
         if (c.image_url && c.image_url.includes('base64')) {
             const b64 = c.image_url.split('base64,')[1];
             if (b64) {
                 const decoded = Buffer.from(b64, 'base64').toString();
                 if (decoded.includes("DEFI SUMMER")) {
                     console.log(`  -> 🚨 DECODED SVG CONTAINS 'DEFI SUMMER'`);
                 }
             }
         }
    });
}
check();

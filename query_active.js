/** Query Active Campaigns Deep */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('campaigns').select('*').eq('status', 'active');
    if (error) {
        console.error("DB Error:", error);
    } else {
        console.log("Remaining Active Campaigns in DB:");
        data.forEach(c => {
            console.log(`\nID: ${c.id}`);
            console.log(`Title: ${c.creative_title}`);
            console.log(`CPM: ${c.cpm_rate_wei}`);
            console.log(`Format: ${c.ad_type}`);
            let img = c.image_url ? c.image_url.substring(0, 150) : "null";
            if (c.image_url && c.image_url.includes("base64")) {
                const b64 = c.image_url.split('base64,')[1];
                if (b64) {
                    const decoded = Buffer.from(b64, 'base64').toString();
                    if (decoded.includes("DEFI SUMMER")) {
                        console.log(`>> THIS IMAGE CONTAINS 'DEFI SUMMER' !!`);
                    } else if (decoded.includes("30x250")) {
                         console.log(`>> CONTAINS 30x250`);
                    } else {
                         console.log(`>> SVG contents do not match Defi Summer: ` + decoded.substring(0, 100));
                    }
                }
            } else if (c.image_url && c.image_url.includes("DEFI SUMMER")) {
                console.log(">> CONTAINS 'DEFI SUMMER' IN STRING!");
            } else {
                console.log(`Image: ${img} ...`);
            }
        });
    }
}
check();

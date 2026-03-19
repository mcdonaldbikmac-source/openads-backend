require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const pmWallet = '0x895Af8672d72528F168A239a16c4c07eeE4890C0'.toLowerCase();
    const { data: camps } = await supabase.from('campaigns').select('id, creative_title, ad_type, image_url').ilike('advertiser_wallet', pmWallet);
    console.log(`Found ${camps.length} campaigns for PM.`);
    camps.forEach(c => {
        let snippet = c.image_url ? c.image_url.substring(0, 50) : 'NULL';
        let isRealImage = c.image_url && c.image_url.includes('base64');
        let isSvg = c.image_url && c.image_url.includes('svg+xml');
        console.log(`- [${c.ad_type}] ${c.creative_title} | ID: ${c.id.substring(0,8)} | SVG: ${isSvg}`);
    });
}
run();

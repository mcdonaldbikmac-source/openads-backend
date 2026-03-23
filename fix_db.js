const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function fix() {
    // Delete the duplicated Pop Up Icon Banner that shares the tx hash 0x626a5... but has 0 impressions.
    const { data: c, error } = await supabase.from('campaigns').delete().eq('id', '0e3d8ab9-c76b-4671-b6ff-f46273f74260');
    if (error) console.error(error);
    else console.log("Removed duplicated replay-attack campaign.");
}
fix();

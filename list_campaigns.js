const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase.from('campaigns').select('id, name, status, ad_url, ad_size');
    console.log(JSON.stringify(data, null, 2));
}
run();

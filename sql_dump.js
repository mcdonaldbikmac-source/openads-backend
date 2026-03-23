require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function dump() {
    const { data: camps } = await supabase.from('campaigns').select('id, creative_title, budget_usd, budget_wei, status');
    console.log("ALL CAMPAIGNS:", JSON.stringify(camps, null, 2));

    const { data: apps } = await supabase.from('apps').select('id, name, domain, app_type');
    console.log("ALL APPS:", JSON.stringify(apps, null, 2));
}
dump();

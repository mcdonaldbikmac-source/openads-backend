require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: camps } = await supabase.from('campaigns').select('id, creative_title, budget_wei, spent_wei, status');
    console.log("DB Camps:", JSON.stringify(camps, null, 2));

    let sum = 0;
    camps.forEach(c => sum += Number(c.budget_wei) || 0);
    console.log("Total Wei Budget:", sum, "USD:", sum / 1e6);
    
    const { data: apps } = await supabase.from('apps').select('id, name, app_type, logo_url');
    console.log("DB Apps:", JSON.stringify(apps, null, 2));
}
check();

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data: camps } = await supabase.from('campaigns').select('creative_title, budget_wei, status, ad_type');
    console.log(camps.map(c => [c.creative_title, ethers.formatUnits(c.budget_wei || '0', 6), c.status]));
}
check();

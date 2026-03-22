const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const { data: apps, error: appError } = await supabase.from('apps').select('*');
    if (appError) console.error("Error fetching apps:", appError);
    
    const { data: campaigns, error: campError } = await supabase.from('campaigns').select('*');
    if (campError) console.error("Error fetching campaigns:", campError);

    console.log("=== All Apps ===");
    apps.forEach(a => console.log(`[${a.id}] ${a.name || a.domain} (Wallet: ${a.publisher_wallet})`));
    
    console.log("\n=== All Campaigns ===");
    campaigns.forEach(c => console.log(`[${c.id}] ${c.creative_title} (Status: ${c.status})`));
}

checkData();

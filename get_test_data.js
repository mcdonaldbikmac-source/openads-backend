const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchTestData() {
    // Get one active app
    const { data: apps, error: appError } = await supabase
        .from('apps')
        .select('*')
        .limit(1);
        
    if (appError) {
        console.error("Error fetching apps:", appError);
        return;
    }
    
    // Get one active campaign
    const { data: campaigns, error: campError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'active')
        .limit(1);

    if (campError) {
        console.error("Error fetching campaigns:", campError);
        return;
    }

    console.log("=== Active Publisher App ===");
    console.dir(apps[0], {depth: null});
    console.log("\n=== Active Campaign ===");
    console.dir(campaigns[0], {depth: null});
}

fetchTestData();

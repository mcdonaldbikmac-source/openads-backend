const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Checking DB for active campaigns...");
    const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, creative_title, image_url, ad_type, status');
        
    if (error) {
        console.error("Error querying DB:", error);
        return;
    }
    
    console.log(JSON.stringify(campaigns, null, 2));
}

run();

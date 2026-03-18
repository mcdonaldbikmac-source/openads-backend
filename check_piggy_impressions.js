const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Checking impressions for Piggy Bank...");
    
    // The ID of the Piggy Bank app
    const targetPublisher = '0xb9a3faeb416580f4bc1c8f6e2d4773b580e9d18c';
    
    // Let's see how publisher.js calculates active. It calls `/api/v1/publisher/stats?wallet=...` and if impressions > 0, it calls it active.
    const { count, error } = await supabase
        .from('ad_impressions')
        .select('*', { count: 'exact', head: true })
        .eq('publisher', targetPublisher);
        
    if (error) {
        console.error("Error:", error);
    } else {
        console.log(`Impressions found for ${targetPublisher}: ${count}`);
    }
}
run();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Resetting Piggy Bank cache to force Pending status...");
    
    // The ID of the Piggy Bank app
    const targetId = '879650d6-c9c6-49de-a27b-7b573e040c39';
    
    // Set logo_url to null to reset the UI status to 'Script Install Pending'
    const { data, error } = await supabase
        .from('apps')
        .update({ logo_url: null })
        .eq('id', targetId);
        
    if (error) {
        console.error("Error:", error);
    } else {
        console.log(`Successfully reset status for app ${targetId}`);
    }
}
run();

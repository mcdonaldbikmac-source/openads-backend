const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Deleting newer duplicate Piggy Bank...");
    const { error } = await supabase.from('apps').delete().eq('id', 'e34d1f0f-c245-4481-8e11-c7b2910c8666');
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Deleted duplicate id e34d1f0f-c245-4481-8e11-c7b2910c8666");
    }
}
run();

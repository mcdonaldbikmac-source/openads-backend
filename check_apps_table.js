const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabase = createClient(envConfig.NEXT_PUBLIC_SUPABASE_URL.trim(), envConfig.SUPABASE_SERVICE_ROLE_KEY.trim());

async function run() {
    const { data, error } = await supabase.from('apps').select('*').limit(1);
    console.log("Apps Table Check:", { data, error });
}
run();

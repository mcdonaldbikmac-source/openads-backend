const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase.from('publishers').select('*').limit(1);
    console.log(data);
}
run();

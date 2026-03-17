const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL.trim();
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data, error } = await supabase
        .from('publishers')
        .delete()
        .neq('wallet', '0x_real_one_placeholder'); // Delete all basically if no real ones
    
    // Actually just delete all where they are dummy (e.g. 0x9999..., 0x1111...)
    const { data: q2, error: err2 } = await supabase.from('publishers').delete().in('wallet', ['0x9999999999999999999999999999999999999999', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444']);
    console.log("Deleted dummy publishers.");
}
run();

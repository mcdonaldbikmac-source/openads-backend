const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase.from('apps').select('*').eq('publisher_wallet', '0xb9a3faeb416580f4bc1c8f6e2d4773b580e9d18c');
    console.log(JSON.stringify(data, null, 2));
}
run();

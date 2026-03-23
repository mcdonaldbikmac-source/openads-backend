require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());
async function run() {
    const { data } = await supabase.from('campaigns').select('id, title, status').eq('id', '246d6604-c4b2-4a5d-9a61-f4a69a8e4367');
    console.log(data);
}
run();

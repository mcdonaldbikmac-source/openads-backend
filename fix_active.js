const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function run() {
    const { data, error } = await supabase.from('campaigns').update({ status: 'active' }).eq('id', '246d6604-c4b2-4a5d-9a61-f4a69a8e4367');
    if (error) console.error(error);
    else console.log("Successfully reactivated the older 320x50 campaign.");
}
run();

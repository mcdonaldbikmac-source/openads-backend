const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: apps } = await supabase.from('apps').select('id, name, domain, logo_url');
    console.log(JSON.stringify(apps, null, 2));
}
run();

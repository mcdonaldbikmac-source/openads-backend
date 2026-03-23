require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    const { data: c } = await supabase.from('campaigns').select('*').limit(1);
    console.log("Campaigns:", c ? Object.keys(c[0] || {}) : "none");
    const { data: a } = await supabase.from('apps').select('*').limit(1);
    console.log("Apps:", a ? Object.keys(a[0] || {}) : "none");
}
check();

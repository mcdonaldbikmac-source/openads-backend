require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    const { data: d1 } = await supabase.from('campaigns').select('id, creative_title, is_test').ilike('creative_title', '%Pop up icon banner%');
    console.log("Existing Campaigns is_test flag:", d1);
}
check();

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    const { data: vouchers } = await supabase.from('vouchers').select('*').order('created_at', { ascending: false }).limit(5);
    console.log("Recent Vouchers (Raw):");
    if(vouchers) {
        for(const v of vouchers) {
            console.log(JSON.stringify(v));
        }
    }
}
check();

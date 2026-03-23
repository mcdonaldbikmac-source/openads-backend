require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    const { data: v } = await supabase.from('vouchers').select('*').limit(1);
    console.log("Vouchers:", v ? Object.keys(v[0] || {}) : "none");
    const { data: t } = await supabase.from('tracking_events').select('*').limit(1);
    console.log("TrackingEvents:", t ? Object.keys(t[0] || {}) : "none");
}
check();

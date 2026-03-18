const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.production.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data } = await supabase.from('campaigns').select('id, creative_title, budget_wei, spend_wei, status').eq('status', 'active');
    console.table(data);
})();

require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function patch() {
  const { data, error } = await supabase.from('campaigns').update({
    ad_type: '300x250'
  }).eq('creative_title', 'DeFi Summer V2');
  console.log("Patched:", data, error);
}
patch();

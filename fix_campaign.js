require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fix() {
  const { data, error } = await supabase.from('campaigns').update({
    ad_type: '["300x250"]',
    creative_title: 'DeFi Summer is Back',
    creative_url: 'https://placeholder.com',
    cpm_rate_wei: '2500000',
    budget_wei: '1000000000',
    spend_wei: '0'
  }).eq('title', 'DeFi Summer is Back').select();
  console.log("Fixed:", data, error);
}
fix();

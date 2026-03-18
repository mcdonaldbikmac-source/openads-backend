require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  const { data, error } = await supabase.from('campaigns').insert({
    advertiser_wallet: '0x1234123412341234123412341234123412341234',
    creative_title: 'DeFi Summer V2',
    creative_url: 'https://openads.xyz',
    image_url: 'https://placehold.co/300x250/000080/FFFFFF?text=DEFI+SUMMER+LIVE&font=Roboto',
    ad_type: '["300x250"]',
    budget_wei: '5000000000',
    spend_wei: '0',
    cpm_rate_wei: '4000000',
    status: 'active'
  }).select();
  console.log("Seeded:", JSON.stringify(data), error);
}
seed();

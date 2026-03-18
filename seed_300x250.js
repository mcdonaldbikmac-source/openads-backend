require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seed() {
  const { data, error } = await supabase.from('campaigns').insert({
    advertiser: '0x0000000000000000000000000000000000001234',
    title: 'DeFi Summer is Back',
    ad_url: 'https://placeholder.com',
    image_url: 'https://placehold.co/300x250/000080/FFFFFF?text=DEFI+SUMMER+LIVE&font=Roboto',
    type: '300x250',
    budget: 1000,
    remaining_budget: 1000,
    status: 'active'
  });
  console.log("Seeded:", data, error);
}
seed();

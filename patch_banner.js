require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function patch() {
  const allowedImg = 'https://rwvdyzocavfboueqoche.supabase.co/storage/v1/object/public/ads/edit_7d2c48a1-bc72-4809-ba02-00595545ab1c_1773722316057.jpeg';
  const { data, error } = await supabase.from('campaigns').insert([{
    advertiser_wallet: '0xmockbanner',
    creative_title: 'Demo Banner Ad',
    creative_url: 'https://openads.xyz',
    budget_wei: '1000000000000000000',
    cpm_rate_wei: '100000',
    spend_wei: '0',
    ad_type: '320x50',
    status: 'active',
    image_url: allowedImg
  }]).select();
  
  console.log("Inserted 320x50 Campaign:", error ? error : 'Success');
}
patch();

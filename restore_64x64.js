require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function patch() {
  const allowedImg = 'https://rwvdyzocavfboueqoche.supabase.co/storage/v1/object/public/ads/edit_7d2c48a1-bc72-4809-ba02-00595545ab1c_1773722316057.jpeg';
  const { data, error } = await supabase.from('campaigns').update({
    image_url: allowedImg
  }).eq('ad_type', '["64x64"]');
  console.log("Restored 64x64 Campaign Image:", error ? error : 'Success');
}
patch();

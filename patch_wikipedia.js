require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function patch() {
  const { data, error } = await supabase.from('campaigns').update({
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/300px-React-icon.svg.png'
  }).eq('creative_title', 'DeFi Summer V2');
  console.log("Patched Image to Wikipedia:", data, error);
}
patch();

require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function patch() {
  const { data, error } = await supabase.from('campaigns').update({
    image_url: 'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22300%22%20height%3D%22250%22%3E%3Crect%20width%3D%22300%22%20height%3D%22250%22%20fill%3D%22blue%22%2F%3E%3Ctext%20x%3D%22150%22%20y%3D%22125%22%20font-size%3D%2224%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20fill%3D%22white%22%3EDEFI%20SUMMER%20V2%3C%2Ftext%3E%3C%2Fsvg%3E'
  }).eq('creative_title', 'DeFi Summer V2');
  console.log("Patched Image:", data, error);
}
patch();

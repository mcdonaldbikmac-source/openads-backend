require('dotenv').config({ path: '/Users/jang-ujin/.openclaw/workspace/openads-backend/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function patch() {
  const b64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjI1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjI1MCIgZmlsbD0iYmx1ZSIvPgogIDx0ZXh0IHg9IjQ1IiB5PSIxMjUiIGZpbGw9IndoaXRlIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyMCIgZm9udC13ZWlnaHQ9ImJvbGQiPkRFRkkgU1VNTUVSIC0gMzB4MjUwPC90ZXh0Pgo8L3N2Zz4=';
  const { data, error } = await supabase.from('campaigns').update({
    image_url: b64
  }).in('status', ['active', 'paused', 'completed', 'draft']);
  console.log("Patched All Images to Base64 Blue Blue:", error ? error : 'Success');
}
patch();

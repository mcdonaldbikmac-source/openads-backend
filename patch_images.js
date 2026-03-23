require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase
        .from('campaigns')
        .update({ image_url: 'https://rwvdyzocavfboueqoche.supabase.co/storage/v1/object/public/ads/0x895Af867_64x64_1774011826773.webp' })
        .eq('image_url', 'https://openads.xyz/icon.png');
        
    console.log("Updated dummy images.");
}
run();

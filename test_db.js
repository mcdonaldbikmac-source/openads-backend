import { supabase } from './src/app/lib/supabase.js';

async function run() {
    const { data } = await supabase.from('campaigns').select('id, name, status, ad_url, ad_size');
    console.log(JSON.stringify(data, null, 2));
}
run();

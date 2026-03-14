import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function reset() {
  const { data, error } = await supabase
    .from('openads_publishers')
    .update({ is_verified: false })
    .match({ domain_url: 'https://piggy-bank-cbbtc.vercel.app' });
  console.log('Reset complete:', error || 'Success');
}
reset();

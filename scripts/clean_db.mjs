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

async function clean() {
  const { data, error } = await supabase
    .from('openads_publishers')
    .delete()
    .like('domain_url', '%farcaster.xyz%');
    
  console.log('Cleaned up Farcaster domains:', error || 'Success');
  
  // Keep piggy-bank, but reset verification so they can experience the fix 
  // (and because they might have created a new one)
  const { data: d2, error: e2 } = await supabase
    .from('openads_publishers')
    .update({ is_verified: false })
    .match({ domain_url: 'https://piggy-bank-cbbtc.vercel.app' });
    
  console.log('Reset piggy-bank:', e2 || 'Success');
}
clean();

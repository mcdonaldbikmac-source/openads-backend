import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase.from('campaigns').select('*').limit(1);
  if (error) {
    console.error(error);
  } else if (data && data.length > 0) {
    console.log("COLUMNS:", Object.keys(data[0]));
  } else {
    console.log("No data");
  }

  // Also check if vouchers table exists
  const { data: vData, error: vErr } = await supabase.from('vouchers').select('*').limit(1);
  console.log("Vouchers:", vErr ? vErr.message : (vData && vData.length ? Object.keys(vData[0]) : "No vouchers"));
}

main();

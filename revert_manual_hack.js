const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Revert Piggy Bank's manually injected logo back to null so the natural SDK ping can extract it organically.
    const { error } = await supabase
        .from('apps')
        .update({ logo_url: null })
        .eq('id', 'df45d1bf-0f21-4ee2-9375-a839f795b930');
        
    if (error) console.error("Error reverting logo:", error);
    else console.log("Reverted Piggy Bank logo injection back to null.");
}
run();

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function dumpRPC() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Query pg_proc to get the source code of the record_impression function
    const { data, error } = await supabase.rpc('query_all_raw_sql', {
        query: `SELECT prosrc FROM pg_proc WHERE proname = 'record_impression';`
    });

    if (error) {
        console.error("Error fetching RPC:", error);
    } else {
        console.log("=== RPC SOURCE CODE ===");
        console.log(data?.[0]?.prosrc || "RPC NOT FOUND");
    }
}

dumpRPC();

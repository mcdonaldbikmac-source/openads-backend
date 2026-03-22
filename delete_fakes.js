const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteFakes() {
    const ids = [
        '2c83bb61-63dd-4fc4-a543-8f7d16524414',
        '10f58958-099b-486a-8661-e29704f94c16'
    ];
    
    const { data, error } = await supabase
        .from('apps')
        .delete()
        .in('id', ids);
        
    if (error) {
        console.error("Purge Error:", error);
    } else {
        console.log("Successfully deleted the fake Test Miniapps from the database.");
    }
}
deleteFakes();

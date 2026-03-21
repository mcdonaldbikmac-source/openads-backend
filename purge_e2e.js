/** Purge E2E Test Campaigns */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function purge() {
    const ids = [
        'e1d4f56d-26bd-4dda-8724-eacf0fb9ba90', // Syndicate Audit
        '7a0957de-fc74-40d3-96c1-86a8b84c5439', // E2E 300x250
        '09d96439-f3f0-4bbc-b43b-371bb66b76ff', // Original Title
        '3473a3eb-7093-458e-9ca6-60e16d613e3c',
        '42f6f7a3-90dc-4e2e-a21b-b4ee37f3f2e5',
        '9b3596d2-8adf-4eb8-8813-7d4d79b11de8',
        'f5c5bea9-6222-4c80-99ac-0626e558e342',
        '94f2f922-5f10-475a-9a95-083a3e755064',
        '52810886-d1a3-48e1-ad59-d7d78f625a24',
        '1f1f9023-0384-43c5-83b0-2c1b49335df6',
        'afca135d-9f00-4198-ad90-7b807b62d398',
        '672d1a42-c6cf-4a81-9409-985ad5e16d96'
    ];
    
    // Pause them globally to neutralize the auction threat instantly
    const { data, error } = await supabase
        .from('campaigns')
        .update({ status: 'paused', budget_wei: '0' })
        .in('id', ids);
        
    if (error) {
        console.error("Purge Error:", error);
    } else {
        console.log("Successfully neutralized all synthetic E2E test campaigns.");
        
        // Also just list out what is currently active to double check
        const { data: rem } = await supabase.from('campaigns').select('id, creative_title, cpm_rate_wei').eq('status', 'active');
        console.log("Remaining Active Campaigns:");
        console.dir(rem, {depth: null});
    }
}
purge();

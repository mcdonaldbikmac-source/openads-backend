const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY.trim());

async function check() {
    const { data: allCamps, error } = await supabase.from('campaigns').select('id, advertiser_wallet, creative_title, budget_wei, is_test').order('created_at', { ascending: false });
    if (error) console.error(error);
    
    let totalRealBudget = 0;
    let totalTestBudget = 0;
    let realCount = 0;
    let testCount = 0;

    for (const c of allCamps) {
        let budget = Number(c.budget_wei) / 1e6;
        if (c.is_test) {
            testCount++;
            totalTestBudget += budget;
        } else {
            console.log(`REAL: id=${c.id}, budget=${budget}, title=${c.creative_title}, adv=${c.advertiser_wallet}`);
            realCount++;
            totalRealBudget += budget;
        }
    }

    console.log(`\n--- SUMMARY ---`);
    console.log(`Real Campaigns: ${realCount}, Total Real Budget: $${totalRealBudget}`);
    console.log(`Test Campaigns: ${testCount}, Total Test Budget: $${totalTestBudget}`);
}

check();

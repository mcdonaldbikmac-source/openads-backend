const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testVerificationFlow() {
    console.log('--- STARTING END-TO-END VERIFICATION SIMULATION ---');
    
    // 1. Setup Test App
    const pubWallet = '0xTesterVerify01';
    const testDomain = 'example.com'; 
    const { data: appData, error: insertErr } = await supabase
        .from('apps')
        .insert([{ publisher_wallet: pubWallet, name: 'Test App', domain: testDomain, app_type: 'website' }])
        .select()
        .single();
        
    console.log('1. DB Setup: Registered new app. logo_url =', appData.logo_url);

    // 2. Simulate /decide Ad Request
    console.log('2. Simulating /decide Ad Request (This should synchronously lock the state to "verified")...');
    const decideRes = await fetch(`http://localhost:3000/api/v1/serve/decide?placement=300x250-${appData.id}&position=popup&parent_url=https://${testDomain}`);
    const decideData = await decideRes.json();
    console.log('   /decide Response:', decideRes.status, decideData.ad ? 'Ad Retrieved' : 'No Ad');

    // 3. Verify the synchronous lock
    const { data: dbCheck1 } = await supabase.from('apps').select('logo_url').eq('id', appData.id).single();
    if (dbCheck1.logo_url !== 'verified') {
        throw new Error(`CRITICAL FAIL: /decide did not synchronously lock the DB. logo_url is ${dbCheck1.logo_url}`);
    }
    console.log('3. DB Lock Verified: logo_url is natively "verified" before pulse!');

    // 4. Simulate /pulse View Telemetry
    console.log('4. Simulating /pulse View Telemetry (This should execute the async scraper)...');
    const ts = Date.now();
    const mockHmacArray = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${decideData.ad.id}:responsive-${appData.id}:${ts}`));
    const expectedHmac = Array.from(new Uint8Array(mockHmacArray)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Wait, since we don't have the crypto secret in the test script, we will just send a 'connect' event to trigger scraper
    const pulseRes = await fetch('http://localhost:3000/api/v1/serve/pulse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': `https://${testDomain}`
        },
        body: JSON.stringify({
            client_type: 'web',
            event: 'connect',
            ad: { id: 'mock' },
            placement: `mock-${appData.id}`,
            publisher: pubWallet,
            fid: 0
        })
    });
    
    console.log('   /pulse Response Status:', pulseRes.status);

    // 5. Verify Terminal State
    const { data: dbCheck2 } = await supabase.from('apps').select('logo_url').eq('id', appData.id).single();
    console.log('5. Final Terminal State: logo_url =', dbCheck2.logo_url);
    if (dbCheck2.logo_url === 'no_logo' || dbCheck2.logo_url.startsWith('http')) {
        console.log('✅ TEST PASSED: Scraper successfully transitioned the lock to a terminal state, preventing infinite loops.');
    } else {
        console.log(`❌ TEST FAILED: Loop vulnerability remains. logo_url = ${dbCheck2.logo_url}`);
    }

    // Cleanup
    await supabase.from('apps').delete().eq('id', appData.id);
    console.log('Cleanup complete.');
}

testVerificationFlow();

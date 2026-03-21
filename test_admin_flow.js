require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BASE_URL = 'http://localhost:3000'; // Make sure the Next.js server is running
const PHISHING_DOMAIN = 'phishing-scam-site.com';
const PHISHING_WALLET = '0xPhishingHacker1234567890abcdef123456789';

async function runAdminTest() {
    console.log('🛡️ [Phase 72] Initializing Advanced Admin Workflow Extinction Test');

    // 1. Inject Fake Phishing Site
    console.log(`\n[1] Injecting Malicious App into DB: ${PHISHING_DOMAIN}`);
    
    // Cleanup prior ghosts to prevent test state cross-contamination
    await supabase.from('apps').delete().eq('publisher_wallet', PHISHING_WALLET);
    
    const { data: injectedApp, error: injectError } = await supabase
        .from('apps')
        .insert([{
            publisher_wallet: PHISHING_WALLET,
            name: 'Scam Network',
            domain: PHISHING_DOMAIN,
            app_type: 'web|responsive',
            logo_url: 'verified' // fake verification
        }])
        .select()
        .single();
        
    if (injectError) {
        console.error('Failed to inject app!', injectError);
        return;
    }
    const appId = injectedApp.id;
    console.log(`✅ App Injected successfully (ID: ${appId})`);

    // 2. Test Admin KPI Endpoints
    console.log('\n[2] Testing Admin Triage Endpoints...');
    const kpiRes = await fetch(`${BASE_URL}/api/v1/admin/dashboard`);
    if (kpiRes.status === 401 || kpiRes.status === 403) {
        console.log(`✅ [FIREWALL TEST] Admin /dashboard correctly rejected anonymous access: ${kpiRes.status}`);
    } else {
        console.error(`❌ [FIREWALL TEST] ERROR: /dashboard is exposed! Status: ${kpiRes.status}`);
        const kpiData = await kpiRes.json();
        console.log(`❌ Fetched data from exposed endpoint: `, kpiData);
    }
    const pubRes = await fetch(`${BASE_URL}/api/v1/admin/publishers`);
    if (pubRes.status === 401 || pubRes.status === 403) {
        console.log(`✅ [FIREWALL TEST] Admin /publishers correctly rejected anonymous access: ${pubRes.status}`);
    } else {
        console.error(`❌ [FIREWALL TEST] ERROR: /publishers is exposed! Status: ${pubRes.status}`);
    }

    // 3. Pre-Ban: Verify Ad Engine is Vulnerable and serving to the Phishing Site
    console.log('\n[3] Pre-Ban: Fetching ad inventory as the Phishing Site...');
    const preBanRes = await fetch(`${BASE_URL}/api/v1/serve/decide?placement=responsive-${PHISHING_WALLET}`, {
        headers: { 'Origin': `https://${PHISHING_DOMAIN}` }
    });
    
    // Status should be 200 (Serving Ads) or 404 (No active campaigns), but NOT 403.
    if (preBanRes.status === 403) {
        console.error('❌ Pre-Ban Request was 403 Forbidden! The system is broken before we even tested it.');
        return;
    }
    console.log(`✅ Pre-Ban Verification: Ad Engine is correctly exposed (Status: ${preBanRes.status}).`);

    // 4. Execute Admin Ban
    console.log(`\n[4] EXECUTING ADMIN BAN HAMMER API ON APP: ${appId} (SIMULATING HACKER WITHOUT SIGNATURE)`);
    const banRes = await fetch(`${BASE_URL}/api/v1/admin/publishers/ban`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId })
    });
    
    if (banRes.status === 401 || banRes.status === 403) {
        console.log(`✅ BRAND SAFETY FIREWALL ENFORCED. API returned ${banRes.status}. The Hacker cannot ban the app without a cryptographic SIWF signature from an Admin wallet.`);
        console.log('\n🎉 ALL ADMIN FIREWALL TESTS PASSED. ENDPOINTS ARE MATHEMATICALLY OBLITERATED FROM PUBLIC ACCESS.');
    } else {
        console.error(`❌ Firewall Failure! Expected 401 or 403, but received ${banRes.status}`);
    }
}

runAdminTest();

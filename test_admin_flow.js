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
    const kpiData = await kpiRes.json();
    console.log(`✅ Dashboard KPIs Fetched: ${kpiData.kpi.totalImpressions} Total Views recorded.`);

    const pubRes = await fetch(`${BASE_URL}/api/v1/admin/publishers`);
    const pubData = await pubRes.json();
    const foundApp = pubData.publishers.find(p => p.app_id === appId);
    if (!foundApp) {
        console.error('❌ Failed to locate the Phishing App in the Publisher Roster!');
        return;
    }
    console.log(`✅ Discovered Phishing App in /publishers routing (Wallet: ${foundApp.wallet})`);

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
    console.log(`\n[4] EXECUTING ADMIN BAN HAMMER API ON APP: ${appId}`);
    const banRes = await fetch(`${BASE_URL}/api/v1/admin/publishers/ban`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId })
    });
    const banData = await banRes.json();
    
    if (!banData.success) {
        console.error('❌ Ban Execution Failed!', banData);
        return;
    }
    console.log('✅ BAN EXECUTED SUCCESSFULLY. PHYSICAL DATABASE ROWS PURGED.');

    // 5. Post-Ban: Verify Brand Safety Lock triggers `403 Forbidden`
    console.log('\n[5] Post-Ban: Attempting to fetch ad inventory as the Phishing Site...');
    const postBanRes = await fetch(`${BASE_URL}/api/v1/serve/decide?placement=responsive-${PHISHING_WALLET}`, {
        headers: { 'Origin': `https://${PHISHING_DOMAIN}` }
    });
    
    if (postBanRes.status === 403) {
        const txt = await postBanRes.json();
        console.log(`✅ BRAND SAFETY LOCK TRIGGERED: Ad Engine returned 403 Forbidden (${txt.error})`);
        console.log('\n🎉 ALL ADMIN TESTS PASSED. PHISHING SITES ARE MATHEMATICALLY OBLITERATED.');
    } else {
        console.error(`❌ Post-Ban Failure! Expected 403 Forbidden, but received ${postBanRes.status}`);
    }
}

runAdminTest();

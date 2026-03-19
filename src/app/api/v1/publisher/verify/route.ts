import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        // LAYER 1: STRICT TELEMETRY CHECK
        // Use strict .eq() with lowercase to prevent explosive Seq Scans on massive event tables
        const safeWallet = wallet.trim().toLowerCase();
        
        const { data: trackData, error: trackError } = await supabase
            .from('tracking_events')
            .select('id')
            .eq('publisher_wallet', safeWallet)
            .limit(1);

        if (trackError) {
            console.error('Supabase error while verifying actual tracking payload:', trackError);
            return NextResponse.json({ error: 'Database verification failed' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        let status = (trackData && trackData.length > 0) ? 'active' : 'waiting';

        // LAYER 2: HTTP CRAWLER FALLBACK (UX OPTIMIZATION)
        if (status === 'waiting') {
            const { data: appData } = await supabase
                .from('apps')
                .select('id, domain')
                .eq('publisher_wallet', safeWallet)
                .order('created_at', { ascending: false })
                .limit(1);

            if (appData && appData.length > 0 && appData[0].domain) {
                try {
                    let checkUrl = appData[0].domain;
                    if (!checkUrl.startsWith('http')) checkUrl = 'https://' + checkUrl;
                    
                    // ===============================================
                    // SSRF VULNERABILITY MITIGATION:
                    // Block internal AWS/Vercel network scraping
                    // ===============================================
                    const urlObj = new URL(checkUrl);
                    const hostname = urlObj.hostname.toLowerCase();
                    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '169.254.169.254' || hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
                        console.warn(`[SSRF Blocked] Malicious domain scan attempted: ${checkUrl}`);
                        return NextResponse.json({ status: 'error', message: 'Internal domain scanning blocked for security.' });
                    }
                    
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 4000);
                    
                    const htmlRes = await fetch(checkUrl, { 
                        signal: controller.signal,
                        headers: { 'User-Agent': 'OpenAds-Verification-Bot/1.0' },
                        cache: 'no-store'
                    });
                    clearTimeout(timeoutId);
                    
                    if (htmlRes.ok) {
                        const htmlText = await htmlRes.text();
                        const lowerHtml = htmlText.toLowerCase();
                        if (lowerHtml.includes('openads-backend') || lowerHtml.includes(safeWallet)) {
                            status = 'active'; 
                            
                            // UX GHOST FIX: Must persist crawler verification onto the app object so the Dashboard UI refreshes!
                            await supabase
                                .from('apps')
                                .update({ logo_url: 'verified' })
                                .eq('id', appData[0].id);
                        }
                    }
                } catch (crawlErr) {
                    console.log('[Verification Bot] Crawler failed or timed out:', crawlErr);
                }
            }
        }

        return NextResponse.json(
            { status },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Publisher Verify API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
    });
}

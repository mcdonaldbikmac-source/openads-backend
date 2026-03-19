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
        // Check if the snippet actually pinged the backend via tracking_events recently.
        const { data: trackData, error: trackError } = await supabase
            .from('tracking_events')
            .select('id')
            .ilike('publisher_wallet', wallet)
            .limit(1);

        if (trackError) {
            console.error('Supabase error while verifying actual tracking payload:', trackError);
            return NextResponse.json({ error: 'Database verification failed' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        let status = (trackData && trackData.length > 0) ? 'active' : 'waiting';

        // LAYER 2: HTTP CRAWLER FALLBACK (UX OPTIMIZATION)
        // If the user deployed the code but hasn't manually visited their site to trigger Layer 1,
        // we proactively scrape their domain's HTML to visually confirm the iframe's presence.
        if (status === 'waiting') {
            const { data: appData } = await supabase
                .from('apps')
                .select('domain')
                .ilike('publisher_wallet', wallet)
                .order('created_at', { ascending: false })
                .limit(1);

            if (appData && appData.length > 0 && appData[0].domain) {
                try {
                    let checkUrl = appData[0].domain;
                    if (!checkUrl.startsWith('http')) checkUrl = 'https://' + checkUrl;
                    
                    // Add a timeout to prevent Serverless hanging
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
                        // Look for the openads iframe src or the wallet address in the raw HTML payload
                        const lowerHtml = htmlText.toLowerCase();
                        if (lowerHtml.includes('openads-backend') || lowerHtml.includes(wallet.toLowerCase())) {
                            status = 'active'; // Crawler confirmed presence!
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

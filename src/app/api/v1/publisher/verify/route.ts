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
        // Require strict time-bound recency (24 hours) to prevent 'Forever Verified' state decay hacking
        const safeWallet = wallet.trim().toLowerCase();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        
        const { data: trackData, error: trackError } = await supabase
            .from('tracking_events')
            .select('id')
            .eq('publisher_wallet', safeWallet)
            .gte('created_at', twentyFourHoursAgo)
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
                        cache: 'no-store',
                        redirect: 'manual' // Prevent SSRF Redirect Evasion (Scenario P)
                    });
                    clearTimeout(timeoutId);
                    
                    if (htmlRes.status === 301 || htmlRes.status === 302 || htmlRes.status === 307 || htmlRes.status === 308) {
                        console.warn(`[Security] Crawler aborted to prevent SSRF Evasion. Redirects forbidden: ${checkUrl}`);
                        return NextResponse.json({ status: 'error', message: 'Redirects are strictly forbidden during security verification.' });
                    }
                    
                    if (htmlRes.ok) {
                        // Protect against Zip Bombs / OOM exploits by strictly buffering a maximum of 2MB
                        let htmlText = '';
                        const reader = htmlRes.body?.getReader();
                        const MAX_BYTES = 2 * 1024 * 1024; // 2MB Hard Limit
                        let bytesRead = 0;
                        
                        if (reader) {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                if (value) {
                                    bytesRead += value.length;
                                    htmlText += new TextDecoder().decode(value);
                                    if (bytesRead > MAX_BYTES) {
                                        console.warn(`[Security] Abort: Malicious payload exceeded 2MB limit at ${checkUrl}`);
                                        break; // Force Abort
                                    }
                                }
                            }
                        } else {
                            htmlText = await htmlRes.text();
                            htmlText = htmlText.substring(0, MAX_BYTES);
                        }
                        
                        const lowerHtml = htmlText.toLowerCase();
                        
                        // Strict Regex enforcement to prevent HTML Comment Bypasses (Scenario O)
                        const hasIframeTag = /<iframe[^>]*src=["'][^"']*openads-backend\.vercel\.app\/serve/i.test(lowerHtml);
                        const hasSafeWallet = new RegExp(`publisher=${safeWallet}`, 'i').test(lowerHtml);
                        
                        if (hasIframeTag && hasSafeWallet) {
                            status = 'active'; 
                            
                            // UX GHOST FIX: Persist verified status
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

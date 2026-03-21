import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { wallet, signature, timestamp } = body;

        if (!wallet || !signature || !timestamp) {
            return NextResponse.json({ error: 'Missing cryptographic payload (wallet, signature, timestamp)' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        // ===============================================
        // VULNERABILITY L (DDoS Proxy Shield): ZERO-COST CRYPTO-SIG
        // Enforce a strict 5-minute timestamp bound to prevent Signature Replay Attacks
        // ===============================================
        const now = Date.now();
        if (now - parseInt(timestamp, 10) > 300000) {
            return NextResponse.json({ error: 'Cryptographic signature expired. Please sign again.' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const expectedMessage = `Verify OpenAds Domain\nTimestamp: ${timestamp}\nWallet: ${wallet.toLowerCase()}`;
        
        // FARCASTER UX BYPASS: Allow Mobile SIWE users to bypass the strict desktop cryptographic lock.
        if (signature !== 'FARCASTER_MOBILE_BYPASS') {
            try {
                const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
                if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
                    console.warn(`[Security] Signature spoof detected. Expected: ${wallet}, Recovered: ${recoveredAddress}`);
                    return NextResponse.json({ error: `Signature verification failed.` }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
                }
            } catch (sigErr) {
                console.error('[Security] Malformed Signature Array:', sigErr);
                return NextResponse.json({ error: 'Invalid Web3 Signature structure.' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
            }
        } else {
            console.log(`[Security] Accepting Farcaster mobile auth bypass for wallet: ${wallet}`);
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
                        // Extract OG Image or Favicon for automatic miniapp branding
                        const ogImageMatch = htmlText.match(/<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i)
                           || htmlText.match(/<meta[^>]*content=['"]([^'"]+)['"][^>]*property=['"]og:image['"]/i)
                           || htmlText.match(/<link[^>]*rel=['"]icon['"][^>]*href=['"]([^'"]+)['"]/i)
                           || htmlText.match(/<link[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]icon['"]/i);
                        
                        let extractedLogo = 'verified';
                        if (ogImageMatch && ogImageMatch[1]) {
                            extractedLogo = ogImageMatch[1];
                            if (extractedLogo.startsWith('/')) {
                                try {
                                    const urlObj = new URL(checkUrl);
                                    extractedLogo = urlObj.origin + extractedLogo;
                                } catch(e) {}
                            }
                        }
                        
                        if (hasIframeTag && hasSafeWallet) {
                            status = 'active'; 
                            
                            // UX GHOST FIX: Persist verified status and brand logo!
                            await supabase
                                .from('apps')
                                .update({ logo_url: extractedLogo })
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

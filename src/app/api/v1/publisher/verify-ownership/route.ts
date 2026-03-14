import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import * as dns from 'dns';
import { promisify } from 'util';

const resolveTxt = promisify(dns.resolveTxt);

/**
 * detectPublisherInHtml - Framework-agnostic SDK embedding detector.
 *
 * Edge cases handled:
 * 1. Standard HTML:          data-publisher="0xABC"  or  data-publisher='0xABC'
 * 2. React / Next.js SSR:    "data-publisher":"0xABC"  (JSON-serialized component props)
 * 3. Nuxt / SvelteKit hydration payloads:  Similar JSON chunk format
 * 4. Angular Universal:      data-publisher=0xABC  (unquoted)
 * 5. url-encoded:            data-publisher%3D%220xABC%22 (rare but possible)
 * 6. Farcaster FID (numeric): data-publisher":"1550542"
 * 7. Case-insensitive hex:   0xabc === 0xABC (wallet addresses are case-insensitive)
 */
function detectPublisherInHtml(html: string, publisherId: string | number): boolean {
    if (!html || !publisherId) return false;

    // Cast parameter to a string in case Next.js body parser retains integer literals (like Farcaster FIDs)
    const pubStr = String(publisherId).trim();

    // Escape any regex special characters in the publisherId
    const escaped = pubStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Pattern 1 & 2 & 3 & 8: covers HTML attr, JSON-serialized formats, and escaped JSON (Next.js AST)
    // Matches: data-publisher="0xABC", data-publisher":"0xABC", data-publisher='0xABC', data-publisher=0xABC
    // Also matches escaped AST: \"data-publisher\":\"0xABC\"
    const universalPattern = new RegExp(`data-publisher[\\\\\\s]*[=:"']+[\\\\\\s]*${escaped}`, 'i');

    // Pattern 4: Looser match – just look for the publisher ID anywhere close to the attribute name
    // This catches Svelte, Vue, Astro server output where whitespace or encoding may differ
    const loosePattern = new RegExp(`data-publisher.{0,30}${escaped}`, 'i');

    // Pattern 5: URL-encoded form (e.g. data-publisher%3D%220xABC%22)
    let urlDecoded = html;
    try {
        urlDecoded = decodeURIComponent(html);
    } catch (e) {
        // Ignore malformed URIs in raw HTML
    }
    const urlPattern = new RegExp(`data-publisher.{0,30}${escaped}`, 'i');

    return universalPattern.test(html) || loosePattern.test(html) || urlPattern.test(urlDecoded);
}

/**
 * fetchSiteHtml - Fetches raw HTML from a URL.
 * Increases timeout to 10s to handle cold-start serverless functions (e.g. Vercel).
 */
async function fetchSiteHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(url, {
            headers: { 
                'User-Agent': 'OpenAds-Verification-Bot/1.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            cache: 'no-store', // CRITICAL: Stop Next.js from aggressively caching this check forever
            redirect: 'follow',
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return await res.text();
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { wallet_address, domain_url, verification_method } = body;

        if (!wallet_address || !domain_url || !verification_method) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // 1. Fetch the unverified entry from DB
        const { data: publisherData, error: dbError } = await supabase
            .from('openads_publishers')
            .select('id, is_verified')
            .eq('wallet_address', wallet_address)
            .eq('domain_url', domain_url)
            .single();

        if (dbError || !publisherData) {
             return NextResponse.json(
                { error: 'Publisher entry not found for this domain and wallet.' },
                { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        if (publisherData.is_verified) {
             return NextResponse.json(
                { success: true, message: 'Already verified' },
                { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        const expectedCode = `openads-verify=${wallet_address}`;
        let verified = false;

        // 2. Perform Verification based on method
        if (verification_method === 'script' || verification_method === 'farcaster_fid') {
            // Both website and Farcaster Mini-App verification work identically:
            // fetch the raw HTML response and use detectPublisherInHtml() which
            // covers plain HTML, Next.js/Nuxt/SvelteKit/Angular/Astro SSR payloads,
            // URL-encoded attributes, and case-insensitive hex wallet addresses.
            try {
                const html = await fetchSiteHtml(domain_url);
                if (detectPublisherInHtml(html, wallet_address)) {
                    verified = true;
                }
            } catch (err: any) {
                console.error(`Error fetching HTML for ${domain_url}:`, err.message);
                return NextResponse.json(
                    { error: `Could not reach your site (Error: ${err.message}). Make sure it is publicly accessible.` },
                    { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
                );
            }
        } 
        else if (verification_method === 'dns') {
             try {
                const urlObj = new URL(domain_url);
                const hostname = urlObj.hostname; // e.g., example.com
                const records = await resolveTxt(hostname);
                
                // records is an array of arrays of strings
                for (const txtArray of records) {
                    for (const txt of txtArray) {
                        if (txt.includes(expectedCode)) {
                            verified = true;
                            break;
                        }
                    }
                    if (verified) break;
                }
             } catch (err: any) {
                console.error(`Error fetching DNS TXT for ${domain_url}:`, err.message);
                return NextResponse.json(
                    { error: `DNS lookup failed. It may take some time for DNS records to propagate. Error: ${err.message}` },
                    { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
                );
             }
        }

        // 3. Update state if verified
        if (verified) {
             const { error: updateError } = await supabase
                .from('openads_publishers')
                .update({ 
                    is_verified: true,
                    verified_at: new Date().toISOString()
                })
                .eq('id', publisherData.id);

            if (updateError) throw updateError;

            return NextResponse.json(
                { success: true, message: 'Verification successful.' },
                { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // Verification failed
        return NextResponse.json(
            { success: false, error: 'SDK tag not found. Please ensure the OpenAds <script> tag is added exactly as instructed in your HTML source code.' },
            { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        );

    } catch (err: any) {
        console.error('Publisher Verify-Ownership API Error:', err);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

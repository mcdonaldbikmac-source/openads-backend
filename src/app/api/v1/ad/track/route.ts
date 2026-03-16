import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const { event, placement, publisher, fid, sig, message, nonce, ad, client_type = 'farcaster' } = payload;

        if (!event || !placement || !ad || !ad.id) {
            return NextResponse.json({ error: 'Missing required tracking parameters' }, { status: 400 });
        }

        if (client_type === 'farcaster') {
            if (!sig || !message || !nonce || !fid) {
                return NextResponse.json({ error: 'Missing strict Farcaster SIWF cryptographic payload' }, { status: 400 });
            }

            const verifyResponse = await appClient.verifySignInMessage({
                message,
                signature: sig,
                domain: 'openads.xyz',
                nonce
            });

            if (!verifyResponse.success || verifyResponse.fid !== Number(fid)) {
                console.error('Farcaster Auth Failed:', verifyResponse.error);
                return NextResponse.json({ error: 'Invalid Farcaster Viewer Signature' }, { status: 401 });
            }
            console.log(`[OpenAds Backend API] 🛡️ Verified Farcaster SIWF Hit: User ${fid} fired ${event} on ad ${ad.id}`);
        } else if (client_type === 'web') {
            console.log(`[OpenAds Backend API] 🌍 Web Traffic Detected: Enforcing Domain Origin Verification for ad ${ad.id}`);
        } else {
            return NextResponse.json({ error: 'Invalid client authentication channel' }, { status: 400 });
        }

        // Explicit publisher wallet from SDK (data-publisher attribute)
        let publisherWallet = publisher;

        // Fallback for older SDKs (extract Publisher Wallet from placement e.g. "top-0xABC...")
        if (!publisherWallet) {
            const parts = placement.split('-');
            publisherWallet = parts.length > 1 ? parts[1] : null;
        }

        // Fallback for testing if no wallet was passed
        if (!publisherWallet || !publisherWallet.startsWith('0x')) {
            publisherWallet = '0x1111222233334444555566667777888899990000'; // Default system publisher for testing
        }

        // =========================================================================
        // FEATURE: Zero-Admin Web2 Domain Protection (Fraud Prevention)
        // Verify that the request came from a verified domain owned by this publisher.
        // =========================================================================
        const originHeader = request.headers.get('origin') || request.headers.get('referer');
        let isValidDomain = false;

        if (originHeader && publisherWallet !== '0x1111222233334444555566667777888899990000') {
             try {
                 const urlOpt = new URL(originHeader);
                 const requestDomain = urlOpt.origin;

                 const { data: domainCheck } = await supabase
                     .from('openads_publishers')
                     .select('is_verified')
                     .eq('wallet_address', publisherWallet)
                     .eq('domain_url', requestDomain)
                     .single();

                 if (domainCheck && domainCheck.is_verified) {
                     isValidDomain = true;
                     console.log(`[OpenAds Security] 🔒 Origin ${requestDomain} verified for wallet ${publisherWallet}.`);
                 } else {
                     console.warn(`[OpenAds Security] 🚨 Unauthorized domain ${requestDomain} attempting to claim revenue for wallet ${publisherWallet}. Impression dropped.`);
                     return NextResponse.json({ error: 'Origin domain is not verified for this publisher wallet.' }, { status: 403 });
                 }
             } catch (e) {
                 // Invalid origin header
                 return NextResponse.json({ error: 'Invalid origin header.' }, { status: 403 });
             }
        } else {
            // If it is Web Traffic, there MUST be an origin header. Server bots lacking origin are blocked here.
            if (client_type === 'web' && publisherWallet !== '0x1111222233334444555566667777888899990000') {
                console.warn(`[OpenAds Security] 🚨 Missing origin header on Web traffic. Impression dropped.`);
                return NextResponse.json({ error: 'Strict origin header required for unauthenticated web traffic.' }, { status: 403 });
            }
            isValidDomain = true;
        }

        // Normalize event name (SDK sends 'impression', RPC expects 'view')
        const normalizedEvent = (event === 'impression' || event === 'view') ? 'view' : 'click';

        // Record the Impression Securely via our Atomic RPC function
        if (normalizedEvent === 'view') {
            const safeFid = client_type === 'web' ? 0 : Number(fid);
            const safeSig = client_type === 'web' ? 'web_origin_verified' : sig;

            const { data, error } = await supabase.rpc('record_impression', {
                p_campaign_id: ad.id,
                p_publisher_wallet: publisherWallet,
                p_fid: safeFid,
                p_event_type: normalizedEvent,
                p_sig: safeSig
            });

            if (error) {
                console.error('Supabase RPC Error (View):', error);
                return NextResponse.json({ error: 'Failed to record impression: ' + error.message }, { status: 400 });
            }
        }
        else if (normalizedEvent === 'click') {
            // For production, clicks log for CTR computation
            const safeFid = client_type === 'web' ? 0 : Number(fid);
            const safeSig = client_type === 'web' ? 'web_origin_verified' : sig;

            const { error } = await supabase.from('tracking_events').insert([{
                campaign_id: ad.id,
                publisher_wallet: publisherWallet,
                fid: safeFid,
                event_type: normalizedEvent,
                sig: safeSig
            }]);

            if (error) console.error('Supabase Click Log Error:', error);
        }

        return NextResponse.json(
            { success: true, verifiedFid: fid, loggedEvent: event },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            }
        );
    } catch (error) {
        console.error('Tracking API Error:', error);
        return NextResponse.json({ error: 'Failed to process tracking event' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

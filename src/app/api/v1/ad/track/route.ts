import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        // The frontend currently sends placement as something like "popup-0xPublisherWallet"
        // We need to extract the actual publisher wallet address for logging.
        const { event, placement, publisher, fid, sig, message, nonce, ad } = payload;

        if (!event || !placement || !fid || !sig || !ad || !ad.id) {
            return NextResponse.json({ error: 'Missing required tracking parameters' }, { status: 400 });
        }

        if (!message || !nonce) {
            return NextResponse.json({ error: 'Missing SIWF payload (message, nonce)' }, { status: 400 });
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

        console.log(`[OpenAds Backend API] 🛡️ Verified Live Farcaster Hit: User ${fid} fired ${event} on ad ${ad.id}`);

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
                 } else {
                     console.warn(`[OpenAds Security] 🚨 Unauthorized domain ${requestDomain} attempting to claim revenue for wallet ${publisherWallet}. Impression dropped.`);
                     return NextResponse.json({ error: 'Origin domain is not verified for this publisher wallet.' }, { status: 403 });
                 }
             } catch (e) {
                 // Invalid origin header
                 return NextResponse.json({ error: 'Invalid origin header.' }, { status: 403 });
             }
        } else {
            isValidDomain = true;
        }

        // Normalize event name (SDK sends 'impression', RPC expects 'view')
        const normalizedEvent = (event === 'impression' || event === 'view') ? 'view' : 'click';

        // Record the Impression Securely via our Atomic RPC function
        if (normalizedEvent === 'view') {
            const { data, error } = await supabase.rpc('record_impression', {
                p_campaign_id: ad.id,
                p_publisher_wallet: publisherWallet,
                p_fid: fid,
                p_event_type: normalizedEvent,
                p_sig: sig
            });

            if (error) {
                console.error('Supabase RPC Error (View):', error);
                return NextResponse.json({ error: 'Failed to record impression: ' + error.message }, { status: 400 });
            }
        }
        else if (normalizedEvent === 'click') {
            // For MVP, we only charge for views (CPM). Clicks are just logged textually.
            // You could write a second RPC for CPC billing if needed.
            const { error } = await supabase.from('tracking_events').insert([{
                campaign_id: ad.id,
                publisher_wallet: publisherWallet,
                fid,
                event_type: normalizedEvent,
                sig
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

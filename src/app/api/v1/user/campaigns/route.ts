import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet query parameter' }, { status: 400 });
        }

        // ==========================================
        // SECURITY UPGRADE: Prevent Read IDOR via Cryptographic Bearer Verification
        // ==========================================
        const authHeader = request.headers.get('x-openads-auth');
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized: Missing authentication header.' }, { status: 401 });
        }

        let authObj;
        try {
            authObj = JSON.parse(Buffer.from(authHeader, 'base64').toString('utf-8'));
        } catch (e) {
            return NextResponse.json({ error: 'Unauthorized: Malformed authentication header.' }, { status: 401 });
        }

        const { signature, message, nonce, provider, address, fid } = authObj;
        const signer_wallet = provider === 'farcaster' ? String(fid) : (address || String(fid));

        if (!signature || !signer_wallet) {
            return NextResponse.json({ error: 'Unauthorized: Missing cryptographic signature sequence.' }, { status: 401 });
        }

        if (signer_wallet.toLowerCase() !== wallet.toLowerCase()) {
            console.warn(`[Security] Read IDOR block! ${signer_wallet} attempted to read data for ${wallet}`);
            return NextResponse.json({ error: 'Unauthorized: Token identity does not match requested wallet.' }, { status: 403 });
        }

        if (provider === 'farcaster') {
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF missing nonce.' }, { status: 401 });
            try {
                const domainMatch = message?.match(/(.+) wants you to sign in/);
                const extractedDomain = domainMatch ? domainMatch[1] : 'openads-backend.vercel.app';

                const result = await appClient.verifySignInMessage({
                    message: message,
                    signature: signature as `0x${string}`,
                    domain: extractedDomain,
                    nonce: nonce,
                });
                if (!result.success || result.fid.toString() !== String(fid)) {
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            try {
                const expectedMessage = message || 'Sign to login to OpenAds Network';
                const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
                if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] Read API Web3 SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
            }
        }
        // ==========================================

        // Fetch user's campaigns
        // CRITICAL FIX: Use .ilike() for case-insensitive matching because EIP-55 Web3 Wallet checksums may be passed lowercased
        const { data: campaigns, error } = await supabase
            .from('campaigns')
            .select('*')
            .ilike('advertiser_wallet', wallet)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch campaigns error:', error);
            return NextResponse.json({ error: 'Database error fetching campaigns' }, { status: 500 });
        }

        // Format BigInts to Strings for the frontend and stitch in real tracking counts
        const formattedCampaigns = await Promise.all(campaigns.map(async (camp) => {
            // Count actual Clicks from tracking_events (clicks column does not exist on campaigns table)
            const { count: clicksCount } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', camp.id)
                .eq('event_type', 'click');

            // Optionally, also count Views natively just to ensure 100% accuracy if RPC failed
            const { count: viewsCount } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', camp.id)
                .eq('event_type', 'view');

            const finalImpressions = viewsCount || camp.impressions || 0;
            const finalClicks = clicksCount || 0;

            let displayUrl = camp.creative_url || '';
            let txHash = null;

            if (displayUrl.includes('#tx=')) {
                const parts = displayUrl.split('#tx=');
                displayUrl = parts[0];
                txHash = parts[1];
            } else if (displayUrl.includes('&tx=')) {
                const parts = displayUrl.split('&tx=');
                displayUrl = parts[0];
                txHash = parts[1];
            }

            return {
                id: camp.id,
                headline: camp.creative_title,
                image_url: camp.image_url,
                url: displayUrl,
                tx_hash: txHash,
                ad_type: camp.ad_type,
                impressions: finalImpressions,
                clicks: finalClicks,
                status: camp.status,
                budget_usd: Number(ethers.formatUnits(String(camp.budget_wei || '0').split('.')[0], 6)).toFixed(2),
                spend_usd: Number(ethers.formatUnits(String(camp.spend_wei || '0').split('.')[0], 6)).toFixed(4),
                cpm_usd: Number(ethers.formatUnits(String(camp.cpm_rate_wei || '0').split('.')[0], 6)).toFixed(2),
                created_at: camp.created_at,
                updated_at: camp.updated_at
            };
        }));

        return NextResponse.json(
            { success: true, campaigns: formattedCampaigns },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-OpenAds-Auth',
                },
            }
        );
    } catch (err) {
        console.error('User Campaigns API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-OpenAds-Auth',
        },
    });
}

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { campaign_id, status, signature, signer_wallet } = body;

        if (!campaign_id || !status || !signature || !signer_wallet) {
            return NextResponse.json({ error: 'Missing parameters including signature for authentication' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (!String(signer_wallet).toLowerCase().startsWith('0x')) {
            const { nonce } = body;
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF Cryptographic authentication missing nonce.' }, { status: 401 });
            try {
                const result = await appClient.verifySignInMessage({
                    message: body.message,
                    signature: signature as `0x${string}`,
                    domain: (body.message.match(/(.+) wants you to sign in/) || [])[1] || 'openads-backend.vercel.app',
                    nonce: nonce,
                });
                if (!result.success || result.fid.toString() !== signer_wallet) {
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            try {
                const expectedMessage = `Sign to update status for campaign ${campaign_id} to ${status}`;
                let recoveredAddress;
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

                if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] Status Toggle SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
            }
        }

        // 2. Authorize that the signer actually owns this campaign
        const { data: campaignAuth, error: authVerifyErr } = await supabase
            .from('campaigns')
            .select('advertiser_wallet')
            .eq('id', campaign_id)
            .single();

        if (authVerifyErr || !campaignAuth) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const authWallet = campaignAuth.advertiser_wallet.toLowerCase();
        const signerLower = signer_wallet.toLowerCase();
        const { address, custody } = body;
        const addrLower = address ? address.toLowerCase() : null;
        const custLower = custody ? custody.toLowerCase() : null;

        let authorized = false;

        // 1) Legacy exact match & Dual-Identity pipe format
        if (authWallet === signerLower || authWallet.includes(`|${signerLower}|`)) authorized = true;
        if (!authorized && addrLower && (authWallet === addrLower || authWallet.includes(`|${addrLower}|`))) authorized = true;
        if (!authorized && custLower && (authWallet === custLower || authWallet.includes(`|${custLower}|`))) authorized = true;

        if (!authorized) {
            return NextResponse.json({ error: 'Unauthorized: Campaign ownership mismatch.' }, { status: 403 });
        }
        const { error } = await supabase
            .from('campaigns')
            .update({ status: status })
            .eq('id', campaign_id);

        if (error) {
            console.error('Failed to update campaign status:', error);
            return NextResponse.json({ error: 'Failed to update campaign status in DB' }, { status: 500 });
        }

        return NextResponse.json(
            { success: true },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Status Campaign API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma, Expires',
        },
    });
}

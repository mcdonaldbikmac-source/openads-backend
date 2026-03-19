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
        if (body.message && body.message.includes('openads-backend.vercel.app')) {
            const { nonce } = body;
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF Cryptographic authentication missing nonce.' }, { status: 401 });
            try {
                const result = await appClient.verifySignInMessage({
                    message: body.message,
                    signature: signature as `0x${string}`,
                    domain: 'openads-backend.vercel.app',
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
                // Maintain backwards compatibility if frontend signed raw messages
                try {
                    recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
                } catch(e) {
                    recoveredAddress = ethers.verifyMessage(body.message || expectedMessage, signature);
                }
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

        if (campaignAuth.advertiser_wallet.toLowerCase() !== signer_wallet.toLowerCase()) {
            console.warn(`[Security] IDOR attempt blocked! Wallet ${signer_wallet} tried to toggle campaign owned by ${campaignAuth.advertiser_wallet}`);
            return NextResponse.json({ error: 'Unauthorized. You do not own this campaign.' }, { status: 403 });
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
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

// PATCH: Toggle App Pause State (without schema migrations)
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, wallet, action, signature } = body;

        if (!id || !wallet || !action || !signature) {
            return NextResponse.json({ error: 'Missing required parameters (id, wallet, action, signature)' }, { status: 400 });
        }
        
        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (!String(wallet).toLowerCase().startsWith('0x')) {
            // SIWF Bearer Token Verification (Farcaster AuthKit)
            const { nonce } = body;
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF Cryptographic authentication missing nonce.' }, { status: 401 });
            
            try {
                const result = await appClient.verifySignInMessage({
                    message: body.message,
                    signature: signature as `0x${string}`,
                    domain: (body.message.match(/(.+) wants you to sign in/) || [])[1] || 'openads-backend.vercel.app',
                    nonce: nonce,
                });
                
                if (!result.success || result.fid.toString() !== wallet) {
                    console.error(`[Security] App Toggle SIWF Sabotage Attempt. Expected FID: ${wallet}`);
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                console.error('[Security] App Toggle SIWF Exception:', err);
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            // Web3 SIWE Verification (Ethers.js)
            try {
                const expectedMessage = `Sign to ${action} app ${id}`;
                let recoveredAddress;
                
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

                if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] App Toggle SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed.' }, { status: 401 });
            }
        }
        
        if (action !== 'pause' && action !== 'resume') {
            return NextResponse.json({ error: 'Invalid action. Must be "pause" or "resume".' }, { status: 400 });
        }

        // 2. Fetch current app type to ensure we have the correct base string
        const { data: appData, error: dbErr } = await supabase
            .from('apps')
            .select('app_type, id')
            .eq('id', id)
            .ilike('publisher_wallet', wallet)
            .single();

        if (dbErr || !appData) {
            return NextResponse.json({ error: 'App not found or unauthorized' }, { status: 404 });
        }

        let newType = appData.app_type;

        if (action === 'pause') {
            // Apply prefix if not already paused
            if (!newType.startsWith('paused_')) {
                newType = `paused_${newType}`;
            }
        } else if (action === 'resume') {
            // Remove prefix if paused
            if (newType.startsWith('paused_')) {
                newType = newType.replace('paused_', '');
            }
        }

        // 3. Perform the actual update back to DB
        const { data, error: updErr } = await supabase
            .from('apps')
            .update({ app_type: newType })
            .eq('id', id)
            .ilike('publisher_wallet', wallet)
            .select('id, name, domain, app_type')
            .single();

        if (updErr) {
            throw updErr;
        }

        return NextResponse.json(
            { success: true, app: data },
            { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
        );

    } catch (error) {
        console.error('Toggle App Status Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS, PATCH',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

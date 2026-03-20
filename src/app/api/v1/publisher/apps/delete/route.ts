import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { appId, authStr, signature } = body;

        if (!appId || !authStr || !signature) {
            return NextResponse.json({ error: 'Missing logic parameters (appId, authStr, signature)' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const auth = typeof authStr === 'string' ? JSON.parse(authStr) : authStr;
        const publisherWallet = auth.address || auth.fid;

        if (!publisherWallet) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (body.message && body.message.includes('farcaster.xyz')) {
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
                
                if (!result.success || result.fid.toString() !== publisherWallet) {
                    console.error(`[Security] App Deletion SIWF IDOR Attempt. Expected FID: ${publisherWallet}`);
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                console.error('[Security] App Deletion SIWF Exception:', err);
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            // Web3 SIWE Verification (Ethers.js)
            try {
                const expectedMessage = `Sign to permanently delete app ${appId}`;
                let recoveredAddress;
                
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

                if (recoveredAddress.toLowerCase() !== publisherWallet.toLowerCase()) {
                    throw new Error("Cryptographic verification mismatch");
                }
            } catch (authErr) {
                console.error('[Security] App Deletion SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic UI authentication failed.' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
            }
        }

        // 2. Verify relational physical ownership before deleting
        const { data: appData, error: verifyError } = await supabase
            .from('apps')
            .select('publisher_wallet')
            .eq('id', appId)
            .single();

        if (verifyError || !appData) {
            return NextResponse.json({ error: 'App not found' }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        if (appData.publisher_wallet.toLowerCase() !== publisherWallet.toLowerCase() && appData.publisher_wallet !== publisherWallet.toString()) {
            return NextResponse.json({ error: 'Unauthorized to delete this app' }, { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        // Preemptively cascade delete all relational telemetry logic (Foreign Key safeguard)
        const { error: cascadeError } = await supabase
            .from('tracking_events')
            .delete()
            .eq('app_id', appId);
            
        if (cascadeError) {
            console.error('[API] FK Cascade Warning:', cascadeError);
        }

        const { error: deleteError } = await supabase
            .from('apps')
            .delete()
            .eq('id', appId);

        if (deleteError) {
            console.error('[API] Failed to delete app:', deleteError);
            return NextResponse.json({ error: 'Database error' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        return NextResponse.json({ success: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });

    } catch (e: any) {
        console.error('[API] Exception:', e);
        return NextResponse.json({ error: e.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: { 'Access-Control-Allow-Origin': '*' } });
}

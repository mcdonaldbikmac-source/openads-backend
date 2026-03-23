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
        const { id, wallet, formats, signature } = body;

        if (!id || !wallet || !Array.isArray(formats) || !signature) {
            return NextResponse.json({ error: 'Missing required parameters (id, wallet, formats, signature)' }, { status: 400 });
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
        }
        
        let cachedApp = null;
        if (String(wallet).toLowerCase().startsWith('0x')) {
            // Web3 SIWE Verification (Ethers.js)
            try {
                // To reuse the Step 1 signature and eliminate double-signing UX friction,
                // we must first fetch the registered App domain from Supabase.
                const { data: currApp, error: fetchErr } = await supabase
                    .from('apps')
                    .select('app_type, domain')
                    .eq('id', id)
                    .ilike('publisher_wallet', wallet) // Changed from .eq to .ilike
                    .single();

                if (fetchErr || !currApp) {
                    return NextResponse.json({ error: 'App not found or unauthorized' }, { status: 404 });
                }
                
                cachedApp = currApp;

                // Reconstruct the exact Step 1 Signature payload using the database domain
                const expectedMessage = `Sign to register domain ${currApp.domain} for publisher ${wallet}`;
                let recoveredAddress;
                
                recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

                if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] App Toggle SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed.' }, { status: 401 });
            }
        }
        
        // 2. Fetch current app type to ensure we have the correct base string (if not already cached)
        const currApp = cachedApp || (await (async function() {
            const { data, error } = await supabase
                .from('apps')
                .select('app_type, domain')
                .eq('id', id)
                .ilike('publisher_wallet', wallet) // Changed from .eq to .ilike
                .single();
            if (error || !data) throw new Error('App not found');
            return data;
        })().catch(() => null));

        if (!currApp) {
            return NextResponse.json({ error: 'App not found or unauthorized' }, { status: 404 });
        }

        let newType = currApp.app_type.split('|')[0]; // Isolate base state (e.g., 'web' or 'paused_web')

        if (formats.length > 0) {
            newType = `${newType}|formats:${formats.join(',')}`;
        }
        // If formats array is empty, it just leaves it as the base 'web', allowing all by default.

        // 3. Perform the actual update back to DB
        const { data, error } = await supabase
            .from('apps')
            .update({ app_type: newType })
            .eq('id', id)
            .ilike('publisher_wallet', wallet) // Changed from .eq to .ilike
            .select('id, name, domain, app_type')
            .single();

        if (error) {
            throw error;
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


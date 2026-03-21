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
        const { wallet, referred_by, signature } = body;

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 });
        }

        // =========================================================================
        // SECURITY UPDATE: Prevent Pre-Registration Referral Hijacking
        // If the wallet is a Web3 custody address (0x...), it MUST be cryptographically proven
        // to prevent attackers from mass-registering unjoined wallets under their referral tree.
        // Farcaster FIDs (numeric) MUST also be cryptographically proven via SIWF Bearer tokens.
        // =========================================================================
        if (String(wallet).startsWith('0x')) {
            if (!signature) {
                return NextResponse.json({ error: 'Cryptographic signature required for Web3 Wallet registration to prevent Referral Hijacking.' }, { status: 401 });
            }
            try {
                const recoveredAddress = ethers.verifyMessage(`Sign to login to OpenAds Network`, signature);
                if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (err) {
                console.error('[Security] Failed to verify SIWE on Login:', err);
                return NextResponse.json({ error: 'Invalid authentication signature.' }, { status: 401 });
            }
        } else {
            // FARCASTER SIWF VERIFICATION
            const { message, nonce } = body;
            if (!signature || !message || !nonce) {
                return NextResponse.json({ error: 'Farcaster SIWF Cryptographic payload missing for Login.' }, { status: 401 });
            }
            try {
                const result = await appClient.verifySignInMessage({
                    message: message,
                    signature: signature as `0x${string}`,
                    domain: (body.message.match(/(.+) wants you to sign in/) || [])[1] || 'openads-backend.vercel.app',
                    nonce: nonce,
                });
                if (!result.success || result.fid.toString() !== wallet) {
                    console.error(`[Security] Farcaster SIWF Referral Hijack Attempt. Expected FID: ${wallet}`);
                    return NextResponse.json({ error: 'Farcaster Authentication Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                console.error('[Security] Failed to verify SIWF on Login:', err);
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        }

        // 1. Check if the publisher already exists
        const { data: pubData, error: fetchErr } = await supabase
            .from('publishers')
            .select('wallet, referred_by')
            .ilike('wallet', wallet)
            .single();

        if (fetchErr && fetchErr.code !== 'PGRST116') { // PGRST116 means row not found
            console.error('Database fetch error:', fetchErr);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        if (pubData) {
            // Already exists. Return success, do not update referred_by to prevent changing referrers.
            return NextResponse.json(
                { success: true, message: 'Welcome back.', isNew: false, referredBy: pubData.referred_by },
                { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // 2. Publisher does not exist. Insert them, optionally with referred_by.
        let referToSave = null;
        if (referred_by && referred_by.length > 10 && referred_by.toLowerCase() !== wallet.toLowerCase()) {
            referToSave = referred_by;
        }

        const { error: insertErr } = await supabase
            .from('publishers')
            .insert({
                wallet: wallet,
                total_earned_wei: 0,
                paid_out_wei: 0,
                referred_by: referToSave
            });

        if (insertErr) {
            console.error('Error inserting new publisher:', insertErr);
            return NextResponse.json({ error: 'Failed to create publisher record' }, { status: 500 });
        }

        return NextResponse.json(
            { success: true, message: 'Welcome to OpenAds Network Builder!', isNew: true, referredBy: referToSave },
            { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
        );

    } catch (err) {
        console.error('Publisher Login API exception:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

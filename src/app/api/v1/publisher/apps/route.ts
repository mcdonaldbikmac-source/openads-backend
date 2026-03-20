import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

// GET: Fetch all registered miniapps/websites for a given publisher wallet
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 });
        }

        const { data: apps, error } = await supabase
            .from('apps')
            .select('id, name, domain, created_at, logo_url')
            .eq('publisher_wallet', wallet)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch the latest tracking event for this publisher to act as a system-wide health check
        const { data: latestImp } = await supabase
            .from('tracking_events')
            .select('created_at')
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'view')
            .order('created_at', { ascending: false })
            .limit(1);

        const lastActiveAt = latestImp && latestImp.length > 0 ? latestImp[0].created_at : null;

        return NextResponse.json(
            { success: true, apps: apps || [], last_active_at: lastActiveAt },
            { 
                status: 200, 
                headers: { 'Access-Control-Allow-Origin': '*' } 
            }
        );
    } catch (err) {
        console.error('Fetch Publisher Apps Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Register a new miniapp/website
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { wallet, name, domain, app_type, signature } = body;

        if (!wallet || !name || !domain || !signature) {
            return NextResponse.json({ error: 'Missing required fields including signature' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (body.message && body.message.includes('farcaster.xyz')) {
            // SIWF Bearer Token Verification (Farcaster AuthKit)
            const { nonce } = body;
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF Cryptographic authentication missing nonce.' }, { status: 401 });
            
            try {
                // Dynamically extract domain from the SIWE message to support localhost, vercel.app, and custom domains
                const domainMatch = body.message.match(/(.+) wants you to sign in/);
                const extractedDomain = domainMatch ? domainMatch[1] : 'openads-backend.vercel.app';

                const result = await appClient.verifySignInMessage({
                    message: body.message,
                    signature: signature as `0x${string}`,
                    domain: extractedDomain,
                    nonce: nonce,
                });
                
                if (!result.success || result.fid.toString() !== wallet) {
                    console.error(`[Security] App Registration SIWF Hijack Attempt. Expected FID: ${wallet}`);
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                console.error('[Security] App Registration SIWF Exception:', err);
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            // Web3 SIWE Verification (Ethers.js)
            try {
                const expectedMessage = `Sign to register domain ${domain} for publisher ${wallet}`;
                let recoveredAddress;
                
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

                if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] Publisher App Registration SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
            }
        }

        // ==========================================
        // EDGE CASE 2: Malformed Registration Data
        // ==========================================
        const ethRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!ethRegex.test(wallet)) {
            return NextResponse.json({ error: 'Invalid Ethereum Wallet Address format.' }, { status: 400 });
        }
        
        if (domain.length < 5 || !domain.includes('.')) {
            return NextResponse.json({ error: 'Invalid Domain URL format.' }, { status: 400 });
        }

        const lowerDomain = domain.toLowerCase();
        if (lowerDomain.includes('farcaster.xyz/miniapp') || lowerDomain.includes('warpcast.com/~/')) {
            return NextResponse.json({ error: 'Farcaster wrapper links are not permitted as they break Sandbox origin verification. Please enter your actual physical hosting domain (e.g., vercel.app).' }, { status: 400 });
        }

        // Infrastructure Domain Hijacking Blacklist
        const INFRASTRUCTURE_BLACKLIST = [
            'openads-backend.vercel.app',
            'mcdonaldbikmac-source',
            'openads.network',
            'farcaster.network'
        ];
        for (const blacklisted of INFRASTRUCTURE_BLACKLIST) {
            if (lowerDomain.includes(blacklisted)) {
                console.warn(`[Security] Attempted Infrastructure Hijack blocked: ${domain}`);
                return NextResponse.json({ error: 'System architecture domains cannot be registered into the public ad network.' }, { status: 403 });
            }
        }

        // Anti-Spam Check: Limit to 3 apps per publisher wallet
        const { count, error: countError } = await supabase
            .from('apps')
            .select('*', { count: 'exact', head: true })
            .eq('publisher_wallet', wallet);

        if (countError) throw countError;
        
        if (count !== null && count >= 3) {
            return NextResponse.json(
                { error: 'Limit Reached: Maximum of 3 apps allowed per publisher to prevent spam.' }, 
                { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // Check for Duplicate Domain Registration (Same Wallet)
        const { data: existingApp, error: existError } = await supabase
            .from('apps')
            .select('id, app_type')
            .eq('publisher_wallet', wallet)
            .eq('domain', domain)
            .limit(1);

        if (existError) {
            console.error('Check duplicate app error:', existError);
        }

        if (existingApp && existingApp.length > 0) {
            if (existingApp[0].app_type === 'banned') {
                return NextResponse.json(
                    { error: `ACCESS DENIED: The domain ${domain} is permanently banned from the OpenAds ecosystem for grave policy violations.` }, 
                    { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
                );
            }

            // Instead of throwing an error, we return success with a duplicate flag
            // so the frontend can seamlessly move to Step 2 and show the snippet.
            return NextResponse.json(
                { success: true, is_duplicate: true, app: existingApp[0] }, 
                { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // GLOBAL DOMAIN CONTAMINATION CHECK (Cross-Wallet Registration Firewall)
        // If a hacker generates a brand new MetaMask wallet to re-register a Banned URL, block it matrix-wide.
        const { data: bannedDomain } = await supabase
            .from('apps')
            .select('id')
            .eq('domain', domain)
            .eq('app_type', 'banned')
            .limit(1);

        if (bannedDomain && bannedDomain.length > 0) {
            return NextResponse.json(
                { error: `ACCESS DENIED: The domain ${domain} is permanently banned from the OpenAds network and cannot be registered by any existing or new wallet identities.` }, 
                { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        const { data, error } = await supabase
            .from('apps')
            .insert([{ publisher_wallet: wallet, name, domain, app_type: app_type || 'website' }])
            .select('id, name, domain, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                // If it hits the unique constraint (e.g. they registered name but different domain, or vice versa)
                // We should fetch the existing app and return it so they can still get the snippet
                const { data: fallbackApp } = await supabase
                    .from('apps')
                    .select('id, name, domain, created_at')
                    .eq('publisher_wallet', wallet)
                    .or(`name.eq."${name}",domain.eq."${domain}"`)
                    .limit(1)
                    .single();
                
                return NextResponse.json(
                    { success: true, is_duplicate: true, app: fallbackApp || { name, domain } }, 
                    { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
                );
            }
            throw error;
        }

        return NextResponse.json(
            { success: true, app: data },
            { 
                status: 201, 
                headers: { 'Access-Control-Allow-Origin': '*' } 
            }
        );
    } catch (err: any) {
        console.error('Register Publisher App Error:', err);
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

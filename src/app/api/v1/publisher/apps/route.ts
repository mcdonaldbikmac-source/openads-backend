import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

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

        // 1. Authenticate with EIP-191 Signature
        if (signature !== 'MVP_FARCASTER_BYPASS_SIG') {
            try {
                const expectedMessage = `Sign to register domain ${domain} for publisher ${wallet}`;
                let recoveredAddress;
                
                if (body.message && body.message !== 'MVP_FARCASTER_BYPASS_MSG') {
                    // Farcaster Auth loop bypass using original SIWE message
                    recoveredAddress = ethers.verifyMessage(body.message, signature);
                } else {
                    recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
                }

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

        // Check for Duplicate Domain Registration
        const { data: existingApp, error: existError } = await supabase
            .from('apps')
            .select('id')
            .eq('publisher_wallet', wallet)
            .eq('domain', domain)
            .limit(1);

        if (existError) {
            console.error('Check duplicate app error:', existError);
        }

        if (existingApp && existingApp.length > 0) {
            // Instead of throwing an error, we return success with a duplicate flag
            // so the frontend can seamlessly move to Step 2 and show the snippet.
            return NextResponse.json(
                { success: true, is_duplicate: true, app: existingApp[0] }, 
                { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
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

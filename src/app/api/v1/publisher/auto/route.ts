import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// Helper to normalize domains for comparison
function normalizeDomain(urlStr: string) {
    try {
        if (!urlStr.startsWith('http')) urlStr = 'https://' + urlStr;
        const url = new URL(urlStr);
        let hostname = url.hostname.toLowerCase();
        if (hostname.startsWith('www.')) hostname = hostname.substring(4);
        return hostname;
    } catch {
        return urlStr.toLowerCase();
    }
}

export async function POST(request: Request) {
    try {
        const originHeader = request.headers.get('origin');
        if (!originHeader) {
            return NextResponse.json({ error: 'Missing Origin header' }, { status: 400 });
        }

        const body = await request.json();
        const { wallet, url, title, icon_url } = body;

        if (!wallet || !url) {
            return NextResponse.json({ error: 'Missing wallet or url' }, { status: 400 });
        }

        const requestHostname = normalizeDomain(url);
        const originHostname = normalizeDomain(originHeader);

        // Security Check: Ensure the reported URL matches the actual Origin the browser sent
        // This prevents malicious actors from spoofing the URL payload
        if (requestHostname !== originHostname) {
            console.warn(`[Auto-Verify] Origin mismatch: ${originHostname} != ${requestHostname}`);
            return NextResponse.json({ error: 'Origin mismatch' }, { status: 403 });
        }

        // 1. Check if domain already exists for another wallet (prevents hijacking)
        const { data: existingApp, error: fetchError } = await supabase
            .from('publishers')
            .select('*')
            .eq('domain', requestHostname)
            .limit(1);

        if (fetchError) {
            console.error('Database fetch error:', fetchError);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        let dbOperation;

        if (existingApp && existingApp.length > 0) {
            const app = existingApp[0];
            // If it belongs to this wallet, ensure it's fully verified and details updated
            if (app.wallet_address.toLowerCase() === wallet.toLowerCase()) {
                dbOperation = supabase
                    .from('publishers')
                    .update({ 
                        verified: true, 
                        app_name: title || app.app_name, 
                        // Only update icon if it's provided and didn't exist, or if we want to overwrite
                        ...(icon_url && { icon_url: icon_url })
                    })
                    .eq('id', app.id);
            } else {
                // Already verified/claimed by another wallet
                return NextResponse.json({ error: 'Domain already registered to another wallet' }, { status: 403 });
            }
        } else {
            // New unseen publisher property
            dbOperation = supabase
                .from('publishers')
                .insert({
                    wallet_address: wallet,
                    domain: requestHostname,
                    app_name: title || requestHostname,
                    app_url: url,
                    verified: true,
                    icon_url: icon_url || ''
                });
        }

        const { error: upsertError } = await dbOperation;
        if (upsertError) {
            console.error('Error upserting auto-verified publisher:', upsertError);
            return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }

        return NextResponse.json(
            { success: true, message: 'Domain auto-verified securely.' },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': originHeader, // Strict CORS for the specific origin
                    'Access-Control-Allow-Methods': 'POST, OPTIONS'
                }
            }
        );
    } catch (err) {
        console.error('Auto-Verify API exception:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS(request: Request) {
    const origin = request.headers.get('origin') || '*';
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

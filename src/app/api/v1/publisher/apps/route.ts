import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

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

        return NextResponse.json(
            { success: true, apps: apps || [] },
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
        const { wallet, name, domain, app_type } = body;

        if (!wallet || !name || !domain) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
            return NextResponse.json(
                { error: 'Duplicate App: You have already registered this domain.' }, 
                { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        const { data, error } = await supabase
            .from('apps')
            .insert([{ publisher_wallet: wallet, name, domain, app_type: app_type || 'website' }])
            .select('id, name, domain, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'This App Name or Domain is already registered to a Publisher.' }, 
                    { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
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

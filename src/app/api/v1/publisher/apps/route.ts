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
            .select('id, name, domain, created_at')
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

        const { data, error } = await supabase
            .from('apps')
            .insert([{ publisher_wallet: wallet, name, domain, app_type: app_type || 'website' }])
            .select('id, name, domain, created_at')
            .single();

        if (error) throw error;

        return NextResponse.json(
            { success: true, app: data },
            { 
                status: 201, 
                headers: { 'Access-Control-Allow-Origin': '*' } 
            }
        );
    } catch (err) {
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

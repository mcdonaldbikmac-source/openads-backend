import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');

        if (!code) {
            return NextResponse.json({ error: 'Promo code required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('vouchers')
            .select('*')
            .eq('code', code.trim().toUpperCase())
            .eq('is_used', false)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Invalid or already used promo code' }, { status: 404 });
        }

        return NextResponse.json(
            { success: true, amount: data.amount },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (e) {
        console.error('Voucher verification error:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

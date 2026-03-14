import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { count, amount, secret } = body;

        // Basic admin security check
        const adminSecret = process.env.ADMIN_SECRET || 'openads_admin_2026';
        if (secret !== adminSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!count || !amount || count <= 0 || amount <= 0) {
            return NextResponse.json({ error: 'Invalid count or amount' }, { status: 400 });
        }

        const vouchers = [];
        for (let i = 0; i < count; i++) {
            const randomCode = crypto.randomBytes(4).toString('hex').toUpperCase();
            vouchers.push({
                code: `OPENADS-${randomCode}`,
                amount: amount,
                is_used: false
            });
        }

        const { data, error } = await supabase.from('vouchers').insert(vouchers).select();

        if (error) {
            console.error('Failed to insert vouchers:', error);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        return NextResponse.json({ success: true, generated: vouchers.length, vouchers: data });
    } catch (e) {
        console.error('Voucher create error:', e);
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

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const wallet = body.wallet;

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400 });
        }

        // 1. Fetch current publisher stats
        const { data: pubData, error: fetchErr } = await supabase
            .from('publishers')
            .select('total_earned_wei')
            .eq('wallet', wallet)
            .single();

        if (fetchErr) {
            return NextResponse.json({ error: 'Could not fetch publisher data' }, { status: 500 });
        }

        if (!pubData) {
            return NextResponse.json({ error: 'Publisher not found' }, { status: 404 });
        }

        // 2. Set paid_out_wei equal to total_earned_wei
        const newPaidOut = pubData.total_earned_wei || 0;

        const { error: updateErr } = await supabase
            .from('publishers')
            .update({ paid_out_wei: newPaidOut })
            .eq('wallet', wallet);

        if (updateErr) {
            return NextResponse.json({ error: 'Failed to update claim status' }, { status: 500 });
        }

        return NextResponse.json(
            { success: true },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Publisher Claim API Error:', err);
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

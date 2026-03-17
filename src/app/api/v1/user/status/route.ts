import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { campaign_id, status } = body;

        if (!campaign_id || !status) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const { error } = await supabase
            .from('campaigns')
            .update({ status: status, updated_at: new Date().toISOString() })
            .eq('id', campaign_id);

        if (error) {
            console.error('Failed to update campaign status:', error);
            return NextResponse.json({ error: 'Failed to update campaign status in DB' }, { status: 500 });
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
        console.error('Status Campaign API Error:', err);
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

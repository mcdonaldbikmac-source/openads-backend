import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { campaign_id, url, image } = body;

        if (!campaign_id || !url || !image) {
            return NextResponse.json({ error: 'Missing required parameters (campaign_id, url, image)' }, { status: 400 });
        }

        const { error } = await supabase
            .from('campaigns')
            .update({ creative_url: url, image_url: image })
            .eq('id', campaign_id);

        if (error) {
            console.error('Failed to update campaign:', error);
            return NextResponse.json({ error: 'Failed to update campaign in DB' }, { status: 500 });
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
        console.error('Edit Campaign API Error:', err);
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

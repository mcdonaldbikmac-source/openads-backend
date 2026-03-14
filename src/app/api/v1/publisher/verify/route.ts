import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        // Query registered apps to see if the publisher has successfully verified any domain
        const { data, error } = await supabase
            .from('openads_publishers')
            .select('id, is_verified')
            .eq('wallet_address', wallet)
            .eq('is_verified', true)
            .limit(1);

        if (error) {
            console.error('Supabase error while verifying publisher:', error);
            return NextResponse.json({ error: 'Database verification failed' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const status = (data && data.length > 0) ? 'active' : 'waiting';

        return NextResponse.json(
            { status },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Publisher Verify API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
    });
}

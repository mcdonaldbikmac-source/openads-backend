import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet parameter' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        // For SDK connection status, we can check if the publisher exists in the new 'publishers' table
        // or just return 'active' if we recently received an event from them.
        const { data, error } = await supabase
            .from('publishers')
            .select('wallet')
            .eq('wallet', wallet)
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

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('openads_publishers')
            .select('app_name, domain_url, app_logo_url')
            .eq('is_verified', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Map to a simpler format for the landing page marquee
        const publishers = (data || []).map(pub => ({
            name: pub.app_name || pub.domain_url,
            icon: pub.app_logo_url || 'https://cdn.worldvectorlogo.com/logos/globe-3.svg'
        }));

        return NextResponse.json(
            { success: true, publishers },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                },
            }
        );
    } catch (err: any) {
        console.error('Network Pub Fetch Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
    });
}

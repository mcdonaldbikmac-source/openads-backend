import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('apps')
            .select('name, domain')
            .order('created_at', { ascending: false })
            .limit(10); // Limit to top 10 recent apps for the marquee

        if (error) throw error;

        // Map to a simpler format for the landing page marquee
        const publishers = (data || []).map(app => {
            return {
                name: app.name || app.domain,
                icon: 'https://cdn.worldvectorlogo.com/logos/base-2.svg' // Using Base network logo as default icon instead of globe
            };
        });

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

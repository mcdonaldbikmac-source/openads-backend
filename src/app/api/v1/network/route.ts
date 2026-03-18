import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('apps')
            .select('name, domain, app_type, logo_url')
            .order('created_at', { ascending: false })
            .limit(10); // Limit to top 10 recent apps for the marquee

        if (error) throw error;

        // Map to a simpler format for the landing page marquee
        const publishers = (data || []).map(app => {
            let userIcon = 'https://cdn.worldvectorlogo.com/logos/base-2.svg'; // Default Base logo
            if (app.logo_url) {
                userIcon = app.logo_url;
            } else if (app.app_type === 'miniapp') {
                userIcon = 'https://seeklogo.com/images/F/farcaster-logo-F91A2DCBBA-seeklogo.com.png';
            } else if (app.app_type === 'website') {
                userIcon = 'https://cdn-icons-png.flaticon.com/512/1006/1006771.png'; // Generic globe/website icon
            }

            return {
                name: app.name || app.domain,
                icon: userIcon
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

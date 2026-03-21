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

        // Mathematical Base64 SVGs to bypass CDN Hotlink Protections
        const baseSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230052FF" rx="50"/><circle cx="50" cy="50" r="20" fill="white"/></svg>`;
        const fcSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%238a2be2" rx="20"/><text x="50" y="65" font-family="Arial" font-size="50" fill="white" text-anchor="middle" font-weight="bold">F</text></svg>`;
        const webSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23333333" rx="20"/><text x="50" y="65" font-family="Arial" font-size="50" fill="white" text-anchor="middle" font-weight="bold">W</text></svg>`;

        // Map to a simpler format for the landing page marquee
        const publishers = (data || []).map(app => {
            let userIcon = baseSvg; 
            if (app.logo_url && app.logo_url !== 'verified') {
                userIcon = app.logo_url;
            } else if (app.app_type === 'miniapp') {
                userIcon = fcSvg;
            } else if (app.app_type === 'website') {
                userIcon = webSvg;
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

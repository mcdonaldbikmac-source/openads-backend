import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { Redis } from '@upstash/redis';

export const revalidate = 60;

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('apps')
            .select('name, domain, app_type, logo_url, publisher_wallet')
            .not('logo_url', 'is', null)
            .neq('app_type', 'banned')
            .not('app_type', 'ilike', 'paused_%')
            .order('created_at', { ascending: false })
            .limit(50); // Fetch a wider net to filter cryptographically

        if (error) throw error;

        // URL-Encoded Base64 SVGs to bypass HTML Double-Quote attribute crashing
        const baseSvgRaw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0052FF" rx="50"/><circle cx="50" cy="50" r="20" fill="white"/></svg>`;
        const fcSvgRaw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8a2be2" rx="20"/><text x="50" y="65" font-family="Arial" font-size="50" fill="white" text-anchor="middle" font-weight="bold">F</text></svg>`;
        const webSvgRaw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#333333" rx="20"/><text x="50" y="65" font-family="Arial" font-size="50" fill="white" text-anchor="middle" font-weight="bold">W</text></svg>`;

        const baseSvg = 'data:image/svg+xml,' + encodeURIComponent(baseSvgRaw);
        const fcSvg = 'data:image/svg+xml,' + encodeURIComponent(fcSvgRaw);
        const webSvg = 'data:image/svg+xml,' + encodeURIComponent(webSvgRaw);

        // =========================================================================
        // SECURITY UPDATE: Double-Lock Cryptographic Public Marquee
        // Never blindly trust the Postgres `logo_url` as it can be mocked/injected.
        // Intersect DB verification with the live Upstash Redis telemetry pulse.
        // =========================================================================
        const redis = Redis.fromEnv();
        const verifiedLivePublishers = [];

        for (const app of (data || [])) {
            if (verifiedLivePublishers.length >= 10) break; // Only need Top 10 for Marquee
            
            // Check if this specific publisher wallet securely pinged the SIWE telemetry endpoint in the last 24h
            const trueActiveHeartbeat = await redis.get(`pub_last_active_${app.publisher_wallet}`);
            
            // STRICT OVERRIDE: If no cryptographic heartbeat exists, it is treated as FAKE/DEAD.
            if (trueActiveHeartbeat) {
                let userIcon = baseSvg; 
                if (app.logo_url && app.logo_url !== 'verified') {
                    userIcon = app.logo_url;
                } else if (app.app_type === 'miniapp') {
                    userIcon = fcSvg;
                } else if (app.app_type === 'website') {
                    userIcon = webSvg;
                }

                verifiedLivePublishers.push({
                    name: app.name || app.domain,
                    icon: userIcon
                });
            }
        }

        return NextResponse.json(
            { success: true, publishers: verifiedLivePublishers },
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

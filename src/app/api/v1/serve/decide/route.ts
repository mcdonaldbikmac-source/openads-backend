import { NextResponse } from 'next/server';
import { DecisionEngineService } from '@/services/DecisionEngineService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const placementId = searchParams.get('placement');
        const position = (searchParams.get('position') || 'all').toLowerCase();
        
        const clientReportedParent = searchParams.get('parent_url');
        let requestHost = '';
        
        try { 
            if (clientReportedParent) {
                requestHost = new URL(clientReportedParent).host; 
            }
        } catch(e) {
            console.warn(`[Security] Failed to parse parent_url: ${clientReportedParent}`);
        }
        
        const clientIp = request.headers.get('x-forwarded-for') || 'anon';

        if (!placementId) {
            return NextResponse.json({ error: 'Missing placement ID' }, { status: 202 });
        }

        // Orchestrate all logic through the Business Layer
        const resolution = await DecisionEngineService.resolveAd(placementId, position, requestHost, clientIp);

        // Standardize the API return
        if (resolution.errorPayload) {
            return NextResponse.json(resolution.errorPayload, { 
                status: resolution.status, 
                headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', 'Access-Control-Allow-Origin': '*' } 
            });
        }

        return NextResponse.json(resolution.payload, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
            },
        });
    } catch (err) {
        console.error('Decide API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


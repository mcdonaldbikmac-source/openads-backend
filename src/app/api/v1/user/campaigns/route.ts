import { NextResponse } from 'next/server';
import { AuthService } from '@/services/AuthService';
import { CampaignService } from '@/services/campaignService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet query parameter' }, { status: 400 });
        }

        // 1. Cryptographic Authentication
        let authObj;
        try {
            authObj = await AuthService.verifyBearer(request, wallet);
        } catch (authErr: any) {
            return AuthService.generateErrorResponse(authErr);
        }

        // 2. Fetch User Campaigns
        // The service internally resolves the authentic owner identities (Legacy Web3, Farcaster Custody, or FID arrays)
        const campaigns = await CampaignService.getUserCampaignsWithMetrics(authObj);

        // 3. Controller Return Format
        return NextResponse.json(
            { success: true, campaigns },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-OpenAds-Auth, Cache-Control, Pragma, Expires',
                },
            }
        );
    } catch (err: any) {
        console.error('User Campaigns API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
    }
}


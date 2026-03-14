import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet query parameter' }, { status: 400 });
        }

        // Fetch user's campaigns
        const { data: campaigns, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('advertiser_wallet', wallet)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch campaigns error:', error);
            return NextResponse.json({ error: 'Database error fetching campaigns' }, { status: 500 });
        }

        // Format BigInts to Strings for the frontend
        const formattedCampaigns = campaigns.map(camp => ({
            id: camp.id,
            headline: camp.creative_title,
            image_url: camp.image_url,
            url: camp.creative_url,
            ad_type: camp.ad_type,
            impressions: camp.impressions,
            status: camp.status,
            budget_usd: Number(ethers.formatUnits(String(camp.budget_wei || '0').split('.')[0], 18)).toFixed(2),
            spend_usd: Number(ethers.formatUnits(String(camp.spend_wei || '0').split('.')[0], 18)).toFixed(4),
            cpm_usd: Number(ethers.formatUnits(String(camp.cpm_rate_wei || '0').split('.')[0], 18)).toFixed(2),
            created_at: camp.created_at
        }));

        return NextResponse.json(
            { success: true, campaigns: formattedCampaigns },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('User Campaigns API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

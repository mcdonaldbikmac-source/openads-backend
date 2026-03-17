import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function GET() {
    try {
        // Fetch ALL campaigns for network stats and admin dashboard
        const { data: campaigns, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch all campaigns error:', error);
            return NextResponse.json({ error: 'Database error fetching campaigns' }, { status: 500 });
        }

        // Format for frontend
        const formattedCampaigns = await Promise.all(campaigns.map(async (camp) => {
            // Get actual views/clicks
            const { count: viewsCount } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', camp.id)
                .eq('event_type', 'view');

            const { count: clicksCount } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', camp.id)
                .eq('event_type', 'click');

            const finalImpressions = viewsCount || camp.impressions || 0;
            const finalClicks = clicksCount || 0;

            return {
                id: camp.id,
                advertiser: camp.advertiser_wallet,
                title: camp.creative_title,
                format: camp.ad_type,
                budget: Number(ethers.formatUnits(String(camp.budget_wei || '0').split('.')[0], 6)).toFixed(2),
                spent: Number(ethers.formatUnits(String(camp.spend_wei || '0').split('.')[0], 6)).toFixed(4),
                cpm: Number(ethers.formatUnits(String(camp.cpm_rate_wei || '0').split('.')[0], 6)).toFixed(2),
                impressions: finalImpressions,
                clicks: finalClicks,
                status: camp.status,
                created_at: camp.created_at
            };
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
        console.error('All Campaigns API Error:', err);
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

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

        // 1. Fetch Publisher total earnings from DB
        const { data: publisherData, error: pubError } = await supabase
            .from('publishers')
            .select('total_earned_wei, paid_out_wei, syndicate_earned_wei')
            .eq('wallet', wallet)
            .single();

        let totalEarnedWei = BigInt(0);
        let paidOutWei = BigInt(0);
        let syndicateEarnedWei = BigInt(0);

        if (publisherData) {
            // Supabase returns NUMERIC types as numbers or strings with decimals (e.g. 450000000.00000)
            // BigInt() throws an error or fails if there is a decimal point, so we must truncate/round it first.
            const earnedStr = String(publisherData.total_earned_wei || '0').split('.')[0];
            const paidStr = String(publisherData.paid_out_wei || '0').split('.')[0];
            const syndStr = String(publisherData.syndicate_earned_wei || '0').split('.')[0];

            totalEarnedWei = BigInt(earnedStr);
            paidOutWei = BigInt(paidStr);
            syndicateEarnedWei = BigInt(syndStr);
        } else if (pubError && pubError.code !== 'PGRST116') { // PGRST116 is "Row not found"
            console.error('Supabase fetch publisher error:', pubError);
            return NextResponse.json({ error: 'Database error fetching stats' }, { status: 500 });
        }

        // 2. Fetch Impression and Click counts
        const { count: viewCount, error: viewError } = await supabase
            .from('tracking_events')
            .select('*', { count: 'exact', head: true })
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'view');

        const { count: clickCount } = await supabase
            .from('tracking_events')
            .select('*', { count: 'exact', head: true })
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'click');

        if (viewError) {
            console.error('Supabase fetch views error:', viewError);
        }
        
        // 3. Fetch most recent event timestamps
        const { data: viewData } = await supabase
            .from('tracking_events')
            .select('created_at')
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'view')
            .order('created_at', { ascending: false })
            .limit(1);
            
        const { data: clickData } = await supabase
            .from('tracking_events')
            .select('created_at')
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'click')
            .order('created_at', { ascending: false })
            .limit(1);

        const pendingWei = totalEarnedWei - paidOutWei;

        // Convert bigints to readable USD formatting for the frontend UI
        return NextResponse.json(
            {
                success: true,
                stats: {
                    totalEarnedUSD: Number(ethers.formatUnits(totalEarnedWei.toString(), 6)).toFixed(4),
                    pendingUSD: Number(ethers.formatUnits(pendingWei.toString(), 6)).toFixed(4),
                    paidOutUSD: Number(ethers.formatUnits(paidOutWei.toString(), 6)).toFixed(4),
                    syndicateEarnedUSD: Number(ethers.formatUnits(syndicateEarnedWei.toString(), 6)).toFixed(4),
                    impressions: viewCount || 0,
                    clicks: clickCount || 0,
                    lastImpression: viewData && viewData.length > 0 ? viewData[0].created_at : null,
                    lastClick: clickData && clickData.length > 0 ? clickData[0].created_at : null
                }
            },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Publisher Stats API Error:', err);
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

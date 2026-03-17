import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function GET() {
    try {
        // 1. Fetch data from publishers table
        const { data: finances, error: financesError } = await supabase
            .from('publishers')
            .select('*')
            .order('created_at', { ascending: false });

        if (financesError) throw financesError;

        // 2. Aggregate all views to get impressions efficiently
        const { data: viewsData, error: viewsError } = await supabase
            .from('tracking_events')
            .select('publisher_wallet')
            .eq('event_type', 'view');

        if (viewsError) throw viewsError;

        // Count views per wallet
        const viewCounts: Record<string, number> = {};
        (viewsData || []).forEach(v => {
            const w = v.publisher_wallet?.toLowerCase();
            if (w) {
                viewCounts[w] = (viewCounts[w] || 0) + 1;
            }
        });

        // 3. Merge Data
        const enrichedPublishers = (finances || []).map(financeRecord => {
            const wallet = financeRecord.wallet?.toLowerCase() || '';
            
            // Convert earnings from WEI to human readable USDC
            let rawEarningsWei = financeRecord ? String(financeRecord.total_earned_wei).split('.')[0] : '0';
            
            let earningsFormatted = 0;
            try {
                earningsFormatted = Number(ethers.formatUnits(rawEarningsWei || '0', 6));
            } catch (e) {}

            return {
                wallet: financeRecord.wallet || 'Unknown',
                app_name: `Publisher ${financeRecord.wallet.slice(0,6)}`,
                domain_url: '',
                app_logo_url: 'https://cdn.worldvectorlogo.com/logos/globe-3.svg',
                is_verified: true,
                impressions: viewCounts[wallet] || 0,
                earnings: earningsFormatted,
                status: 'active',
                created_at: financeRecord.created_at
            };
        });

        return NextResponse.json(
            { success: true, publishers: enrichedPublishers },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                },
            }
        );
    } catch (err: any) {
        console.error('Admin Fetch Error:', err);
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

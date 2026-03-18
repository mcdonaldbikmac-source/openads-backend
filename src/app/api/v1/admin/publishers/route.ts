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

        // 2 & 3. Merge Data efficiently with database-level COUNT aggregation
        const enrichedPublishers = await Promise.all((finances || []).map(async financeRecord => {
            const wallet = financeRecord.wallet?.toLowerCase() || '';

            // Efficiently get the exact view count without pulling data into serverless memory
            const { count: views } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('publisher_wallet', financeRecord.wallet)
                .eq('event_type', 'view');
            
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
                impressions: views || 0,
                earnings: earningsFormatted,
                status: 'active',
                created_at: financeRecord.created_at
            };
        }));

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

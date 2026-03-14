import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function GET() {
    try {
        // 1. Fetch verified apps from openads_publishers
        const { data: apps, error: appsError } = await supabase
            .from('openads_publishers')
            .select('*')
            .order('created_at', { ascending: false });

        if (appsError) throw appsError;

        // 2. Fetch financial data from publishers table
        const { data: finances, error: financesError } = await supabase
            .from('publishers')
            .select('*');

        if (financesError) throw financesError;

        // 3. Aggregate all views to get impressions efficiently
        // For MVP we just get all 'view' events and aggregate in JS
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

        // 4. Merge Data
        const enrichedPublishers = (apps || []).map(app => {
            const wallet = app.wallet_address?.toLowerCase() || '';
            const financeRecord = (finances || []).find(f => f.wallet?.toLowerCase() === wallet);
            
            // Convert earnings from WEI to human readable ETH/USD equivalent (assuming 1 USDC = 1e6 or 1e18, depending on MVP logic).
            // MVP contracts usually use 6 decimals for USDC, but let's check existing logic or return raw numbers and format in frontend.
            // Stats route converts wei to ETH using ethers.formatUnits(wei, 6)
            let rawEarningsWei = financeRecord ? String(financeRecord.total_earned_wei).split('.')[0] : '0';
            
            let earningsFormatted = 0;
            try {
                // Formatting assuming 6 decimals for USDC
                earningsFormatted = Number(ethers.formatUnits(rawEarningsWei || '0', 6));
            } catch (e) {
                console.error("Number format error", e);
            }

            return {
                wallet: app.wallet_address || 'Unknown',
                app_name: app.app_name || 'Unnamed App',
                domain_url: app.domain_url || '',
                app_logo_url: app.app_logo_url || 'https://cdn.worldvectorlogo.com/logos/globe-3.svg',
                is_verified: app.is_verified,
                impressions: viewCounts[wallet] || 0,
                earnings: earningsFormatted,
                status: app.is_verified ? 'active' : 'suspended',
                created_at: app.created_at
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

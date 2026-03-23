import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { verifyAdminAuth } from '../auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        await verifyAdminAuth(req);

        // Fetch all verified publishersical applications from the network ledger
        const { data: apps, error: appsError } = await supabase
            .from('apps')
            .select('*')
            .order('created_at', { ascending: false });

        if (appsError) throw appsError;

        // 2 & 3. Merge Data efficiently with database-level COUNT aggregation and Financials
        const enrichedPublishers = await Promise.all((apps || []).map(async appRecord => {
            const wallet = appRecord.publisher_wallet?.toLowerCase() || '';

            // Efficiently get the exact view count without pulling data into serverless memory
            const { count: views } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .ilike('publisher_wallet', appRecord.publisher_wallet)
                .eq('event_type', 'view');
            
            // Get earnings from the publisher's global portfolio
            const { data: financeRecord } = await supabase
                .from('publishers')
                .select('total_earned_wei')
                .ilike('wallet', appRecord.publisher_wallet)
                .single();
                
            let rawEarningsWei = financeRecord ? String(financeRecord.total_earned_wei).split('.')[0] : '0';
            
            let earningsFormatted = 0;
            try {
                earningsFormatted = Number(ethers.formatUnits(rawEarningsWei || '0', 6));
            } catch (e) {}

            return {
                app_id: appRecord.id, // EXPOSED FOR ADMIN SUSPEND FUNCTIONALITY
                wallet: appRecord.publisher_wallet || 'Unknown',
                app_name: appRecord.name || `App ${appRecord.publisher_wallet.slice(0,6)}`,
                domain_url: appRecord.domain || 'N/A',
                app_logo_url: appRecord.logo_url || 'https://cdn.worldvectorlogo.com/logos/globe-3.svg',
                is_verified: appRecord.logo_url === 'verified',
                impressions: views || 0,
                earnings: earningsFormatted,
                status: appRecord.logo_url === 'banned' ? 'banned' : (appRecord.logo_url === 'verified' ? 'active' : 'pending'),
                created_at: appRecord.created_at
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
    } catch (e: any) {
        console.error('Admin Publishers Route Error:', e);
        const status = e.message === 'Forbidden' ? 403 : (e.message === 'Unauthorized' ? 401 : 500);
        return NextResponse.json({ error: e.message || 'Error fetching publishers' }, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}


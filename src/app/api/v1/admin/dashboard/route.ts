import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { verifyAdminAuth } from '../auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        await verifyAdminAuth(req);

        // 1. Total Publishers (Websites & DApps)
        const { count: pubCount } = await supabase
            .from('apps')
            .select('*', { count: 'exact', head: true });

        // 2. Total Campaigns (to extract Budgets & Revenue)
        const { data: camps } = await supabase
            .from('campaigns')
            .select('budget_usd, spend_usd');

        let totalBudget = 0;
        let totalSpend = 0;
        
        if (camps) {
            camps.forEach(c => {
                totalBudget += Number(c.budget_usd || 0);
                totalSpend += Number(c.spend_usd || 0);
            });
        }
        
        // Revenue (Fees) is conceptually 10% of total spend in MVP
        const totalRevenue = totalSpend * 0.10;

        // 3. Total Impressions Served
        const { count: impCount } = await supabase
            .from('tracking_events')
            .select('*', { count: 'exact', head: true })
            .eq('event_type', 'view');

        return NextResponse.json(
            { 
                success: true, 
                kpi: {
                    totalPublishers: pubCount || 0,
                    totalBudgetUSD: totalBudget,
                    totalRevenueUSD: totalRevenue,
                    totalImpressions: impCount || 0
                }
            },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                },
            }
        );
    } catch (err: any) {
        console.error('Admin KPI API Error:', err);
        const status = err.message === 'Forbidden' ? 403 : (err.message === 'Unauthorized' ? 401 : 500);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
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

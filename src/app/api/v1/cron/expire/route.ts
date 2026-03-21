import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

// This endpoint should be triggered daily by Vercel Cron or an external chron scheduler
export async function GET(request: Request) {
    try {
        // Authenticate the cron request if needed (e.g., via a CRON_SECRET header)
        // const authHeader = request.headers.get('authorization');
        // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) ...

        // Calculate the timestamp 30 days ago
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoffDate = thirtyDaysAgo.toISOString();

        // Find campaigns that have been paused for more than 30 days
        const { data: expiredCampaigns, error: fetchError } = await supabase
            .from('campaigns')
            .select('id, advertiser_wallet, budget_wei, spend_wei')
            .eq('status', 'paused')
            .lt('updated_at', cutoffDate);

        if (fetchError) {
            console.error('Error fetching expired campaigns:', fetchError);
            return NextResponse.json({ error: 'Database fetch failed' }, { status: 500 });
        }

        if (!expiredCampaigns || expiredCampaigns.length === 0) {
            return NextResponse.json({ success: true, message: 'No campaigns to expire today.', expiredCount: 0 });
        }

        // Update them to 'expired'
        const campaignIds = expiredCampaigns.map(c => c.id);

        const { error: updateError } = await supabase
            .from('campaigns')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .in('id', campaignIds);

        if (updateError) {
            console.error('Error updating expired campaigns:', updateError);
            return NextResponse.json({ error: 'Failed to update campaign statuses' }, { status: 500 });
        }

        // Log the forfeited budgets for network operations
        expiredCampaigns.forEach(c => {
            console.log(`[FORFEITURE] Campaign ${c.id} expired. Unspent budget reclaimed.`);
        });

        return NextResponse.json({
            success: true,
            message: `Successfully expired ${campaignIds.length} abandoned campaigns.`,
            expiredCount: campaignIds.length,
            campaignIds
        });

    } catch (err) {
        console.error('Cron Expire API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

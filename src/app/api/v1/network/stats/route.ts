import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Query the live campaigns table to extract aggregate network intelligence
        const { data, error } = await supabase
            .from('campaigns')
            .select('ad_type, impressions, spend_wei')
            .eq('status', 'active')
            .eq('is_test', false);

        if (error) throw error;

        // Default floor pricing based on functional scarcity, mapping fallback to live DB states
        const formatPricing = {
            banner: 0.5,
            native: 2.5,
            interstitial: 6.0,
            rewarded: 12.0
        };

        let totalImpressions = 0;

        // ECPM calculation based strictly on live active network spend matrices
        if (data && data.length > 0) {
            const aggregates: Record<string, { views: number, spend: number }> = {};
            
            data.forEach(camp => {
                const type = camp.ad_type || 'banner';
                if (!aggregates[type]) aggregates[type] = { views: 0, spend: 0 };
                
                aggregates[type].views += Number(camp.impressions) || 0;
                aggregates[type].spend += (Number(camp.spend_wei) || 0) / 1e6;
                totalImpressions += Number(camp.impressions) || 0;
            });

            // Recalculate physical eCPMs if statistical volume is sufficient (> 10,000 impressions)
            Object.keys(aggregates).forEach(type => {
                const a = aggregates[type];
                if (a.views > 10000 && a.spend > 0) {
                    formatPricing[type as keyof typeof formatPricing] = (a.spend / a.views) * 1000;
                }
            });
        }

        return NextResponse.json(
            { success: true, totalImpressions, pricing: formatPricing },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                },
            }
        );
    } catch (err: any) {
        console.error('Network Stats Fetch Error:', err);
        return NextResponse.json({ error: 'Internal Server Error', trace: err.message || err.toString() }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
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

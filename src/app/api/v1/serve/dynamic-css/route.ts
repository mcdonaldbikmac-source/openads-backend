import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const publisherWallet = searchParams.get('publisher');

        if (!publisherWallet) {
            return new NextResponse('.openads-frame { display: none; }', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' } });
        }

        const { data: campaigns, error } = await supabase
            .from('campaigns')
            .select('id, status, ad_type, scheduled_start, budget_wei, spend_wei, cpm_rate_wei')
            .eq('status', 'active');

        if (error || !campaigns || campaigns.length === 0) {
            return new NextResponse('.openads-frame { display: none; }', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' } });
        }

        const now = new Date();
        const eligibleCampaigns = campaigns.filter(camp => {
            const hasStarted = !camp.scheduled_start || new Date(camp.scheduled_start) <= now;
            const budget = BigInt(camp.budget_wei || 0);
            const spend = BigInt(camp.spend_wei || 0);
            const cpm = BigInt(camp.cpm_rate_wei || 0);
            const costPerImpression = cpm / BigInt(1000);
            const remainingBudget = budget - spend;
            return hasStarted && remainingBudget >= costPerImpression;
        });

        if (eligibleCampaigns.length === 0) {
            return new NextResponse('.openads-frame { display: none; }', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' } });
        }

        eligibleCampaigns.sort((a, b) => {
            const cpmA = BigInt(a.cpm_rate_wei || 0);
            const cpmB = BigInt(b.cpm_rate_wei || 0);
            if (cpmA > cpmB) return -1;
            if (cpmA < cpmB) return 1;
            return 0;
        });

        const selectedCampaign = eligibleCampaigns[0];
        const types = selectedCampaign.ad_type || '';

        let cssPayload = '.openads-frame { display: none; }';

        if (types.includes('64x64')) {
            cssPayload = [
                '.openads-frame {',
                '    display: block !important;',
                '    position: fixed !important;',
                '    top: 20px !important;',
                '    right: 20px !important;',
                '    width: 64px !important;',
                '    height: 64px !important;',
                '    border-radius: 50% !important;',
                '    border: none !important;',
                '    z-index: 2147483647 !important;',
                '    box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;',
                '    background: transparent !important;',
                '    pointer-events: auto !important;',
                '}'
            ].join('\n');
        } else if (types.includes('300x250')) {
            cssPayload = [
                '.openads-frame {',
                '    display: block !important;',
                '    position: fixed !important;',
                '    top: 50% !important;',
                '    left: 50% !important;',
                '    transform: translate(-50%, -50%) !important;',
                '    width: 100vw !important;',
                '    height: 100vh !important;',
                '    border: none !important;',
                '    z-index: 2147483647 !important;',
                '    background: transparent !important;',
                '}'
            ].join('\n');
        } else if (types.includes('320x50')) {
            cssPayload = [
                '.openads-frame {',
                '    display: block !important;',
                '    position: relative !important;',
                '    width: 100% !important;',
                '    height: 50px !important;',
                '    border: none !important;',
                '    margin: 0 auto !important;',
                '    background: transparent !important;',
                '}'
            ].join('\n');
        }

        return new NextResponse(cssPayload, {
            headers: {
                'Content-Type': 'text/css',
                'Cache-Control': 'no-store, max-age=0, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
    } catch (e) {
        return new NextResponse('.openads-frame { display: none; }', { headers: { 'Content-Type': 'text/css' } });
    }
}

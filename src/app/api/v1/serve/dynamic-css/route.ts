import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const publisherWallet = searchParams.get('publisher');

        if (!publisherWallet) {
            return new NextResponse('.openads-frame { display: none !important; }', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' } });
        }

        const originHeader = request.headers.get('origin') || request.headers.get('referer') || '';
        let requestHost = '';
        try { requestHost = new URL(originHeader).host; } catch(e) {}

        let allowedFormats: string[] | null = null;
        let isPaused = false;

        // Domain spoofing & paused state verification
        if (requestHost && publisherWallet.startsWith('0x')) {
            const { data: appData } = await supabase
                .from('apps')
                .select('app_type')
                .ilike('publisher_wallet', publisherWallet)
                .ilike('domain', `%${requestHost}%`)
                .single();

            if (appData) {
                const parts = appData.app_type.split('|');
                const baseAppType = parts[0];
                if (parts.length > 1 && parts[1].startsWith('formats:')) {
                    allowedFormats = parts[1].replace('formats:', '').split(',');
                }
                if (baseAppType.startsWith('paused_') || baseAppType === 'banned') {
                    isPaused = true;
                }
            } else {
                // If it fails domain spoofing checks (or doesn't exist), ghost it.
                isPaused = true;
            }
        }

        if (isPaused) {
            return new NextResponse('.openads-frame { display: none !important; }', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' } });
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
            const types = camp.ad_type || '';
            
            // 1. Publisher-Level Remote Control Enforcement (DB allowed_formats)
            if (allowedFormats && allowedFormats.length > 0) {
                let isFormatAllowed = false;
                for (const fmt of allowedFormats) {
                    if (types.includes(fmt) || types.includes('responsive')) {
                        isFormatAllowed = true;
                        break;
                    }
                }
                if (!isFormatAllowed) return false;
            }

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

        let cssPayload = '.openads-popup, .openads-floating, .openads-banner, .openads-frame { display: none !important; }';

        // We iteratively build the CSS string to allow SIMULTANEOUS multi-format rendering
        // based on the publisher's authorized array, rather than collapsing everything into a single ad.
        const formatClasses = [];
        
        if (types.includes('64x64')) {
            formatClasses.push([
                '.openads-floating {',
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
            ].join('\n'));
        } 
        
        if (types.includes('300x250')) {
            formatClasses.push([
                '.openads-popup {',
                '    display: block !important;',
                '    position: fixed !important;',
                '    top: 50% !important;',
                '    left: 50% !important;',
                '    transform: translate(-50%, -50%) !important;',
                '    width: 300px !important;',
                '    height: 250px !important;',
                '    border: 1px solid rgba(0,0,0,0.1) !important;',
                '    z-index: 2147483647 !important;',
                '    box-shadow: 0 10px 30px rgba(0,0,0,0.2) !important;',
                '    background: transparent !important;',
                '    pointer-events: auto !important;',
                '}'
            ].join('\n'));
        } 
        
        if (types.includes('320x50')) {
            formatClasses.push([
                '.openads-banner {',
                '    display: block !important;',
                '    position: fixed !important;',
                '    bottom: 0 !important;',
                '    left: 50% !important;',
                '    transform: translateX(-50%) !important;',
                '    width: 100% !important;',
                '    max-width: 320px !important;',
                '    height: 50px !important;',
                '    border: none !important;',
                '    z-index: 2147483647 !important;',
                '    background: transparent !important;',
                '    pointer-events: auto !important;',
                '}'
            ].join('\n'));
        }

        if (formatClasses.length > 0) {
           cssPayload = '.openads-popup, .openads-floating, .openads-banner, .openads-frame { display: none !important; }\n' + formatClasses.join('\n\n');
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

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export const revalidate = 60;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const placementId = searchParams.get('placement');
        const position = searchParams.get('position') || 'all'; // Default to 'all' if not provided

        if (!placementId) {
            return NextResponse.json({ error: 'Missing placement ID' }, { status: 400 });
        }

        // ==========================================
        // FEATURE: Publisher Pause/Resume Control
        // Check if the requesting app domain is marked as "paused_"
        // ==========================================
        const originHeader = request.headers.get('origin') || request.headers.get('referer') || '';
        let requestHost = '';
        try { requestHost = new URL(originHeader).host; } catch(e) {}
        
        let publisherWallet = placementId.split('-')[1]; // Fallback ex: top-0xabc...
        
        if (requestHost && publisherWallet && publisherWallet.startsWith('0x')) {
            const { data: appData } = await supabase
                .from('apps')
                .select('app_type')
                .eq('publisher_wallet', publisherWallet)
                .ilike('domain', `%${requestHost}%`)
                .single();

            if (appData && appData.app_type.startsWith('paused_')) {
                console.log(`[OpenAds] ⏸️ Blocked Ad Request: Domain ${requestHost} is paused by publisher.`);
                return NextResponse.json({ error: 'Ad serving is paused for this miniapp by the publisher.' }, { status: 404 });
            }
        }

        // 1. Query Supabase for eligible campaigns
        // Must be active and have scheduled_start <= now (or null)
        // CRITICAL: We DO NOT select 'image_url' here to avoid memory bloat from thousands of Base64 strings.
        const { data: campaigns, error } = await supabase
            .from('campaigns')
            .select('id, status, ad_type, scheduled_start, budget_wei, spend_wei, cpm_rate_wei, creative_title, creative_url')
            .eq('status', 'active');

        if (error) {
            console.error('Supabase Query Error:', error);
            return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
        }

        if (!campaigns || campaigns.length === 0) {
            return NextResponse.json({ error: 'No active campaigns available' }, { status: 404 });
        }

        // 1.5 Filter by requested position (Ad Format Matching)
        let filteredByPosition = campaigns;
        if (position !== 'all') {
            filteredByPosition = campaigns.filter(camp => {
                const types = camp.ad_type || '';
                if (position === 'top' || position === 'bottom') return types.includes('320x50') || types.includes('responsive');
                if (position === 'popup') return types.includes('300x250') || types.includes('64x64') || types.includes('responsive');
                if (position === 'floating') return types.includes('64x64') || types.includes('responsive');
                return true;
            });
        }

        if (filteredByPosition.length === 0) {
            return NextResponse.json({ error: 'No active campaigns matching requested position' }, { status: 404 });
        }

        const now = new Date();

        // 2. Filter campaigns: Must have budget remaining and be past scheduled start time
        const eligibleCampaigns = filteredByPosition.filter(camp => {
            const hasStarted = !camp.scheduled_start || new Date(camp.scheduled_start) <= now;

            // BigInt calculation for wei
            const budget = BigInt(camp.budget_wei || 0);
            const spend = BigInt(camp.spend_wei || 0);
            const cpm = BigInt(camp.cpm_rate_wei || 0);

            // Allow if remaining budget is greater than or equal to 1 impression cost
            // 1 impression cost = cpm / 1000
            const costPerImpression = cpm / BigInt(1000);
            const remainingBudget = budget - spend;

            return hasStarted && remainingBudget >= costPerImpression;
        });

        if (eligibleCampaigns.length === 0) {
            return NextResponse.json({ error: 'All campaigns exhausted' }, { status: 404 });
        }

        // 3. Select the highest bidding campaign (eCPM Allocation Algorithm)
        // Sort by cpm_rate_wei descending
        eligibleCampaigns.sort((a, b) => {
            const cpmA = BigInt(a.cpm_rate_wei || 0);
            const cpmB = BigInt(b.cpm_rate_wei || 0);
            if (cpmA > cpmB) return -1;
            if (cpmA < cpmB) return 1;
            return 0;
        });

        // The first element is now the highest bidder
        let selectedCampaign = eligibleCampaigns[0];

        // 4. Fetch the heavy Base64 image ONLY for the winning campaign
        const { data: imageRow, error: imageError } = await supabase
            .from('campaigns')
            .select('image_url')
            .eq('id', selectedCampaign.id)
            .single();

        if (imageError || !imageRow) {
            console.error('Failed to fetch image for winning campaign:', imageError);
            return NextResponse.json({ error: 'Failed to fetch ad creative' }, { status: 500 });
        }

        // SECURITY: Mitigate Stored XSS via Open Redirect
        // Advertisers MUST NOT be able to submit `javascript:alert(1)` as their link.
        const enforceSecureProtocol = (url: string) => {
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : 'https://openads.xyz';
            } catch {
                return 'https://openads.xyz';
            }
        };

        // Format the response to match the SDK's expected structure
        const formattedAd = {
            id: selectedCampaign.id,
            headline: selectedCampaign.creative_title,
            cta: 'View Offer', // Could make this dynamic later
            image: imageRow.image_url,
            url: enforceSecureProtocol(selectedCampaign.creative_url),
            cpc: ethers.formatUnits(selectedCampaign.cpm_rate_wei.toString(), 6), // 6 decimals for USDC
            size: selectedCampaign.ad_type
        };

        // CORS Headers are essential since the SDK will fetch this from external Mini App domains
        return NextResponse.json(
            { ad: formattedAd },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Decide API Error:', err);
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

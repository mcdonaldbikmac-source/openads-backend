import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import crypto from 'crypto';
import { ethers } from 'ethers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const placementId = searchParams.get('placement');
        const position = (searchParams.get('position') || 'all').toLowerCase(); // Default to 'all' if not provided

        const clientIp = request.headers.get('x-forwarded-for') || 'anon';

        if (!placementId) {
            return NextResponse.json({ error: 'Missing placement ID' }, { status: 400 });
        }

        const requestedFormat = (placementId && placementId.includes('-')) ? placementId.split('-')[0] : 'responsive';

        // ==========================================
        // FEATURE: Publisher Pause/Resume Control
        // Check if the requesting app domain is marked as "paused_"
        // ==========================================
        const clientReportedParent = searchParams.get('parent_url');
        let originHeader = request.headers.get('origin') || request.headers.get('referer');
        if (!originHeader) {
            originHeader = clientReportedParent || '';
            console.warn(`[Security] Missing Origin/Referer in /decide. Falling back to payload: ${originHeader}`);
        }
        let requestHost = '';
        try { requestHost = new URL(originHeader).host; } catch(e) {}
        
        // Implicitly whitelist Vercel iframe architecture and local staging environments
        if (['openads-backend.vercel.app', 'localhost:3000', '127.0.0.1:8080', 'localhost'].includes(requestHost)) {
            requestHost = ''; // Clear it to silently bypass the DB check
        }
        
        let publisherWallet = placementId.split('-')[1]; // Fallback ex: top-0xabc...
        
        let allowedFormats: string[] | null = null;

        if (requestHost && publisherWallet && publisherWallet.startsWith('0x')) {
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

                if (baseAppType === 'banned') {
                    console.warn(`[Security] 🚫 Brand Safety Halt: Admin-Banned publisher domain [${requestHost}] attempted to siphon inventory.`);
                    return NextResponse.json({ error: 'Domain explicitly banned by Administrator.' }, { status: 403 });
                }

                if (baseAppType.startsWith('paused_')) {
                    console.log(`[OpenAds] ⏸️ Blocked Ad Request: Domain ${requestHost} is paused by publisher.`);
                    return NextResponse.json({ error: 'Ad serving is paused for this miniapp by the publisher.' }, { status: 404 });
                }
            } else {
                console.warn(`[Security] 🚫 Brand Safety Halt: Unregistered or Admin-Deleted publisher domain [${requestHost}] attempted to siphon inventory.`);
                return NextResponse.json({ error: 'Domain unauthorized or explicitly deleted by Administrator.' }, { status: 403 });
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

        // 1.5 Filter by explicit placement dimensions AND position to prevent Auction Hijacking
        const filteredByPosition = campaigns.filter(camp => {
            const types = camp.ad_type || '';
            
            // 1. Strict geometry enforcement: The ad MUST match the placement dimensions explicitly.
            if (requestedFormat !== 'responsive' && !types.includes(requestedFormat) && !types.includes('responsive')) {
                return false;
            }

            // 2. Strict Position Geometry Enforcement: Prevent massive graphical payloads from crashing micro-containers.
            // Even if the placement itself is explicitly 'responsive', if the requested frontend container is 'floating',
            // we MUST forcefully restrict the auction candidates to '64x64' campaigns.
            if (position !== 'all') {
                if (position === 'top' || position === 'bottom') return types.includes('320x50') || types.includes('responsive');
                if (position === 'popup') return types.includes('300x250') || types.includes('responsive');
                if (position === 'floating') return types.includes('64x64') || types.includes('responsive');
            }
            
            // 3. Publisher-Level Remote Control Enforcement (DB allowed_formats)
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

            return true;
        });

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

        // =========================================================================
        // FEATURE: Impression Throttling (Ad Fatigue Management)
        // Fetch the last 5 campaigns served to this specific IP to penalize them
        // in the auction, thereby maximizing unique reach and preventing spam.
        // =========================================================================
        let throttledCampaignIds: number[] = [];
        try {
            // Dynamically import Redis for Next.js route handlers
            const { Redis } = require('@upstash/redis');
            const redis = Redis.fromEnv();
            const recentServed = await redis.lrange(`served_ads_ip_${clientIp}`, 0, -1);
            if (recentServed) {
                throttledCampaignIds = recentServed.map((id: string) => Number(id));
            }
        } catch (e) {
            console.warn(`[Security] Impression Throttling bypassed due to Redis outage.`, e);
        }

        // 3. Select the highest bidding campaign (eCPM Allocation Algorithm)
        // Sort by cpm_rate_wei descending, but severely penalize campaigns recently served to this IP
        eligibleCampaigns.sort((a, b) => {
            const aThrottled = throttledCampaignIds.includes(a.id) ? 1 : 0;
            const bThrottled = throttledCampaignIds.includes(b.id) ? 1 : 0;
            
            // Non-throttled campaigns always win against recently throttled campaigns
            if (aThrottled !== bThrottled) {
                return aThrottled - bThrottled; 
            }

            const cpmA = BigInt(a.cpm_rate_wei || 0);
            const cpmB = BigInt(b.cpm_rate_wei || 0);
            if (cpmA > cpmB) return -1;
            if (cpmA < cpmB) return 1;
            return 0;
        });

        // The first element is now the highest bidder
        let selectedCampaign = eligibleCampaigns[0];

        // Log the decision into the Fatigue Manager
        try {
            const { Redis } = require('@upstash/redis');
            const redis = Redis.fromEnv();
            await redis.lpush(`served_ads_ip_${clientIp}`, selectedCampaign.id);
            await redis.ltrim(`served_ads_ip_${clientIp}`, 0, 4); // Keep a cache of the last 5 ads seen
            await redis.expire(`served_ads_ip_${clientIp}`, 3600); // Reset fatigue every hour
        } catch (e) {}

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

        // =========================================================================
        // FIX: Multi-format Image JSON Parsing
        // The frontend Advertiser Dashboard uploads a JSON string mapping sizes to URLs.
        // We must parse it and extract the correct image for the requested placement.
        // =========================================================================
        let finalImageUrl = imageRow.image_url;
        // If responsive or multiple sizes allowed, randomly or systematically pick one
        let selectedSize = selectedCampaign.ad_type.split(',')[0].trim();
        
        if (finalImageUrl && finalImageUrl.startsWith('{')) {
            try {
                const parsedImages = JSON.parse(finalImageUrl);
                if (requestedFormat && parsedImages[requestedFormat]) {
                    selectedSize = requestedFormat;
                    finalImageUrl = parsedImages[requestedFormat];
                } else {
                    // Pick a random available size from the uploaded matrix
                    const availableSizes = Object.keys(parsedImages);
                    if (availableSizes.length > 0) {
                        selectedSize = availableSizes[Math.floor(Math.random() * availableSizes.length)];
                        finalImageUrl = parsedImages[selectedSize];
                    }
                }
            } catch {
                // Legacy payload bypass
            }
        }

        // Format the response to match the SDK's expected structure
        const formattedAd = {
            id: selectedCampaign.id,
            headline: selectedCampaign.creative_title,
            cta: 'View Offer', // Could make this dynamic later
            image: finalImageUrl,
            url: enforceSecureProtocol(selectedCampaign.creative_url),
            cpc: ethers.formatUnits(selectedCampaign.cpm_rate_wei.toString(), 6), // 6 decimals for USDC
            size: selectedSize
        };

        // SECURITY UPGRADE: Cryptographic Impression Tokens
        // Rather than allowing anonymous clients to simulate `/pulse` telemetry pings and drain budgets,
        // we sign a mathematically unforgeable token granting exactly ONE impression right to this specific Ad payload.
        const tokenSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'openads-secure-fallback';
        const timestamp = Date.now();
        const rawTokenData = `${selectedCampaign.id}:${placementId}:${timestamp}`;
        const hmac = crypto.createHmac('sha256', tokenSecret).update(rawTokenData).digest('hex');
        const serveToken = `${rawTokenData}:${hmac}`;

        // CORS Headers are essential since the SDK will fetch this from external Mini App domains
        return NextResponse.json(
            { ad: formattedAd, serve_token: serveToken },
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

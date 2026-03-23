import { supabase } from '@/app/lib/supabase';
import crypto from 'crypto';
import { ethers } from 'ethers';

// High-Concurrency Node.js Vercel Memory Cache
let globalCachedCampaigns: any[] | null = null;
let lastCampaignCacheTime = 0;
const globalImageMap = new Map<number, { url: string, timestamp: number }>();

export class DecisionEngineService {
    
    /**
     * Resolves an incoming publisher request against Sandbox routing rules and Admin blacklists.
     */
    static async validatePublisherDomain(requestHost: string, identityToken: string) {
        if (!requestHost) return { isAuthorized: true };
        if (requestHost === 'localhost' || requestHost === '127.0.0.1' || requestHost.includes('ngrok.io')) return { isAuthorized: true, isLocal: true };
        if (requestHost.includes('vercel.app') && requestHost.includes('openads')) return { isAuthorized: true, isLocal: true };
        if (requestHost === 'openads.xyz' || requestHost === 'www.openads.xyz') return { isAuthorized: true, isLocal: true };

        // DYNAMICAL IDENTITY ROUTING: Support both Legacy Wallet binding and Modern App_ID binding
        let query = supabase
            .from('apps')
            .select('id, app_type, logo_url, publisher_wallet')
            .limit(1);

        if (identityToken.toLowerCase().startsWith('0x')) {
            query = query.ilike('publisher_wallet', identityToken);
        } else {
            // It's an App ID (UUID)
            query = query.eq('id', identityToken);
        }

        query = query.ilike('domain', `%${requestHost}%`);
        
        const { data: appDataList } = await query;

        if (!appDataList || appDataList.length === 0) {
            console.warn(`[Security] 403 Forbidden: Identity Token '${identityToken}' does not own domain '${requestHost}'. DoS blocked.`);
            return { isAuthorized: false, error: 'Domain unauthorized for this Publisher identity.', status: 403 };
        }

        const appData = appDataList[0];
        const parts = appData.app_type.split('|');
        const baseAppType = parts[0];
        
        // Synchronous Verify Lock
        if (!appData.logo_url) {
            await supabase.from('apps').update({ logo_url: 'verified' }).eq('id', appData.id);
        }
        
        let allowedFormats = parts.length > 1 && parts[1].startsWith('formats:') 
            ? parts[1].replace('formats:', '').split(',') 
            : null;

        if (baseAppType === 'banned') return { isAuthorized: false, error: 'Domain explicitly banned by Administrator.', status: 202 };
        if (baseAppType.startsWith('paused_')) return { isAuthorized: false, error: 'Ad serving is paused for this miniapp by the publisher.', status: 200 };

        return { isAuthorized: true, allowedFormats };
    }

    /**
     * Main Ad Selection and Decision Layer
     */
    static async resolveAd(placementId: string, publisherWalletParam: string, position: string, requestHost: string, clientIp: string) {
        let publisherWallet = publisherWalletParam || (placementId && placementId.includes('-') ? placementId.split('-')[1] : placementId);
        const requestedFormat = (placementId && placementId.includes('-')) ? placementId.split('-')[0] : 'responsive';

        // 1. Domain Verification
        const domainCheck = await this.validatePublisherDomain(requestHost, publisherWallet);
        if (!domainCheck.isAuthorized) return { errorPayload: { error: domainCheck.error }, status: domainCheck.status };

        // 2. Fetch Base Active Campaigns
        const nowTs = Date.now();
        let campaigns = globalCachedCampaigns;
        
        if (!campaigns || nowTs - lastCampaignCacheTime > 15000) {
            const { data: dbCampaigns, error } = await supabase
                .from('campaigns')
                .select('id, status, ad_type, scheduled_start, budget_wei, spend_wei, cpm_rate_wei, creative_title, creative_url, is_test')
                .eq('status', 'active');

            if (error) throw new Error('Failed to fetch base campaigns');
            campaigns = dbCampaigns || [];
            globalCachedCampaigns = campaigns;
            lastCampaignCacheTime = nowTs;
        }

        if (!campaigns || campaigns.length === 0) return { errorPayload: { error: 'No active campaigns available' }, status: 200 };

        // 3. Sandbox Logic
        const sandboxRequired = requestHost.includes('localhost') || requestHost.includes('127.0.0.1') || requestHost.includes('.local');
        let auctionPool = sandboxRequired ? campaigns.filter(c => c.is_test === true) : campaigns.filter(c => c.is_test !== true);
        if (auctionPool.length === 0) return { errorPayload: { error: 'No active campaigns available in this environment' }, status: 200 };

        // 4. Geometry Enforcement
        const filteredByPosition = auctionPool.filter(camp => {
            const types = camp.ad_type || '';
            let requiredGeo = requestedFormat;
            if (requiredGeo === 'floating') requiredGeo = '64x64';
            if (requiredGeo === 'popup') requiredGeo = '300x250';
            if (requiredGeo === 'banner') requiredGeo = '320x50';
            
            if (requestedFormat !== 'responsive' && !types.includes(requiredGeo) && !types.includes('responsive')) return false;

            if (position !== 'all') {
                if (position === 'top' || position === 'bottom') return types.includes('320x50') || types.includes('responsive');
                if (position === 'popup') return types.includes('300x250') || types.includes('responsive');
                if (position === 'floating') return types.includes('64x64') || types.includes('responsive');
            }
            
            if (domainCheck.allowedFormats && domainCheck.allowedFormats.length > 0) {
                let isFormatAllowed = false;
                for (const fmt of domainCheck.allowedFormats) {
                    if (types.includes(fmt) || types.includes('responsive')) {
                        isFormatAllowed = true;
                        break;
                    }
                }
                if (!isFormatAllowed) return false;
            }
            return true;
        });

        if (filteredByPosition.length === 0) return { errorPayload: { error: 'No active campaigns matching requested position' }, status: 200 };

        // 5. Budget Verification
        const now = new Date();
        const eligibleCampaigns = filteredByPosition.filter(camp => {
            const hasStarted = !camp.scheduled_start || new Date(camp.scheduled_start) <= now;
            const budget = BigInt(camp.budget_wei || 0);
            const spend = BigInt(camp.spend_wei || 0);
            const cpm = BigInt(camp.cpm_rate_wei || 0);
            const costPerImpression = cpm / BigInt(1000);
            return hasStarted && (budget - spend) >= costPerImpression;
        });

        if (eligibleCampaigns.length === 0) return { errorPayload: { error: 'All campaigns exhausted' }, status: 200 };

        // 6. eCPM Auction and Redis Throttling
        let throttledCampaignIds: number[] = [];
        try {
            const { Redis } = require('@upstash/redis');
            const redis = Redis.fromEnv();
            const recentServed = await redis.lrange(`served_ads_ip_${clientIp}`, 0, -1);
            if (recentServed) throttledCampaignIds = recentServed.map((id: string) => Number(id));
        } catch (e) {}

        eligibleCampaigns.sort((a, b) => {
            const aThrottled = throttledCampaignIds.includes(a.id) ? 1 : 0;
            const bThrottled = throttledCampaignIds.includes(b.id) ? 1 : 0;
            if (aThrottled !== bThrottled) return aThrottled - bThrottled; 
            const cpmA = BigInt(a.cpm_rate_wei || 0);
            const cpmB = BigInt(b.cpm_rate_wei || 0);
            if (cpmA > cpmB) return -1;
            if (cpmA < cpmB) return 1;
            return 0;
        });

        let selectedCampaign = eligibleCampaigns[0];

        // 7. Atomic Redis Deduction
        try {
            const { Redis } = require('@upstash/redis');
            const redis = Redis.fromEnv();
            const impressionCostWei = Number((BigInt(selectedCampaign.cpm_rate_wei || 0) / BigInt(1000)).toString());
            
            const realtimeSpend = await redis.incrby(`rt_spend_${selectedCampaign.id}`, impressionCostWei);
            const totalBudget = Number(selectedCampaign.budget_wei || 0);
            const postgresSpend = Number(selectedCampaign.spend_wei || 0);
            
            if (postgresSpend + realtimeSpend > totalBudget) {
                await redis.decrby(`rt_spend_${selectedCampaign.id}`, impressionCostWei);
                return { errorPayload: { error: 'All campaigns exhausted (Real-time cap)' }, status: 200 };
            }

            await redis.lpush(`served_ads_ip_${clientIp}`, selectedCampaign.id);
            await redis.ltrim(`served_ads_ip_${clientIp}`, 0, 4);
            await redis.expire(`served_ads_ip_${clientIp}`, 3600);
        } catch (e) {}

        // 8. Image and Formatting
        let imageRowData = null;
        let imageErrorObj = null;

        const cachedImage = globalImageMap.get(selectedCampaign.id);
        if (cachedImage && nowTs - cachedImage.timestamp < 15000) {
            imageRowData = { image_url: cachedImage.url };
        } else {
            const { data: imageRow, error: imageError } = await supabase.from('campaigns').select('image_url').eq('id', selectedCampaign.id).single();
            imageErrorObj = imageError;
            imageRowData = imageRow;
            if (imageRow && !imageError) globalImageMap.set(selectedCampaign.id, { url: imageRow.image_url, timestamp: nowTs });
        }

        if (imageErrorObj || !imageRowData) throw new Error("Failed to fetch ad creative");

        let finalImageUrl = imageRowData.image_url;
        let selectedSize = selectedCampaign.ad_type.split(',')[0].trim();
        
        if (finalImageUrl && finalImageUrl.startsWith('{')) {
            try {
                const parsedImages = JSON.parse(finalImageUrl);
                if (requestedFormat && parsedImages[requestedFormat]) {
                    selectedSize = requestedFormat;
                    finalImageUrl = parsedImages[requestedFormat];
                } else {
                    const availableSizes = Object.keys(parsedImages);
                    if (availableSizes.length > 0) {
                        selectedSize = availableSizes[Math.floor(Math.random() * availableSizes.length)];
                        finalImageUrl = parsedImages[selectedSize];
                    }
                }
            } catch {}
        }

        const enforceSecureUrl = (url: string, fallbackLink: string) => {
            if (!url) return fallbackLink;
            try { return (new URL(url).protocol === 'http:' || new URL(url).protocol === 'https:') ? url : fallbackLink; } 
            catch { return fallbackLink; }
        };

        const safeCreativeUrl = enforceSecureUrl(selectedCampaign.creative_url, 'https://openads-backend.vercel.app');
        
        // Base64 Transparent pixel as the ultimate unbreakable fallback if the DB is corrupted
        const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const safeImageUrl = enforceSecureUrl(finalImageUrl, transparentPixel);

        const formattedAd = {
            id: selectedCampaign.id,
            headline: selectedCampaign.creative_title,
            cta: 'View Offer',
            image: safeImageUrl,
            url: safeCreativeUrl,
            cpc: ethers.formatUnits(selectedCampaign.cpm_rate_wei.toString(), 6),
            size: selectedSize
        };

        const tokenSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'openads-secure-fallback';
        const rawTokenData = `${selectedCampaign.id}:${placementId}:${nowTs}`;
        const hmac = crypto.createHmac('sha256', tokenSecret).update(rawTokenData).digest('hex');
        const serveToken = `${rawTokenData}:${hmac}`;

        return { payload: { ad: formattedAd, serve_token: serveToken }, status: 200 };
    }
}

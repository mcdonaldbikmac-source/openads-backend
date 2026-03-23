import { CampaignRepository } from '@/repositories/campaignRepository';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

/**
 * Campaign Service
 * Handles core business logic, validation, and payload transformations.
 * Never performs direct HTTP routing or raw SQL.
 */
export class CampaignService {
    
    /**
     * Resolves a Farcaster Authentication Object into a deterministic list of DB query identities.
     */
    static resolveAuthIdentities(authObj: any): string[] {
        const identities = new Set<string>();
        
        if (authObj.fid) identities.add(String(authObj.fid));
        if (authObj.address) identities.add(authObj.address);
        if (authObj.custody) identities.add(authObj.custody);
        
        return Array.from(identities);
    }

    static async getUserCampaigns(authObj: any) {
        const identities = this.resolveAuthIdentities(authObj);
        return await CampaignRepository.getCampaignsByIdentities(identities);
    }

    static async getUserCampaignsWithMetrics(authObj: any) {
        const campaigns = await this.getUserCampaigns(authObj);
        if (!campaigns || campaigns.length === 0) return [];

        let redisClient: any = null;
        let redisPendingViews: Record<string, string> | null = null;
        try {
            const { Redis } = require('@upstash/redis');
            redisClient = Redis.fromEnv();
            redisPendingViews = await redisClient.hgetall('cron_pending_views');
        } catch(e) { console.warn("[Service] Advertiser Dashboard Redis Fusion offline. Falling back to Postgres only.", e); }

        const formattedCampaigns = await Promise.all(campaigns.map(async (camp: any) => {
            const { count: clicksCount } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', camp.id)
                .eq('event_type', 'click');

            const { count: viewsCount } = await supabase
                .from('tracking_events')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', camp.id)
                .eq('event_type', 'view');
                
            let realtimeViews = 0;
            if (redisPendingViews) {
                for (const [key, val] of Object.entries(redisPendingViews)) {
                    if (key.startsWith(`${camp.id}::`)) realtimeViews += Number(val);
                }
            }

            let realtimeSpendWei = BigInt(0);
            if (redisClient) {
                try {
                    const rs = await redisClient.get(`rt_spend_${camp.id}`);
                    if (rs) realtimeSpendWei = BigInt(rs);
                } catch(e) {}
            }

            const dbImpressions = viewsCount || camp.impressions || 0;
            const finalImpressions = dbImpressions + realtimeViews;
            const finalClicks = clicksCount || 0;

            let displayUrl = camp.creative_url || '';
            let txHash = null;

            if (displayUrl.includes('#tx=')) {
                const parts = displayUrl.split('#tx=');
                displayUrl = parts[0];
                txHash = parts[1];
            } else if (displayUrl.includes('&tx=')) {
                const parts = displayUrl.split('&tx=');
                displayUrl = parts[0];
                txHash = parts[1];
            }

            const totalSpendWei = BigInt(String(camp.spend_wei || '0').split('.')[0]) + realtimeSpendWei;
            const spendUsd = Number(ethers.formatUnits(totalSpendWei.toString(), 6)).toFixed(4);

            return {
                id: camp.id,
                headline: camp.creative_title,
                image_url: camp.image_url,
                url: displayUrl,
                tx_hash: txHash,
                ad_type: camp.ad_type,
                impressions: finalImpressions,
                clicks: finalClicks,
                status: camp.status,
                budget_usd: Number(ethers.formatUnits(String(camp.budget_wei || '0').split('.')[0], 6)).toFixed(2),
                spend_usd: spendUsd,
                cpm_usd: Number(ethers.formatUnits(String(camp.cpm_rate_wei || '0').split('.')[0], 6)).toFixed(2),
                created_at: camp.created_at,
                updated_at: camp.updated_at
            };
        }));

        return formattedCampaigns;
    }

    static async verifyCampaignOwnership(campaignId: string, authObj: any): Promise<boolean> {
        const campaign = await CampaignRepository.getCampaignById(campaignId);
        if (!campaign) return false;
        
        const ownerIdentity = campaign.advertiser_wallet || '';
        const userIdentities = this.resolveAuthIdentities(authObj);
        
        for (const identity of userIdentities) {
            if (ownerIdentity.toLowerCase() === identity.toLowerCase()) return true;
            if (ownerIdentity.toLowerCase().includes(`|${identity.toLowerCase()}|`)) return true;
        }
        
        return false;
    }

    static async toggleCampaignStatus(campaignId: string, requestedStatus: string, authObj: any) {
        const isOwner = await this.verifyCampaignOwnership(campaignId, authObj);
        if (!isOwner) throw new Error("Unauthorized: Campaign ownership verification failed.");
        
        if (!['active', 'paused'].includes(requestedStatus)) {
            throw new Error("Invalid status type.");
        }
        
        await CampaignRepository.updateCampaignStatus(campaignId, requestedStatus);
    }
}

import { supabase } from '@/app/lib/supabase';

/**
 * Campaign Repository
 * Pure Data Access Layer for the `campaigns` table.
 * No business logic or HTTP response formatting belongs here.
 */
export class CampaignRepository {
    
    /**
     * Fetch all campaigns linked to a composite array of identities (FID, Web3 Address, Custody Wallet)
     * Handles legacy zero-migration backward compatibility queries natively.
     */
    static async getCampaignsByIdentities(identities: string[]) {
        if (!identities || identities.length === 0) return [];
        
        let orQueryParts: string[] = [];
        for (const identity of identities) {
            orQueryParts.push(`advertiser_wallet.ilike.${identity}`);
            orQueryParts.push(`advertiser_wallet.ilike.%|${identity}|%`);
        }
        
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .or(orQueryParts.join(','))
            .eq('is_test', false)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }
    
    static async getActiveCampaigns() {
        const { data, error } = await supabase
            .from('campaigns')
            .select('id, status, ad_type, scheduled_start, budget_wei, spend_wei, cpm_rate_wei, creative_title, creative_url, is_test')
            .eq('status', 'active');
            
        if (error) throw error;
        return data || [];
    }

    static async getCampaignById(id: string) {
        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = 0 rows
        return data;
    }

    static async updateCampaignStatus(id: string, newStatus: string) {
        const { error } = await supabase
            .from('campaigns')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;
    }
    
    static async updateCampaignDetails(id: string, updates: any) {
        const { error } = await supabase
            .from('campaigns')
            .update(updates)
            .eq('id', id);
            
        if (error) throw error;
    }
}

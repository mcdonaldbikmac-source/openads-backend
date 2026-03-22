require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    try {
        const { data, error } = await supabase.from('campaigns').select('ad_type, impressions, spend_wei').eq('status', 'active');
        if (error) throw error;
        
        const formatPricing = { banner: 0.5, native: 2.5, interstitial: 6.0, rewarded: 12.0 };
        let totalImpressions = 0;
        
        if (data && data.length > 0) {
            const aggregates = {};
            data.forEach(camp => {
                const type = camp.ad_type || 'banner';
                if (!aggregates[type]) aggregates[type] = { views: 0, spend: 0 };
                aggregates[type].views += Number(camp.impressions) || 0;
                aggregates[type].spend += (Number(camp.spend_wei) || 0) / 1e6;
                totalImpressions += Number(camp.impressions) || 0;
            });
            Object.keys(aggregates).forEach(type => {
                const a = aggregates[type];
                if (a.views > 10000 && a.spend > 0) {
                    formatPricing[type] = (a.spend / a.views) * 1000;
                }
            });
        }
        console.log(JSON.stringify({ success: true, totalImpressions, pricing: formatPricing }));
    } catch (e) {
        console.error('Error:', e);
    }
}
run();

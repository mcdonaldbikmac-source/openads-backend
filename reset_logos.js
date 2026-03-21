import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\\n/g, '').replace(/\n/g, '').replace(/['"]/g, '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).replace(/\\n/g, '').replace(/\n/g, '').replace(/['"]/g, '').trim()
);

async function run() {
    console.log("Wiping all 'verified' flags from logo_url...");
    const { data: fetchApps } = await supabase.from('apps').select('id, name, logo_url').in('logo_url', ['verified', 'fallback']);
    
    if (!fetchApps || fetchApps.length === 0) {
        console.log("No apps locked with 'verified' logo flag.");
    } else {
        console.log(`Found ${fetchApps.length} locked apps, updating...`);
        const { error } = await supabase.from('apps').update({ logo_url: null }).in('logo_url', ['verified', 'fallback']);
        if (error) {
            console.error("Failed to wipe:", error);
        } else {
            console.log("Wipe successful. Organic scraping re-enabled.");
        }
    }
}
run();

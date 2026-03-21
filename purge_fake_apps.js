const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Delete anything that has "Test", "Scam", "FC App", "Local" in the name or domain
    const { data: apps, error } = await supabase.from('apps').select('id, name, domain');
    if (error) {
        console.error("Fetch error:", error);
        return;
    }
    
    let deletedCount = 0;
    for (const app of apps) {
        const title = (app.name || '') + ' ' + (app.domain || '');
        if (
            title.toLowerCase().includes('test') || 
            title.toLowerCase().includes('scam') || 
            title.toLowerCase().includes('fc app') ||
            title.toLowerCase().includes('localhost') ||
            title.toLowerCase().includes('127.0.0.1')
        ) {
            console.log(`Deleting Fake App: ${app.name} (${app.domain})`);
            await supabase.from('apps').delete().eq('id', app.id);
            deletedCount++;
        }
    }
    console.log(`Deleted ${deletedCount} fake apps.`);
}
run();

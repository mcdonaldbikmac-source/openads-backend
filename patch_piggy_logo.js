const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const domain = "https://piggy-bank-cbbtc.vercel.app/";
    
    // Fetch HTML
    const res = await fetch(domain);
    const htmlText = await res.text();
    
    const ogImageMatch = htmlText.match(/<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i)
       || htmlText.match(/<meta[^>]*content=['"]([^'"]+)['"][^>]*property=['"]og:image['"]/i)
       || htmlText.match(/<link[^>]*rel=['"]icon['"][^>]*href=['"]([^'"]+)['"]/i)
       || htmlText.match(/<link[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]icon['"]/i);
    
    let extractedLogo = 'verified';
    if (ogImageMatch && ogImageMatch[1]) {
        extractedLogo = ogImageMatch[1];
        if (extractedLogo.startsWith('/')) {
            const urlObj = new URL(domain);
            extractedLogo = urlObj.origin + extractedLogo;
        }
    }
    
    console.log(`Extracted Logo for Piggy Bank: ${extractedLogo}`);
    
    const { error } = await supabase
        .from('apps')
        .update({ logo_url: extractedLogo })
        .eq('id', 'df45d1bf-0f21-4ee2-9375-a839f795b930');
        
    if (error) console.error("Error setting logo:", error);
    else console.log("Successfully retrofitted Piggy Bank logo into the database!");
}
run();

const fs = require('fs');
let decide = fs.readFileSync('src/app/api/v1/serve/decide/route.ts', 'utf8');

// 1. Swap testing hack: .includes('openads-backend') to proper NODE_ENV check
decide = decide.replace(
    /\['openads-backend\.vercel\.app', 'localhost:3000', '127\.0\.0\.1:8080', 'localhost'\]\.includes\(requestHost\)/, 
    "process.env.NODE_ENV === 'development' || ['openads.xyz', 'openads-backend.vercel.app'].includes(requestHost)"
);

// 2. Insert Publisher Verification Engine
// We must make sure 'id, logo_url' is selected in the supabase query first!
decide = decide.replace(
    /\.select\('app_type'\)/,
    ".select('id, app_type, logo_url')"
);

const verificationEngine = `
                // =========================================================================
                // SECURITY UPDATE: Integrated Publisher Verification (Auto-Scraper)
                // Executes purely asynchronously to strictly avoid blocking the Edge ad render pipeline.
                // =========================================================================
                if (!appData.logo_url || appData.logo_url === 'verified') {
                    (async () => {
                        let extractedLogo = 'verified';
                        try {
                            let checkUrl = requestHost;
                            if (!checkUrl.startsWith('http')) checkUrl = 'https://' + checkUrl;
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 4000); 
                            const htmlRes = await fetch(checkUrl, { signal: controller.signal, headers: { 'User-Agent': 'OpenAds-Verification-Bot/1.0' }, cache: 'no-store' });
                            clearTimeout(timeoutId);
                            if (htmlRes.ok) {
                                const htmlText = await htmlRes.text();
                                const limitedHtml = htmlText.substring(0, 1024 * 512);
                                
                                const ogImageMatch = limitedHtml.match(/<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i)
                                   || limitedHtml.match(/<meta[^>]*content=['"]([^'"]+)['"][^>]*property=['"]og:image['"]/i)
                                   || limitedHtml.match(/<link[^>]*rel=['"]icon['"][^>]*href=['"]([^'"]+)['"]/i)
                                   || limitedHtml.match(/<link[^>]*href=['"]([^'"]+)['"][^>]*rel=['"]icon['"]/i);
                                   
                                if (ogImageMatch && ogImageMatch[1]) {
                                    extractedLogo = ogImageMatch[1];
                                    if (extractedLogo.startsWith('/')) {
                                        try { extractedLogo = new URL(checkUrl).origin + extractedLogo; } catch(e) {}
                                    }
                                }
                            }
                        } catch (crawlErr) {}
                        await supabase.from('apps').update({ logo_url: extractedLogo }).eq('id', appData.id);
                    })();
                }

                if (baseAppType === 'banned')`;

decide = decide.replace(/if \(baseAppType === 'banned'\)/, verificationEngine);

// 3. Add Cache-Control Headers to all NextResponse variations
decide = decide.replace(/\{ status: 200 \}/g, "{ status: 200, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', 'Access-Control-Allow-Origin': '*' } }");
decide = decide.replace(/\{ status: 202 \}/g, "{ status: 202, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', 'Access-Control-Allow-Origin': '*' } }");
decide = decide.replace(/'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',/g, "'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',\\n                    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',");

fs.writeFileSync('src/app/api/v1/serve/decide/route.ts', decide, 'utf8');
console.log('decide/route.ts cache headers & verification engine injected successfully.');

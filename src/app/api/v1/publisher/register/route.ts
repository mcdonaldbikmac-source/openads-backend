import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { wallet_address, domain_url, app_name, app_logo_url, verification_method } = body;

        if (!wallet_address || !domain_url || !verification_method) {
            return NextResponse.json(
                { error: 'wallet_address, domain_url, and verification_method are required.' },
                { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // Clean domain URL mapping
        let cleanedUrl = domain_url;
        try {
            if (!cleanedUrl.startsWith('http')) {
                cleanedUrl = 'https://' + cleanedUrl;
            }
            const urlObj = new URL(cleanedUrl);
            cleanedUrl = urlObj.origin; // e.g. https://example.com
        } catch (e) {
            return NextResponse.json(
                { error: 'Invalid domain_url format' },
                { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // First check if domain already exists
        const { data: existingDomain } = await supabase
            .from('openads_publishers')
            .select('id, wallet_address')
            .eq('domain_url', cleanedUrl)
            .single();

        if (existingDomain) {
            if (existingDomain.wallet_address !== wallet_address) {
                 return NextResponse.json(
                    { error: 'Domain is already registered by another wallet.' },
                    { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
                 );
            }
            // If same wallet, just update the info
            const { data, error } = await supabase
                .from('openads_publishers')
                .update({ 
                    app_name, 
                    app_logo_url, 
                    verification_method 
                })
                .eq('id', existingDomain.id)
                .select()
                .single();

            if (error) throw error;
            return NextResponse.json(
                { success: true, message: 'App entry updated', data },
                { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        // --- NEW METADATA SCRAPING LOGIC ---
        let scrapedName = app_name;
        let scrapedLogo = app_logo_url;
        
        if (!scrapedName || !scrapedLogo) {
            try {
                // Fetch the HTML to scrape metadata
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 sec timeout
                const res = await fetch(cleanedUrl, { 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    signal: controller.signal 
                });
                const html = await res.text();
                clearTimeout(timeoutId);

                // Quick Regex parsing for Title
                const titleMatch = html.match(/<title[^>]*>\s*([^<]+)\s*<\/title>/i);
                const ogTitleMatch = html.match(/<meta\s+(?:property|name)=["']og:(?:title|site_name)["']\s+content=["']([^"']+)["']/i);
                
                if (!scrapedName) {
                    scrapedName = ogTitleMatch ? ogTitleMatch[1].trim() : (titleMatch ? titleMatch[1].trim() : cleanedUrl.replace('https://', '').replace(/^www\./, ''));
                }

                // Quick Regex parsing for Logo (og:image or favicon)
                const ogImageMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["'](.*?)["']/i);
                const iconMatch = html.match(/<link\s+rel=["'](?:shortcut\s+)?icon["']\s+href=["'](.*?)["']/i);
                const appleIconMatch = html.match(/<link\s+rel=["']apple-touch-icon["']\s+href=["'](.*?)["']/i);
                
                if (!scrapedLogo) {
                    let logoUrl = ogImageMatch ? ogImageMatch[1] : (appleIconMatch ? appleIconMatch[1] : (iconMatch ? iconMatch[1] : null));
                    // Resolve relative URLs
                    if (logoUrl && !logoUrl.startsWith('http') && !logoUrl.startsWith('data:')) {
                        if (logoUrl.startsWith('//')) logoUrl = 'https:' + logoUrl;
                        else if (logoUrl.startsWith('/')) logoUrl = cleanedUrl + logoUrl;
                        else logoUrl = cleanedUrl + '/' + logoUrl;
                    }
                    scrapedLogo = logoUrl || 'https://cdn.worldvectorlogo.com/logos/globe-3.svg'; // Default globe
                }
            } catch (e) {
                console.warn(`[OpenAds] Could not scrape metadata for ${cleanedUrl}`, e);
                scrapedName = scrapedName || cleanedUrl.replace('https://', '').replace(/^www\./, '');
                scrapedLogo = scrapedLogo || 'https://cdn.worldvectorlogo.com/logos/globe-3.svg';
            }
        }
        // -----------------------------------

        // Insert new unverified entry
        const { data, error } = await supabase
            .from('openads_publishers')
            .insert([{
                wallet_address,
                domain_url: cleanedUrl,
                app_name: scrapedName,
                app_logo_url: scrapedLogo,
                verification_method,
                is_verified: false
            }])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(
            { success: true, message: 'App registered successfully', data },
            { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
        );

    } catch (err: any) {
        console.error('Publisher Register API Error:', err);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

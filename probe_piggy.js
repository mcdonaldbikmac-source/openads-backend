async function check() {
    const checkUrl = 'https://piggy-bank-cbbtc.vercel.app/';
    console.log("Fetching:", checkUrl);
    
    // Simulate typical crawler arguments without `redirect: 'manual'` first just to trace hop path
    let res = await fetch(checkUrl, {
        headers: { 'User-Agent': 'OpenAds-Verification-Bot/1.0' }
    });
    
    console.log("Follow Redirect Status:", res.status);
    console.log("Final URL:", res.url);
    
    // Now simulate exact backend crawler:
    res = await fetch(checkUrl, {
        headers: { 'User-Agent': 'OpenAds-Verification-Bot/1.0' },
        redirect: 'manual'
    });
    
    console.log("Manual Redirect Status:", res.status);
    let text = await res.text();
    console.log("Length:", text.length);
    console.log("Contains OpenAds Iframe?:", /<iframe[^>]*src=["'][^"']*openads-backend\.vercel\.app\/serve/i.test(text));
    console.log("Contains Farcaster FID?:", /publisher=1550542/i.test(text));
    
    const match = text.match(/<iframe[^>]*src=["'][^"']*openads-backend\.vercel\.app\/serve/i);
    if (match) {
        const idx = match.index;
        console.log("EXCERPT:");
        console.log(text.substring(Math.max(0, idx - 50), idx + 200));
    } else {
         console.log("Tag absolutely not found in raw DOM.");
    }
}

check();

async function run() {
    const checkUrl = "https://piggy-bank-cbbtc.vercel.app/";
    const htmlRes = await fetch(checkUrl);
    const htmlText = await htmlRes.text();
    const limitedHtml = htmlText.substring(0, 1024 * 512);

    console.log("Found meta og:image:", limitedHtml.match(/<meta[^>]*property=['"]og:image['"][^>]*content=['"]([^'"]+)['"]/i)?.[1]);
    console.log("Found icon href:", limitedHtml.match(/<link[^>]*rel=['"]icon['"][^>]*href=['"]([^'"]+)['"]/i)?.[1]);
}
run();

const { ethers } = require('ethers');

async function testFetch() {
    // Mimic app.js getAuthPayload()
    const authObj = {
        role: "advertiser",
        provider: "farcaster",
        username: "hunt16z",
        fid: "1550542",
        address: "0xa1a...fake",
        custody: "0x895Af8672d72528F168A239a16c4c07eeE4890C0",
        signature: "0x...",
        nonce: "123",
        message: "Sign to login to OpenAds Network",
        socialVerified: true,
        loggedAt: Date.now(),
        siwf: "live"
    };
    
    const authBase64 = Buffer.from(JSON.stringify(authObj)).toString('base64');
    const wallet = authObj.fid;
    
    console.log(`Simulating fetch to: http://localhost:3000/api/v1/user/campaigns?wallet=${wallet}`);
    
    // We cannot easily test http://localhost:3000 unless we spin up the Next.js server locally
    // So let's just test against the production Vercel deployment!
    const res = await fetch(`https://openads-backend.vercel.app/api/v1/user/campaigns?wallet=${wallet}`, {
        method: 'GET',
        headers: {
            'X-OpenAds-Auth': authBase64
        }
    });
    
    const json = await res.json();
    console.log("Response Status:", res.status);
    console.log("Response Body:", JSON.stringify(json, null, 2));
}

testFetch().catch(console.error);

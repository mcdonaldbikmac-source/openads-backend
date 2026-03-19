const { ethers } = require('ethers');

async function runAudit() {
    console.log("🛡️ Initializing Level 3 Security Audit Protocol...");
    
    const hackerWallet = ethers.Wallet.createRandom();
    const rawAddress = hackerWallet.address;
    
    // ----------------------------------------------------------------------------------
    // TEST 1: Stored XSS Attack via Base64 Image Upload
    // ----------------------------------------------------------------------------------
    console.log("\n[Test 1] Executing Stored XSS Payload against /serve/create CDN Parser...");
    const maliciousHtmlBase64 = "data:text/html;base64,PHNjcmlwdD5hbGVydCgiSGFja2VkIik7PC9zY3JpcHQ+"; // <script>alert("Hacked");</script>
    
    const budget = 1000;
    const expectedMessage = `Sign to authorize campaign creation for $${budget}`;
    const signature = await hackerWallet.signMessage(expectedMessage);
    
    try {
        const res = await fetch('http://localhost:3000/api/v1/serve/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                advertiser: rawAddress,
                headline: "Hacker Ad",
                cta: "Click Me",
                image: JSON.stringify({ "320x50": maliciousHtmlBase64 }),
                url: "https://evil.com",
                size: "320x50",
                budget: budget,
                cpm: 0.1,
                // Passing a dummy txHash to get past initial checks and hit the XSS filter,
                // Or wait, if txHash validation fails first, it might not reach XSS.
                // Let's use a voucher to bypass Web3 RPC and hit the XSS parser directly!
                voucherCode: "FAKE_VOUCHER_TO_HIT_XSS", 
                signature,
                signer_wallet: rawAddress
            })
        });
        
        const data = await res.json();
        console.log(`[Response] Status: ${res.status}`);
        console.log(`[Response] Body:`, data);
        
        if (res.status === 400 && data.error && data.error.includes("Invalid image format")) {
            console.log("✅ SUCCESS: The Backend successfully detected and blocked the XSS MIME Type forgery!");
        } else {
            console.error("❌ FAILED: The Backend processed the XSS payload or threw a different error!");
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }

    // ----------------------------------------------------------------------------------
    // TEST 2: Farcaster SIWF Malformed Signature Rejection
    // ----------------------------------------------------------------------------------
    console.log("\n[Test 2] Executing Farcaster SIWF Identity Spoofing against /user/budget...");
    
    try {
        const res = await fetch('http://localhost:3000/api/v1/user/budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                campaign_id: 1,
                amount: 500,
                txHash: "0x1234567890abcdef",
                signer_wallet: "12345", // Farcaster FID
                message: "openads-backend.vercel.app wants you to sign in with your Farcaster account.",
                nonce: "fake_nonce",
                signature: "0xbadc0de" // Fake SIWF signature
            })
        });
        
        const data = await res.json();
        console.log(`[Response] Status: ${res.status}`);
        console.log(`[Response] Body:`, data);
        
        if (res.status === 401 && data.error && data.error.includes("Exception")) {
            console.log("✅ SUCCESS: The Backend successfully intercepted and rejected the fake Farcaster SIWF Payload.");
        } else {
            console.error("❌ FAILED: The Backend processed the fake Farcaster identity!");
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

runAudit();

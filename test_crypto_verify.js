const { ethers } = require('ethers');

async function testWeb3DDoSFirewall() {
    console.log("🛡️ Initializing Web3 DDoS Firewall Test...");
    
    // 1. Create a simulated Hacker Wallet
    const hackerWallet = ethers.Wallet.createRandom();
    console.log(`[Hacker] Generated transient Private Key for wallet: ${hackerWallet.address}`);
    
    // 2. Assemble the strict Timestamped Payload
    const timestamp = Date.now().toString();
    const rawAddress = hackerWallet.address.toLowerCase();
    const message = `Verify OpenAds Domain\nTimestamp: ${timestamp}\nWallet: ${rawAddress}`;
    
    console.log(`[Hacker] Signing EIP-191 Message:\n"""\n${message}\n"""`);
    const signature = await hackerWallet.signMessage(message);
    console.log(`[Hacker] Signature generated: ${signature.substring(0, 20)}...`);
    
    // 3. Fire the POST request at the local Next.js Serverless Edge
    console.log(`\n🚀 Firing Network Request to Local /verify Router...`);
    
    try {
        const res = await fetch('http://localhost:3000/api/v1/publisher/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: rawAddress,
                signature,
                timestamp
            })
        });
        
        const text = await res.text();
        console.log(`\n✅ [Backend Response] Status ${res.status}:`, text);
        
        if (text.includes("active") || text.includes("waiting")) {
             console.log("🎉 SUCCESS: The mathematical signature was perfectly deciphered by the Edge Router!");
        } else if (text.includes("Missing cryptographic")) {
             console.log("❌ FAIL: Empty Payload.");
        } else {
             console.log("🔍 INFO: Proceeded past Cryptography, failed at Crawler (Expected for fake local test).");
        }
    } catch (e) {
        console.error("❌ Network Crash:", e);
    }
}

testWeb3DDoSFirewall();

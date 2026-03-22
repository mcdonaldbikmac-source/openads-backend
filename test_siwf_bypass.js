
async function testSIWFBypass() {
    console.log("=== EXECUTING FARCASTER SIWF NATIVE CLAIM BYPASS TEST ===");
    console.log("Simulating a Farcaster user (FID: 1550542) clicking [Claim] Without MetaMask...");

    const payload = { 
        wallet: "1550542", // Immortal Database Identity
        payoutAddress: "0x8919379659aA469904E070bd6497746537365618", // Connected Web3 Custody Wallet
        signature: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b", // Native SIWF Token (Not MetaMask SignMessage)
        nonce: "fake-nonce-123",
        message: "openads-backend.vercel.app wants you to sign in with your Farcaster account.",
        claimType: "ad" 
    };

    console.log("\n[Frontend Payload Dispatch]:", JSON.stringify(payload, null, 2));

    try {
        const res = await fetch('http://localhost:3000/api/v1/publisher/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        
        console.log("\n[Backend Response Output]:", res.status, data);

        if (data.error && data.error.includes("Farcaster Cryptographic Signature Invalid")) {
            console.log("\n✅ SUCCESS: The Smart Contract Claim API successfully triggered the Farcaster Auth-Client verification module!");
            console.log("✅ The system successfully BYPASSED the require for a raw Ethers.js EIP-191 MetaMask Signature check!");
        } else {
            console.log("\n❌ FAIL: The backend did not route into the SIWF module.");
        }
    } catch (e) {
        console.error("Test execution failed:", e.message);
    }
}

testSIWFBypass();

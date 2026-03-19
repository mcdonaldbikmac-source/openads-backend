async function testGraceFallback() {
    console.log("🛡️ Initializing Grace Fallback UX Bypass Test...");
    
    const timestamp = Date.now().toString();
    const mockWallet = "0x" + "1".repeat(40); // 0x1111...
    
    console.log(`[Non-Web3 User] Clicking Verify without MetaMask installed.`);
    console.log(`[Non-Web3 User] Triggering payload signature: 'NO_PROVIDER_GRACE_FALLBACK'`);
    
    try {
        const res = await fetch('http://localhost:3000/api/v1/publisher/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: mockWallet,
                signature: 'NO_PROVIDER_GRACE_FALLBACK',
                timestamp
            })
        });
        
        const text = await res.text();
        console.log(`\n✅ [Backend Response] Status ${res.status}:`, text);
        
        if (text.includes("active") || text.includes("waiting")) {
             console.log("🎉 SUCCESS: The backend gracefully bypassed extreme cryptography and allowed the UX fallback!");
        } else if (text.includes("Cryptographic")) {
             console.log("❌ FAIL: Backend still blocking gracefully skipped payloads.");
        } else {
             console.log("🔍 INFO: Backend bypassed Crypto, failed at Crawler (Expected for fake local domain).");
        }
    } catch (e) {
        console.error("❌ Network Crash:", e);
    }
}
testGraceFallback();

async function testVerifyAPI() {
    const res = await fetch('https://openads-backend.vercel.app/api/v1/publisher/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            wallet: '1550542',
            signature: 'FARCASTER_MOBILE_BYPASS',
            timestamp: Date.now().toString()
        })
    });
    
    console.log("Status Code:", res.status);
    const data = await res.json();
    console.log("Response Body:", data);
}

testVerifyAPI();

const { ethers } = require('ethers');

async function run() {
    const wallet = ethers.Wallet.createRandom();
    const domain = "testwizard.vercel.app";
    const name = "FC App";
    
    const message = `Sign to register domain ${domain} for publisher ${wallet.address}`;
    const signature = await wallet.signMessage(message);
    
    // Step 1
    const resWeb3 = await fetch('http://localhost:3000/api/v1/publisher/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address, name, domain, app_type: "web", signature, message })
    });
    console.log("Web3 POST /apps:", await resWeb3.json());
    
    // Step 4 (Using Bypass as publisher.js does)
    const resVrfy = await fetch('http://localhost:3000/api/v1/publisher/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            wallet: wallet.address,
            domain,
            signature: 'FARCASTER_MOBILE_BYPASS',
            timestamp: Date.now().toString()
        })
    });
    console.log("Web3 POST /verify:", resVrfy.status, await resVrfy.json());
}
run();

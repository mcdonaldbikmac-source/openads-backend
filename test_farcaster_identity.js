const fetch = require('node-fetch');
async function checkFID() {
    try {
        const res1 = await fetch('https://nemes.farcaster.xyz:2281/v1/custodyAddress?fid=1550542');
        const custodyObj = await res1.json();
        console.log("Custody for 1550542:", custodyObj);
    } catch(e) { console.error(e); }

    try {
        const res2 = await fetch('https://nemes.farcaster.xyz:2281/v1/verificationsByFid?fid=1550542');
        const verifObj = await res2.json();
        console.log("Verifications for 1550542:", JSON.stringify(verifObj, null, 2));
    } catch(e) { console.error(e); }
}
checkFID();

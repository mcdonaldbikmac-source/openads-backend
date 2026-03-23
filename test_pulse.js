require('dotenv').config({path: '.env.local'});
const crypto = require('crypto');

async function test() {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adId = '246d6604-c4b2-4a5d-9a61-f4a69a8e4367'; // Piggy Bank Ad
    const pId = 'responsive-0x895Af867Ff2db5BbcA3e34bE8A54ff8F747b0A0B';
    const ts = Date.now().toString();
    const hmac = crypto.createHmac('sha256', secret).update(`${adId}:${pId}:${ts}`).digest('hex');
    const sig = `${adId}:${pId}:${ts}:${hmac}`;

    const res = await fetch('https://openads-backend.vercel.app/api/v1/serve/pulse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://piggy-bank-cbbtc.vercel.app'
        },
        body: JSON.stringify({
            event: 'view',
            placement: pId,
            publisher: '0x895Af867Ff2db5BbcA3e34bE8A54ff8F747b0A0B',
            fid: 0,
            sig: sig,
            ad: { id: adId },
            client_type: 'web'
        })
    });
    console.log("Status:", res.status);
    console.log(await res.text());
}
test();

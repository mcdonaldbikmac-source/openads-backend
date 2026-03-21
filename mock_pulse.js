
async function run() {
    const res = await fetch('http://localhost:3000/api/v1/serve/pulse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://piggy-bank-cbbtc.vercel.app',
            'Referer': 'https://piggy-bank-cbbtc.vercel.app/'
        },
        body: JSON.stringify({
            client_type: 'web',
            event: 'connect',
            ad: { id: '00000000-0000-0000-0000-000000000000' },
            placement: 'responsive-0x3F61CD5BB0bc2ba8db82046ca9fB7bC7c0506ebD',
            publisher: '0x3F61CD5BB0bc2ba8db82046ca9fB7bC7c0506ebD',
            fid: 1,
            logo: '',
            sig: 'verified_origin',
            message: 'connect:responsive-0x3F61CD5BB0bc2ba8db82046ca9fB7bC7c0506ebD:0x3F61CD5BB0bc2ba8db82046ca9fB7bC7c0506ebD',
            parent_url: 'https://piggy-bank-cbbtc.vercel.app'
        })
    });
    console.log(res.status, await res.text());
}
run();

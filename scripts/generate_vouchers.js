const fetch = require('node-fetch'); // Native fetch available in recent Node versions
require('dotenv').config({ path: '.env.local' });

async function generateVouchers() {
    const SERVER_URL = process.env.NEXT_PUBLIC_API_URL || 'https://openads-backend.vercel.app';
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'openads_admin_2026';

    // Script arguments: node generate_vouchers.js <COUNT> <USDC_AMOUNT>
    const count = parseInt(process.argv[2]) || 5;
    const amount = parseFloat(process.argv[3]) || 10.0;

    console.log(`🚀 Requesting to generate ${count} vouchers worth $${amount} USDC each...`);

    try {
        const res = await fetch(`${SERVER_URL}/api/v1/voucher/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                count: count,
                amount: amount,
                secret: ADMIN_SECRET
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');

        console.log('✅ Success! Generated Promo Codes:');
        console.table(data.vouchers, ['code', 'amount']);
        console.log('\nDistribute these codes to invite new advertisers to the network!');
    } catch (err) {
        console.error('❌ Failed to generate vouchers:', err.message);
    }
}

generateVouchers();

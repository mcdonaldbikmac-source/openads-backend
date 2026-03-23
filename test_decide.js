require('dotenv').config({path: '.env.local'});
const { DecisionEngineService } = require('./src/services/DecisionEngineService.ts');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    try {
        const fetch = require('node-fetch');
        const res = await fetch('http://localhost:3001/api/v1/serve/decide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': 'https://piggy-bank-cbbtc.vercel.app' },
            body: JSON.stringify({
                placementId: 'responsive-0x895Af867Ff2db5BbcA3e34bE8A54ff8F747b0A0B',
                position: 'bottom'
            })
        });
        const data = await res.json();
        console.log("DECIDE API RESULT:", JSON.stringify(data, null, 2));
    } catch(e) {
        console.error("Local fetch failed, trying service directly...");
    }
}
run();

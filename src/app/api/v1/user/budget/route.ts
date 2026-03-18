import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { campaign_id, amount, signature, signer_wallet } = body;

        if (!campaign_id || amount === undefined || amount <= 0 || !signature || !signer_wallet) {
            return NextResponse.json({ error: 'Invalid or missing parameters (campaign_id, amount, signature)' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature
        try {
            const expectedMessage = `Sign to add $${amount} to campaign ${campaign_id}`;
            const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
            if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                throw new Error("Signature mismatch");
            }
        } catch (authErr) {
            console.error('[Security] Budget Addition SIWE Failed:', authErr);
            return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
        }

        // Fetch current campaign budget and ownership
        const { data: campaign, error: fetchErr } = await supabase
            .from('campaigns')
            .select('budget_wei, status, advertiser_wallet')
            .eq('id', campaign_id)
            .single();

        if (fetchErr || !campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        // 2. Authorize that the signer actually owns this campaign before inflating budget
        if (campaign.advertiser_wallet.toLowerCase() !== signer_wallet.toLowerCase()) {
            console.warn(`[Security] Wallet ${signer_wallet} tried to inflate budget for campaign owned by ${campaign.advertiser_wallet}`);
            return NextResponse.json({ error: 'Unauthorized. You do not own this campaign.' }, { status: 403 });
        }

        // Add amount to budget_wei (amount is in USD string, we convert using ethers parsing equivalent)
        // Assume amount is passed as a normal number formatted as USDC (18 decimals for our mock)
        const amountWei = ethers.parseUnits(amount.toString(), 18);
        const currentBudgetWei = BigInt(String(campaign.budget_wei || '0').split('.')[0]);
        const newBudgetWei = currentBudgetWei + amountWei;

        const updatePayload: any = { budget_wei: newBudgetWei.toString() };
        
        // Auto resume if it was paused
        if (campaign.status === 'paused' || campaign.status === 'completed') {
            updatePayload.status = 'active';
        }

        const { error: updateErr } = await supabase
            .from('campaigns')
            .update(updatePayload)
            .eq('id', campaign_id);

        if (updateErr) {
            console.error('Failed to update campaign budget:', updateErr);
            return NextResponse.json({ error: 'Failed to update campaign budget in DB' }, { status: 500 });
        }

        return NextResponse.json(
            { success: true },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Add Budget API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

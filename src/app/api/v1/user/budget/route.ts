import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { campaign_id, amount, signature, txHash, signer_wallet } = body;

        if (!campaign_id || amount === undefined || amount <= 0 || !signature || !txHash || !signer_wallet) {
            return NextResponse.json({ error: 'Invalid or missing parameters (campaign_id, amount, signature, txHash)' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (!String(signer_wallet).toLowerCase().startsWith('0x')) {
            const { nonce } = body;
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF Cryptographic authentication missing nonce.' }, { status: 401 });
            try {
                const result = await appClient.verifySignInMessage({
                    message: body.message,
                    signature: signature as `0x${string}`,
                    domain: (body.message.match(/(.+) wants you to sign in/) || [])[1] || 'openads-backend.vercel.app',
                    nonce: nonce,
                });
                if (!result.success || result.fid.toString() !== signer_wallet) {
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
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
        }

        // 2. Double-Spend Replay Attack Protection (Idempotency Ledger)
        const { data: existingTx } = await supabase
            .from('vouchers')
            .select('code')
            .eq('code', txHash)
            .single();

        if (existingTx) {
            console.error(`[Security] Replay Attack Blocked! txHash ${txHash} was already consumed.`);
            return NextResponse.json({ error: 'Transaction has already been used. Double-Spend Blocked.' }, { status: 403 });
        }

        // 3. Verify On-Chain Transaction & MATHEMATICALLY EXTRACT USDC TRANSFER VALUE
        let amountWeiFromBlockchain = BigInt(0);
        try {
            const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
            const receipt = await provider.getTransactionReceipt(txHash);

            if (!receipt || receipt.status !== 1) {
                return NextResponse.json({ error: 'Web3 Transaction failed or not found on Base mainnet.' }, { status: 400 });
            }
            
            // CRITICAL SECURITY UPGRADE: ERC-4337 Smart Wallet Compatibility
            // Avoid EOA exact-match rejections. Authenticate funds directly through the smart contract logs.
            const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
            const VAULT_ADDRESS = '0xA16459A0282641CeA91B67459F0bAE2B5456B15F'.toLowerCase();
            const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

            for (const log of receipt.logs) {
                if (log.address.toLowerCase() === USDC_ADDRESS && log.topics[0] === TRANSFER_TOPIC) {
                    const fromAddressPadded = log.topics[1];
                    const toAddressPadded = log.topics[2];
                    
                    // ANTI-SPOOFING: Assert the USDC transfer originated out of the authenticated SIWE wallet
                    const isFromSigner = fromAddressPadded && fromAddressPadded.toLowerCase().endsWith(signer_wallet.toLowerCase().substring(2));

                    if (toAddressPadded && toAddressPadded.toLowerCase().endsWith(VAULT_ADDRESS.substring(2)) && isFromSigner) {
                        // Found the transfer to the OpenAdsVault! Decode the real amount.
                        amountWeiFromBlockchain = BigInt(log.data);
                        break;
                    }
                }
            }

            if (amountWeiFromBlockchain <= BigInt(0)) {
                return NextResponse.json({ error: 'No valid USDC transfer originating from your wallet was found in this transaction. (Spoofing Blocked)' }, { status: 400 });
            }
        } catch (rpcErr) {
            console.error('[Security] RPC TxHash Verification Failed:', rpcErr);
            return NextResponse.json({ error: 'Failed to verify blockchain transaction.' }, { status: 500 });
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

        // 4. Authorize that the signer actually owns this campaign before inflating budget
        const authWallet = campaign.advertiser_wallet.toLowerCase();
        const signerLower = signer_wallet.toLowerCase();

        // Security: Support legacy standalone string AND dual-identity pipe formats (`|0x...|Hunt16z|`)
        // The pipe wrappers `|signerLower|` completely eliminate partial-match IDOR vulnerabilities.
        if (authWallet !== signerLower && !authWallet.includes(`|${signerLower}|`)) {
            console.warn(`[Security] Wallet ${signer_wallet} tried to inflate budget for campaign owned by ${campaign.advertiser_wallet}`);
            return NextResponse.json({ error: 'Unauthorized. You do not own this campaign.' }, { status: 403 });
        }

        // Lock the txHash as CONSUMED in the ledger (Atomic Protection)
        const { error: insertError } = await supabase.from('vouchers').insert([{
            code: txHash,
            amount: Number(ethers.formatUnits(amountWeiFromBlockchain, 6)),
            is_used: true,
            used_by_wallet: signer_wallet
        }]);
        
        if (insertError) {
             console.error(`[Security] Race condition blocked! txHash ${txHash} was already consumed by a parallel thread.`);
             return NextResponse.json({ error: 'Transaction has already been used. Double-Spend Blocked.' }, { status: 403 });
        }

        // Add dynamically extracted mathematical amount to budget_wei
        const currentBudgetWei = BigInt(String(campaign.budget_wei || '0').split('.')[0]);
        const newBudgetWei = currentBudgetWei + amountWeiFromBlockchain;

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

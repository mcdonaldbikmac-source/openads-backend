import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { txHash, wallet, claimType = 'ad' } = body;

        if (!txHash || !wallet) {
            return NextResponse.json({ error: 'Missing txHash or wallet parameter' }, { status: 400 });
        }

        // 1. Double-Spend / Replay Attack Protection
        const { data: existingTx } = await supabase
            .from('vouchers')
            .select('code')
            .eq('code', txHash)
            .single();

        if (existingTx) {
            console.error(`[Security] Replay Attack Blocked! txHash ${txHash} was already verified.`);
            return NextResponse.json({ error: 'Transaction has already been verified.' }, { status: 403 });
        }

        // 2. Verify On-Chain Transaction & MATHEMATICALLY EXTRACT USDC TRANSFER VALUE
        let amountWeiFromBlockchain = BigInt(0);
        try {
            const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
            const receipt = await provider.getTransactionReceipt(txHash);

            if (!receipt || receipt.status !== 1) {
                return NextResponse.json({ error: 'Web3 Transaction failed or not found on Base mainnet.' }, { status: 400 });
            }
            
            const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
            const VAULT_ADDRESS = '0xA16459A0282641CeA91B67459F0bAE2B5456B15F'.toLowerCase();
            const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

            for (const log of receipt.logs) {
                // Ensure it's a USDC transfer
                if (log.address.toLowerCase() === USDC_ADDRESS && log.topics[0] === TRANSFER_TOPIC) {
                    const fromAddressPadded = log.topics[1];
                    const toAddressPadded = log.topics[2];
                    
                    // Verify the funds came directly out of the OpenAds Vault Smart Contract
                    const isFromVault = fromAddressPadded && fromAddressPadded.toLowerCase().endsWith(VAULT_ADDRESS.substring(2));
                    
                    // Verify the funds went explicitly to the Publisher Wallet requesting the confirmation
                    const isToPublisher = toAddressPadded && toAddressPadded.toLowerCase().endsWith(wallet.toLowerCase().substring(2));

                    if (isFromVault && isToPublisher) {
                        amountWeiFromBlockchain = BigInt(log.data);
                        break;
                    }
                }
            }

            if (amountWeiFromBlockchain <= BigInt(0)) {
                return NextResponse.json({ error: 'No valid USDC claim transfer from the Vault to your wallet was found in this transaction.' }, { status: 400 });
            }
        } catch (rpcErr) {
            console.error('[Security] RPC TxHash Verification Failed:', rpcErr);
            return NextResponse.json({ error: 'Failed to verify blockchain transaction.' }, { status: 500 });
        }

        // 3. Atomically lock the txHash as CONSUMED in the ledger (Atomic Protection)
        let trackingCampaignId = null;
        if (claimType === 'syndicate') {
            trackingCampaignId = 'SYNDICATE';
        }

        const { error: insertError } = await supabase.from('vouchers').insert([
            { code: txHash, status: 'consumed', amount_usd: Number(ethers.formatUnits(amountWeiFromBlockchain.toString(), 6)), used_by_wallet: wallet, campaign_id: trackingCampaignId }
        ]);
        
        if (insertError) {
             console.error(`[Security] Race condition blocked! txHash ${txHash} was already consumed by a parallel thread.`);
             return NextResponse.json({ error: 'Transaction has already been processed.' }, { status: 403 });
        }

        // 4. Mathematical DB Synchronization
        // Calculate exactly what the new paid_out_wei should be to keep the DB in perfect sync with the Blockchain
        const { data: pubData, error: fetchErr } = await supabase
            .from('publishers')
            .select('paid_out_wei, total_earned_wei') // Select total_earned_wei as well
            .ilike('wallet', wallet) // Changed from .eq to .ilike
            .single();

        if (fetchErr || !pubData) {
            return NextResponse.json({ error: 'Could not fetch publisher data' }, { status: 500 });
        }

        const currentPaidOut = BigInt(pubData.paid_out_wei || '0');
        const currentTotalEarned = BigInt(pubData.total_earned_wei || '0'); // Get current total_earned_wei
        const newPaidOut = currentPaidOut + amountWeiFromBlockchain;
        const newTotalEarned = currentTotalEarned + amountWeiFromBlockchain; // Update total_earned_wei

        const { error: updateErr } = await supabase
            .from('publishers')
            .update({
                paid_out_wei: newPaidOut.toString(),
                total_earned_wei: newTotalEarned.toString() // Add total_earned_wei update
            })
            .ilike('wallet', wallet); // Changed from .eq to .ilike

        if (updateErr) {
            return NextResponse.json({ error: 'Blockchain Verification Passed, but Database Update Failed.' }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Claim cryptographically verified and Database synchronized.', 
            synced_amount: newPaidOut.toString() 
        });

    } catch (error: any) {
        console.error('Claim Verification Logic Error:', error);
        return NextResponse.json({ error: 'Internal server error processing claim verification' }, { status: 500 });
    }
}

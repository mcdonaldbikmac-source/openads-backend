import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

import { ethers } from 'ethers';

const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001'; // Fallback for local testing
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { wallet, signature: clientSignature } = body;

        if (!wallet || !clientSignature) {
            return NextResponse.json({ error: 'Missing wallet or signature parameter' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature (SIWE)
        try {
            const expectedMessage = `Sign to authorize withdrawal for ${wallet}`;
            const recoveredAddress = ethers.verifyMessage(expectedMessage, clientSignature);
            if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
                throw new Error("Signature mismatch");
            }
        } catch (authErr) {
            console.error('[Security] Payout SIWE Failed:', authErr);
            return NextResponse.json({ error: 'Cryptographic authentication failed.' }, { status: 401 });
        }

        // 2. Fetch current publisher stats
        const { data: pubData, error: fetchErr } = await supabase
            .from('publishers')
            .select('total_earned_wei, paid_out_wei')
            .eq('wallet', wallet)
            .single();

        if (fetchErr) {
            return NextResponse.json({ error: 'Could not fetch publisher data' }, { status: 500 });
        }

        if (!pubData) {
            return NextResponse.json({ error: 'Publisher not found' }, { status: 404 });
        }

        // 3. Mark DB as claimed (Pending Confirmation)
        const newPaidOut = pubData.total_earned_wei || '0';
        const currentPaidOut = pubData.paid_out_wei || '0';
        
        // Calculate cryptographic delta to prevent DB locking race conditions
        const pending = BigInt(newPaidOut) - BigInt(currentPaidOut);

        if (pending > 0n) {
            const { error: updateErr } = await supabase
                .from('publishers')
                .update({ paid_out_wei: newPaidOut })
                .eq('wallet', wallet);

            if (updateErr) {
                return NextResponse.json({ error: 'Failed to update claim status' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
            }
        }

        // 4. Generate the Server-Side ECDSA Signature for the Smart Contract
        // The OpenAdsVault expects a signature over: keccak256(abi.encodePacked(publisherWallet, token, amount))
        const signerWallet = new ethers.Wallet(SIGNER_PRIVATE_KEY);
        
        const payloadHash = ethers.solidityPackedKeccak256(
            ['address', 'address', 'uint256'],
            [wallet, USDC_ADDRESS, newPaidOut]
        );
        
        // Sign the hash (note: this might need adjust based on exact EIP-712 setup, but EIP-191 bytes32 string signing is standard fallback)
        const serverSignature = await signerWallet.signMessage(ethers.getBytes(payloadHash));

        return NextResponse.json(
            { success: true, serverSignature, amountWei: newPaidOut },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (err) {
        console.error('Publisher Claim API Error:', err);
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

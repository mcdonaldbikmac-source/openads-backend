import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY || '';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        /* 
         * wallet: The immortal Database Identifier (e.g. FID '1550542' or '0x...')
         * payoutAddress: The EVM 0x Address where the Smart Contract will deposit the USDC
         */
        const { wallet, signature: clientSignature, claimType = 'ad', payoutAddress } = body;

        // Fallback to strictly matching the wallet if the explicit payoutAddress is not provided by older client models
        const destinationAddress = payoutAddress || wallet;

        if (!wallet || !clientSignature || !destinationAddress) {
            return NextResponse.json({ error: 'Missing wallet, payoutAddress, or signature parameter' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (!String(wallet).toLowerCase().startsWith('0x')) {
            const { nonce } = body;
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF Cryptographic authentication missing nonce.' }, { status: 401 });
            try {
                const result = await appClient.verifySignInMessage({
                    message: body.message,
                    signature: clientSignature as `0x${string}`,
                    domain: (body.message.match(/(.+) wants you to sign in/) || [])[1] || 'openads-backend.vercel.app',
                    nonce: nonce,
                });
                if (!result.success || result.fid.toString() !== wallet) {
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }

                // SECURITY HARDENING: Recover the exact Ethereum Custody Address used to sign the native SIWF token
                const recoveredCustodyAddress = ethers.verifyMessage(message, clientSignature);
                
                // CRITICAL VULNERABILITY PATCH: We MUST forcefully constrain the requested payout destination to the physical SIWF Signer to prevent XSS Parameter Forging (Hackers stealing the token to redirect funds)
                if (recoveredCustodyAddress.toLowerCase() !== destinationAddress.toLowerCase()) {
                    console.error(`[Security Critical] SIWF Parameter Forging Attack Blocked! Attempted redirect to ${destinationAddress} from SIWF owner ${recoveredCustodyAddress}`);
                    return NextResponse.json({ error: 'Payout Address spoofing detected. The requested payout destination does not mathematically match the intrinsic SIWF authorization signature.' }, { status: 403 });
                }

            } catch (err) {
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            try {
                const expectedMessage = `Sign to authorize withdrawal for ${destinationAddress}`;
                let recoveredAddress;
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, clientSignature);
                if (recoveredAddress.toLowerCase() !== destinationAddress.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] Payout SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed.' }, { status: 401 });
            }
        }

        // 2. Fetch current publisher stats
        const { data: pubData, error: fetchErr } = await supabase
            .from('publishers')
            .select('total_earned_wei, paid_out_wei, syndicate_earned_wei')
            .ilike('wallet', wallet)
            .single();

        if (fetchErr) {
            return NextResponse.json({ error: 'Could not fetch publisher data' }, { status: 500 });
        }

        if (!pubData) {
            return NextResponse.json({ error: 'Publisher not found' }, { status: 404 });
        }

        // 3. Reconstruct disjoint accounting using Vouchers as proxy ledger
        const { data: syndPayouts } = await supabase
            .from('vouchers')
            .select('amount_usd')
            .ilike('used_by_wallet', wallet)
            .eq('campaign_id', 'SYNDICATE')
            .eq('status', 'consumed');

        let syndicatePaidOutWei = BigInt(0);
        if (syndPayouts) {
            for (let v of syndPayouts) {
                syndicatePaidOutWei += BigInt(Math.round(v.amount_usd * 1000000));
            }
        }

        const totalEarnedStr = String(pubData.total_earned_wei || '0').split('.')[0];
        const syndEarnedStr = String(pubData.syndicate_earned_wei || '0').split('.')[0];
        const paidOutStr = String(pubData.paid_out_wei || '0').split('.')[0];

        const totalEarnedWei = BigInt(totalEarnedStr);
        const syndicateEarnedWei = BigInt(syndEarnedStr);
        const totalPaidOutWei = BigInt(paidOutStr);

        const adEarnedWei = totalEarnedWei - syndicateEarnedWei;
        const adPaidOutWei = totalPaidOutWei - syndicatePaidOutWei;

        const pendingAdWei = adEarnedWei - adPaidOutWei;
        const pendingSyndWei = syndicateEarnedWei - syndicatePaidOutWei;

        let pendingToClaim = BigInt(0);
        if (claimType === 'syndicate') {
            pendingToClaim = pendingSyndWei;
        } else {
            pendingToClaim = pendingAdWei;
        }

        if (pendingToClaim <= BigInt(0)) {
            return NextResponse.json({ error: 'No pending earnings to claim for this specific channel.' }, { status: 400 });
        }
        
        // Only increment the Smart Contract state exactly by the selected disjoint tranche
        const newPaidOut = (totalPaidOutWei + pendingToClaim).toString();

        // SECURITY NOTE: The database `paid_out_wei` lock has been removed from this stage.
        // It will be exclusively updated post-transaction by reading the on-chain RPC logs, 
        // completely neutralizing the UX failure loop where failed transactions freeze pending balances.

        // 4. Generate the Server-Side ECDSA Signature for the Smart Contract
        // The OpenAdsVault expects a signature over: keccak256(abi.encodePacked(publisherWallet, token, amount))
        const signerWallet = new ethers.Wallet(SIGNER_PRIVATE_KEY);
        
        const payloadHash = ethers.solidityPackedKeccak256(
            ['address', 'address', 'uint256'],
            [destinationAddress, USDC_ADDRESS, newPaidOut]
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

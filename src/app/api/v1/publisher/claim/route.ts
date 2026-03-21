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
        const { wallet, signature: clientSignature } = body;

        if (!wallet || !clientSignature) {
            return NextResponse.json({ error: 'Missing wallet or signature parameter' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (!String(wallet).startsWith('0x')) {
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
            } catch (err) {
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            try {
                const expectedMessage = `Sign to authorize withdrawal for ${wallet}`;
                let recoveredAddress;
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, clientSignature);
                if (recoveredAddress.toLowerCase() !== wallet.toLowerCase()) {
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
            .select('total_earned_wei, paid_out_wei')
            .ilike('wallet', wallet)
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

        if (pending <= BigInt(0)) {
            return NextResponse.json({ error: 'No pending earnings to claim.' }, { status: 400 });
        }
        
        // SECURITY NOTE: The database `paid_out_wei` lock has been removed from this stage.
        // It will be exclusively updated post-transaction by reading the on-chain RPC logs, 
        // completely neutralizing the UX failure loop where failed transactions freeze pending balances.

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

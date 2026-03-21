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
        const { advertiser, headline, cta, image, url, size, budget, cpm, voucherCode } = body;

        // Basic validation
        if (!advertiser || !headline || !image || !url || !size || !budget || !cpm) {
            return NextResponse.json({ error: 'Missing required ad fields' }, { status: 400 });
        }

        // SECURITY UPGRADE: Strict Platform Dimension Geometry Whitelist
        const allowedSizes = ['64x64', '300x250', '320x50', '300x50', '320x100'];
        if (!allowedSizes.includes(size)) {
            console.warn(`[Security] Blocked unauthorized ad dimension payload attempted by ${advertiser}: ${size}`);
            return NextResponse.json({ error: `Invalid ad dimension. Must be one of: ${allowedSizes.join(', ')}` }, { status: 400 });
        }

        // XSS & Security Validation for the Destination URL
        try {
            const parsedUrl = new URL(url);
            const scheme = parsedUrl.protocol.toLowerCase();
            if (['javascript:', 'vbscript:', 'data:', 'file:'].includes(scheme)) {
                console.warn(`[Security] Blocked malicious URL scheme attempted by ${advertiser}: ${url}`);
                return NextResponse.json({ error: 'Malicious URL scheme provided' }, { status: 400 });
            }
        } catch (e) {
            return NextResponse.json({ error: 'Invalid URL format provided' }, { status: 400 });
        }

        const { signature, txHash, signer_wallet } = body;

        if (!signature || !signer_wallet) {
            return NextResponse.json({ error: 'Missing EIP-191 signature authentication to create an ad.' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature (MetaMask) or SIWF (Farcaster)
        if (!String(signer_wallet).startsWith('0x')) {
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
                if (signer_wallet.toLowerCase() !== advertiser.toLowerCase()) {
                    console.warn(`[Security] SIWF IDOR attempt! Wallet ${signer_wallet} tried to create ad claiming to be ${advertiser}`);
                    return NextResponse.json({ error: 'Unauthorized to act as this advertiser.' }, { status: 403 });
                }
            } catch (err) {
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            try {
                // SECURITY UPGRADE: Cryptographic Payload Binding. The Signature absolutely must contain the TxHash 
                // to permanently block Mempool Front-Running and Replay Attacks.
                const expectedMessage = `Sign to authorize Campaign Creation.\nTxHash: ${txHash}`;
                let recoveredAddress;
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
                
                if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
                if (signer_wallet.toLowerCase() !== advertiser.toLowerCase()) {
                    console.warn(`[Security] IDOR attempt! Wallet ${signer_wallet} tried to create ad claiming to be ${advertiser}`);
                    return NextResponse.json({ error: 'Unauthorized to act as this advertiser.' }, { status: 403 });
                }
            } catch (authErr) {
                console.error('[Security] Campaign Creation SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
            }
        }

        // 2. On-Chain Deposit Verification
        let validatedBudget = Number(budget);
        
        // NO VOUCHER ALLOWED: MUST Verify On-Chain Transaction & MATHEMATICALLY EXTRACT USDC TRANSFER VALUE
        if (!txHash) {
            return NextResponse.json({ error: 'Missing txHash. You must deposit USDC to the OpenAdsVault to create a campaign.' }, { status: 400 });
        }

        // Double-Spend Replay Attack Protection (Idempotency Ledger)
            const { data: existingTx } = await supabase
                .from('vouchers')
                .select('code')
                .eq('code', txHash)
                .single();

            if (existingTx) {
                console.error(`[Security] Replay Attack Blocked! txHash ${txHash} was already consumed.`);
                return NextResponse.json({ error: 'Transaction has already been used. Double-Spend Blocked.' }, { status: 403 });
            }

            try {
                const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
                const receipt = await provider.getTransactionReceipt(txHash);

                if (!receipt || receipt.status !== 1) {
                    return NextResponse.json({ error: 'Web3 Transaction failed or not found on Base mainnet.' }, { status: 400 });
                }
                
                // CRITICAL SECURITY UPGRADE: ERC-4337 Smart Wallet Compatibility
                // We cannot use `receipt.from === signer_wallet` because Coinbase Smart Wallets execute 
                // via Bundler EOAs. Instead, we authenticate the funds natively inside the ERC20 log sequence.
                let amountWeiFromBlockchain = BigInt(0);
                const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
                const VAULT_ADDRESS = '0xA16459A0282641CeA91B67459F0bAE2B5456B15F'.toLowerCase();
                const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

                for (const log of receipt.logs) {
                    if (log.address.toLowerCase() === USDC_ADDRESS && log.topics[0] === TRANSFER_TOPIC) {
                        const fromAddressPadded = log.topics[1]; 
                        const toAddressPadded = log.topics[2];
                        
                        // ANTI-SPOOFING: Prove the USDC originated strictly from the signed wallet
                        const isFromSigner = fromAddressPadded && fromAddressPadded.toLowerCase().endsWith(signer_wallet.toLowerCase().substring(2));

                        if (toAddressPadded && toAddressPadded.toLowerCase().endsWith(VAULT_ADDRESS.substring(2)) && isFromSigner) {
                            amountWeiFromBlockchain = BigInt(log.data);
                            break;
                        }
                    }
                }

                if (amountWeiFromBlockchain <= BigInt(0)) {
                    return NextResponse.json({ error: 'No valid USDC transfer originating from your wallet was found in this transaction. (Spoofing Blocked)' }, { status: 400 });
                }

                validatedBudget = Number(ethers.formatUnits(amountWeiFromBlockchain, 6));

                // Lock the txHash as CONSUMED in the ledger (Atomic Protection)
                const { error: insertError } = await supabase.from('vouchers').insert([{
                    code: txHash,
                    amount: validatedBudget,
                    is_used: true,
                    used_by_wallet: signer_wallet
                }]);
                
                if (insertError) {
                     console.error(`[Security] Race condition blocked! txHash ${txHash} was just consumed by a parallel thread.`);
                     return NextResponse.json({ error: 'Transaction has already been used. Double-Spend Blocked.' }, { status: 403 });
                }

            } catch (rpcErr) {
                console.error('[Security] RPC TxHash Verification Failed in Campaign Create:', rpcErr);
                return NextResponse.json({ error: 'Failed to verify blockchain transaction.' }, { status: 500 });
            }

        let uploadedImageUrl = image;
        
        try {
            const parsedImages = JSON.parse(image);
            const formats = Object.keys(parsedImages);
            const finalUrls: Record<string, string> = {};

            if (formats.length > 0) {
                // Multi-Format Matrix Upload Protocol
                for (const format of formats) {
                    const base64ImageToUpload = parsedImages[format];
                    if (base64ImageToUpload && base64ImageToUpload.startsWith('data:image')) {
                        const matches = base64ImageToUpload.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
                        if (!matches || matches.length !== 3) continue;

                        const mimeType = matches[1];
                        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                        if (!allowedMimeTypes.includes(mimeType.toLowerCase())) continue;

                        const base64Data = matches[2];
                        const buffer = Buffer.from(base64Data, 'base64');
                        const ext = mimeType.split('/')[1] || 'jpg';
                        const fileName = `${advertiser.substring(0, 10)}_${format}_${Date.now()}.${ext}`;

                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from('ads')
                            .upload(fileName, buffer, { contentType: mimeType, upsert: false });

                        if (!uploadError) {
                            const { data: { publicUrl } } = supabase.storage.from('ads').getPublicUrl(fileName);
                            finalUrls[format] = publicUrl;
                        }
                    }
                }
                
                // If any successful uploads occurred, overwrite the raw JSON string with the final CDN map
                if (Object.keys(finalUrls).length > 0) {
                    uploadedImageUrl = JSON.stringify(finalUrls);
                }
            }
        } catch (e) {
            // Legacy Backwards Compatibility: Payload is a raw URL or single Base64 string, inherently bypass URL mapping matrix.
        }

        // 2. Format financial data
        // We use the cryptographically validated budget extracted directly from the Base blockchain,
        // completely ignoring the frontend's JSON `budget` request field to prevent Value Forgery.
        const budgetWei = ethers.parseUnits(validatedBudget.toString(), 6).toString();
        const cpmWei = ethers.parseUnits(cpm.toString(), 6).toString();

        // 3. Save Ad Campaign to Supabase PostgreSQL Database
        const { data: dbData, error: dbError } = await supabase
            .from('campaigns')
            .insert([
                {
                    advertiser_wallet: advertiser,
                    creative_title: headline,
                    creative_url: url,
                    image_url: uploadedImageUrl,
                    ad_type: size,
                    ad_position: 'top', // Default
                    budget_wei: budgetWei,
                    cpm_rate_wei: cpmWei,
                    status: 'active'
                }
            ])
            .select()
            .single();

        if (dbError) {
            console.error('Supabase Database Error:', dbError);
            return NextResponse.json({ error: 'Failed to save campaign to database' }, { status: 500 });
        }

        return NextResponse.json(
            { success: true, ad: dbData },
            {
                status: 201,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                },
            }
        );
    } catch (error) {
        console.error('API Error Wrapper:', error);
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

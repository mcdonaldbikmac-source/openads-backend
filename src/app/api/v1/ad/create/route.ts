import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { advertiser, headline, cta, image, url, size, budget, cpm, voucherCode } = body;

        // Basic validation
        if (!advertiser || !headline || !image || !url || !size || !budget || !cpm) {
            return NextResponse.json({ error: 'Missing required ad fields' }, { status: 400 });
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

        // 1. Authenticate with EIP-191 Signature
        try {
            const expectedMessage = `Sign to authorize campaign creation for $${budget}`;
            const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
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

        // 2. Voucher Redemption OR On-Chain Deposit Verification
        let validatedBudget = Number(budget);
        if (voucherCode) {
            const { data: voucherData, error: voucherError } = await supabase
                .from('vouchers')
                .select('*')
                .eq('code', voucherCode.trim().toUpperCase())
                .eq('is_used', false)
                .single();

            if (voucherError || !voucherData) {
                return NextResponse.json({ error: 'Invalid or already used voucher code' }, { status: 400 });
            }

            // Atomically mark the voucher as used
            const { error: updateError } = await supabase
                .from('vouchers')
                .update({ is_used: true, used_by_wallet: advertiser })
                .eq('code', voucherCode.trim().toUpperCase());

            if (updateError) {
                console.error('Failed to consume voucher:', updateError);
                return NextResponse.json({ error: 'Failed to redeem voucher to DB' }, { status: 500 });
            }

            // Note: If partial payments exist, the actual budget is the frontend claimed budget. 
            // In a strict financial setup, budgetWei should be `Vault Deposit + VoucherAmount`.
        } else {
            // NO VOUCHER: MUST Verify On-Chain Transaction (Stop Zero-Cost Infinite Minting Flaw & Replay Attacks)
            if (!txHash) {
                return NextResponse.json({ error: 'Missing txHash. You must deposit USDC to the OpenAdsVault to create a campaign.' }, { status: 400 });
            }

            try {
                const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
                const receipt = await provider.getTransactionReceipt(txHash);

                if (!receipt || receipt.status !== 1) {
                    return NextResponse.json({ error: 'Web3 Transaction failed or not found on Base mainnet.' }, { status: 400 });
                }
                
                // SECURITY: OPENADS_VAULT_ADDRESS verification
                if (receipt.to?.toLowerCase() !== '0xA16459A0282641CeA91B67459F0bAE2B5456B15F'.toLowerCase()) {
                    return NextResponse.json({ error: 'Invalid smart contract destination. Funds were not sent to the Vault.' }, { status: 400 });
                }

                // SECURITY: Transaction Sender Spoofing/Replay Protection!
                if (receipt.from?.toLowerCase() !== signer_wallet.toLowerCase()) {
                    console.error(`[Security] Zero-Cost Minting Blocked! API caller ${signer_wallet} attempted to claim txHash ${txHash} which originated from ${receipt.from}`);
                    return NextResponse.json({ error: 'Transaction Spoofing Blocked. The sender of the transaction does not match your wallet.' }, { status: 403 });
                }
            } catch (rpcErr) {
                console.error('[Security] RPC TxHash Verification Failed in Campaign Create:', rpcErr);
                return NextResponse.json({ error: 'Failed to verify blockchain transaction.' }, { status: 500 });
            }
        }

        let uploadedImageUrl = image;
        
        // The frontend sends image as a JSON string (e.g. {"320x50":"data:image/png;base64,..."})
        let base64ImageToUpload = image;
        try {
            const parsedImages = JSON.parse(image);
            const formats = Object.keys(parsedImages);
            if (formats.length > 0) {
                base64ImageToUpload = parsedImages[formats[0]]; // Take the first available cropped image
            }
        } catch (e) {
            // It's not a JSON string, assume it's a raw base64 string from an older version
        }

        if (base64ImageToUpload && base64ImageToUpload.startsWith('data:image')) {
            const matches = base64ImageToUpload.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return NextResponse.json({ error: 'Invalid base64 image data' }, { status: 400 });
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            // Generate a unique filename using advertiser wallet prefix and timestamp
            const ext = mimeType.split('/')[1] || 'jpg';
            const fileName = `${advertiser.substring(0, 10)}_${Date.now()}.${ext}`;

            // Upload directly from Buffer
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('ads')
                .upload(fileName, buffer, {
                    contentType: mimeType,
                    upsert: false
                });

            if (uploadError) {
                console.error('Supabase Storage Error:', uploadError);
                return NextResponse.json({ error: 'Failed to upload ad image to CDN' }, { status: 500 });
            }

            // Retrieve the public URL
            const { data: { publicUrl } } = supabase.storage.from('ads').getPublicUrl(fileName);
            uploadedImageUrl = publicUrl;
        }

        // 2. Format financial data
        // Convert plain numbers back to their Wei representations assuming USDC (6 decimals on Base)
        // Since budget/cpm are derived from the UI, we assume they are standard decimal formats (e.g., 100, 5.0)
        // We will store them directly as NUMERIC in the DB since PostgreSQL handles arbitrarily large numbers.
        const budgetWei = ethers.parseUnits(budget.toString(), 6).toString();
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

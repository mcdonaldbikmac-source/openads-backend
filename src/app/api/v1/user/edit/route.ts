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
        const { campaign_id, url, image, title, signature, signer_wallet } = body;

        if (!campaign_id || !url || !image || !title || !signature || !signer_wallet) {
            return NextResponse.json({ error: 'Missing required parameters including signature for authentication' }, { status: 400 });
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
                const expectedMessage = `Sign to edit campaign ${campaign_id}`;
                let recoveredAddress;
                // STRICT SECURITY: Forcibly enforce the `expectedMessage` to permanently block Cross-Endpoint Signature Replay attacks.
                recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

                if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] Edit Campaign SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
            }
        }

        // 2. Authorize that the signer actually owns this campaign
        const { data: campaignAuth, error: authVerifyErr } = await supabase
            .from('campaigns')
            .select('advertiser_wallet')
            .eq('id', campaign_id)
            .single();

        if (authVerifyErr || !campaignAuth) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const authWallet = campaignAuth.advertiser_wallet.toLowerCase();
        const signerLower = signer_wallet.toLowerCase();
        const { address, custody } = body;
        const addrLower = address ? address.toLowerCase() : null;
        const custLower = custody ? custody.toLowerCase() : null;

        let authorized = false;
        // Security: Support legacy standalone string AND dual-identity pipe formats (`|0x...|Hunt16z|`)
        // The pipe wrappers `|signerLower|` completely eliminate partial-match IDOR vulnerabilities.
        if (authWallet === signerLower || authWallet.includes(`|${signerLower}|`)) authorized = true;
        if (!authorized && addrLower && (authWallet === addrLower || authWallet.includes(`|${addrLower}|`))) authorized = true;
        if (!authorized && custLower && (authWallet === custLower || authWallet.includes(`|${custLower}|`))) authorized = true;

        if (!authorized) {
            console.warn(`[Security] IDOR attempt blocked! Wallet ${signer_wallet} tried to edit campaign owned by ${campaignAuth.advertiser_wallet}`);
            return NextResponse.json({ error: 'Unauthorized. You do not own this campaign.' }, { status: 403 });
        }

        let uploadedImageUrl = image;

        if (image && image.startsWith('data:image')) {
            const matches = image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                return NextResponse.json({ error: 'Invalid base64 image data' }, { status: 400 });
            }

            const mimeType = matches[1];
            // STORED XSS MITIGATION: Strictly whitelist allowed image MIME types. Block SVG, HTML, etc.
            const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
                console.warn(`[Security] Blocked malicious CDN MIME type upload attempt: ${mimeType}`);
                return NextResponse.json({ error: 'Invalid image format. Only JPG, PNG, GIF, and WEBP are allowed.' }, { status: 400 });
            }

            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            // Generate a unique filename using campaign id prefix and timestamp
            const ext = mimeType.split('/')[1] || 'jpg';
            const fileName = `edit_${campaign_id}_${Date.now()}.${ext}`;

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

        const { error } = await supabase
            .from('campaigns')
            .update({ creative_title: title, creative_url: url, image_url: uploadedImageUrl })
            .eq('id', campaign_id);

        if (error) {
            console.error('Failed to update campaign:', error);
            return NextResponse.json({ error: 'Failed to update campaign in DB' }, { status: 500 });
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
        console.error('Edit Campaign API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

import { ethers } from 'ethers';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { campaign_id, url, image, title, signature, signer_wallet } = body;

        if (!campaign_id || !url || !image || !title || !signature || !signer_wallet) {
            return NextResponse.json({ error: 'Missing required parameters including signature for authentication' }, { status: 400 });
        }

        // 1. Authenticate with EIP-191 Signature
        try {
            const expectedMessage = `Sign to edit campaign ${campaign_id}`;
            const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
            if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                throw new Error("Signature mismatch");
            }
        } catch (authErr) {
            console.error('[Security] Edit Campaign SIWE Failed:', authErr);
            return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
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

        if (campaignAuth.advertiser_wallet.toLowerCase() !== signer_wallet.toLowerCase()) {
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

import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { campaign_id, url, image } = body;

        if (!campaign_id || !url || !image) {
            return NextResponse.json({ error: 'Missing required parameters (campaign_id, url, image)' }, { status: 400 });
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
            .update({ creative_url: url, image_url: uploadedImageUrl })
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

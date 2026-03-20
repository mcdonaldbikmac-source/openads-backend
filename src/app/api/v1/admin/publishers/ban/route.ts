import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function DELETE(req: Request) {
    try {
        const body = await req.json();
        const { app_id } = body;

        if (!app_id) {
            return NextResponse.json({ error: 'Missing logic parameters (app_id)' }, { status: 400 });
        }

        // Preemptively cascade delete all relational telemetry logic (Foreign Key Safeguard)
        const { error: cascadeError } = await supabase
            .from('tracking_events')
            .delete()
            .eq('app_id', app_id);
            
        // Mutate the app into a permanently locked BANNED state
        const { error: deleteError } = await supabase
            .from('apps')
            .update({ app_type: 'banned', logo_url: 'banned' })
            .eq('id', app_id);

        if (deleteError) {
            console.error('[Admin API] Failed to delete app:', deleteError);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });

    } catch (e: any) {
        console.error('[Admin API] Exception:', e);
        return NextResponse.json({ error: e.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

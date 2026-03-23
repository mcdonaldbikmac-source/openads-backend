import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { verifyAdminAuth } from '../../auth';

export async function DELETE(req: Request) {
    try {
        await verifyAdminAuth(req);

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
        const status = e.message === 'Forbidden' ? 403 : (e.message === 'Unauthorized' ? 401 : 500);
        return NextResponse.json({ error: e.message || 'Error executing ban' }, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}


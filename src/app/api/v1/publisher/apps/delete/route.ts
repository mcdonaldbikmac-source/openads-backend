import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { appId, authStr } = body;

        if (!appId || !authStr) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const auth = typeof authStr === 'string' ? JSON.parse(authStr) : authStr;
        const publisherWallet = auth.address || auth.fid;

        if (!publisherWallet) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        // Verify ownership before deleting
        const { data: appData, error: verifyError } = await supabase
            .from('apps')
            .select('publisher')
            .eq('id', appId)
            .single();

        if (verifyError || !appData) {
            return NextResponse.json({ error: 'App not found' }, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        if (appData.publisher.toLowerCase() !== publisherWallet.toLowerCase() && appData.publisher !== publisherWallet.toString()) {
            return NextResponse.json({ error: 'Unauthorized to delete this app' }, { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const { error: deleteError } = await supabase
            .from('apps')
            .delete()
            .eq('id', appId);

        if (deleteError) {
            console.error('[API] Failed to delete app:', deleteError);
            return NextResponse.json({ error: 'Database error' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        return NextResponse.json({ success: true }, { headers: { 'Access-Control-Allow-Origin': '*' } });

    } catch (e: any) {
        console.error('[API] Exception:', e);
        return NextResponse.json({ error: e.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: { 'Access-Control-Allow-Origin': '*' } });
}

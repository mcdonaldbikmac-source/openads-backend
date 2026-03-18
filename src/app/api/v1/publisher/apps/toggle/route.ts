import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

// PATCH: Toggle App Pause State (without schema migrations)
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, wallet, action } = body;

        if (!id || !wallet || !action) {
            return NextResponse.json({ error: 'Missing required parameters (id, wallet, action)' }, { status: 400 });
        }
        
        if (action !== 'pause' && action !== 'resume') {
            return NextResponse.json({ error: 'Invalid action. Must be "pause" or "resume".' }, { status: 400 });
        }

        // 1. Fetch current app type to ensure we have the correct base string
        const { data: currApp, error: fetchErr } = await supabase
            .from('apps')
            .select('app_type')
            .eq('id', id)
            .eq('publisher_wallet', wallet)
            .single();

        if (fetchErr || !currApp) {
            return NextResponse.json({ error: 'App not found or unauthorized' }, { status: 404 });
        }

        let newType = currApp.app_type;

        if (action === 'pause') {
            // Apply prefix if not already paused
            if (!newType.startsWith('paused_')) {
                newType = `paused_${newType}`;
            }
        } else if (action === 'resume') {
            // Remove prefix if paused
            if (newType.startsWith('paused_')) {
                newType = newType.replace('paused_', '');
            }
        }

        // 2. Perform the actual update back to DB
        const { data, error } = await supabase
            .from('apps')
            .update({ app_type: newType })
            .eq('id', id)
            .eq('publisher_wallet', wallet)
            .select('id, name, domain, app_type')
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json(
            { success: true, app: data },
            { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
        );

    } catch (error) {
        console.error('Toggle App Status Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS, PATCH',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

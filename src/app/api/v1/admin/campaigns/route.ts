import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { verifyAdminAuth } from '../auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        await verifyAdminAuth(req);

        const { data, error } = await supabase
            .from('campaigns')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json(
            { success: true, campaigns: data || [] },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                },
            }
        );
    } catch (e: any) {
        console.error('Admin Campaigns Route Error:', e);
        const status = e.message === 'Forbidden' ? 403 : (e.message === 'Unauthorized' ? 401 : 500);
        return NextResponse.json({ error: e.message || 'Error fetching campaigns' }, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
    });
}

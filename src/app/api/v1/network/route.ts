import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('publishers')
            .select('wallet')
            .order('created_at', { ascending: false })
            .limit(10); // Limit to top 10 recent publishers for the marquee

        if (error) throw error;

        // Map to a simpler format for the landing page marquee
        const publishers = (data || []).map(pub => {
            const shortWallet = pub.wallet ? `${pub.wallet.slice(0, 6)}...${pub.wallet.slice(-4)}` : 'Unknown';
            return {
                name: `Publisher ${shortWallet}`,
                icon: 'https://cdn.worldvectorlogo.com/logos/base-2.svg' // Using Base network logo as default icon instead of globe
            };
        });

        return NextResponse.json(
            { success: true, publishers },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                },
            }
        );
    } catch (err: any) {
        console.error('Network Pub Fetch Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
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

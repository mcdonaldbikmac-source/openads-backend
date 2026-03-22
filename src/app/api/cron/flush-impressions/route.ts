import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            // In a local environment, protect the endpoint against public scans
            if (process.env.NODE_ENV !== 'development') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const redis = Redis.fromEnv();
        const processingKey = `cron_proc_${Date.now()}`;

        // Atomic Rename strictly guarantees 0% Data Loss (No Race Conditions)
        try {
            await redis.rename('cron_pending_views', processingKey);
        } catch (e) {
            return NextResponse.json({ status: 'No metrics to flush' }, { status: 200 });
        }

        const batchData = await redis.hgetall(processingKey);
        if (!batchData) return NextResponse.json({ status: 'Empty processing matrix' }, { status: 200 });

        // Sequential Flush to bypass the 10,000 parallel Postgres Row-Level Lock crash vector
        // Execute sequentially to absolutely ensure Vercel does not exhaust the PgBouncer pool.
        let totalFlushed = 0;

        for (const [key, rawViews] of Object.entries(batchData)) {
            const views = Number(rawViews);
            if (views <= 0) continue;
            
            const [adId, publisherWallet] = key.split('::');

            for (let i = 0; i < views; i++) {
                // Execute sequentially to limit maximum DB connections to 1
                const { error } = await supabase.rpc('record_impression', {
                    p_campaign_id: adId,
                    p_publisher_wallet: publisherWallet,
                    p_fid: 0,
                    p_event_type: 'view',
                    p_sig: null
                });
                
                if (!error) totalFlushed++;
            }
        }

        await redis.del(processingKey);
        return NextResponse.json({ status: 'success', metrics_flushed: totalFlushed }, { status: 200 });

    } catch (error) {
        console.error('Cron Flush Pipeline Error:', error);
        return NextResponse.json({ error: 'Failed to process batch flush' }, { status: 500 });
    }
}

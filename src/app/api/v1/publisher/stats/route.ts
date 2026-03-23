import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';
import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wallet = searchParams.get('wallet');

        if (!wallet) {
            return NextResponse.json({ error: 'Missing wallet query parameter' }, { status: 400 });
        }

        // ==========================================
        // SECURITY UPGRADE: Prevent Read IDOR via Cryptographic Bearer Verification
        // ==========================================
        const authHeader = request.headers.get('x-openads-auth');
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized: Missing authentication header.' }, { status: 401 });
        }

        let authObj;
        try {
            authObj = JSON.parse(Buffer.from(authHeader, 'base64').toString('utf-8'));
        } catch (e) {
            return NextResponse.json({ error: 'Unauthorized: Malformed authentication header.' }, { status: 401 });
        }

        const { signature, message, nonce, provider, address, fid } = authObj;
        const signer_wallet = provider === 'farcaster' ? String(fid) : (address || String(fid));

        if (!signature || !signer_wallet) {
            return NextResponse.json({ error: 'Unauthorized: Missing cryptographic signature sequence.' }, { status: 401 });
        }

        if (signer_wallet.toLowerCase() !== wallet.toLowerCase()) {
            console.warn(`[Security] Read IDOR block! ${signer_wallet} attempted to read data for ${wallet}`);
            return NextResponse.json({ error: 'Unauthorized: Token identity does not match requested wallet.' }, { status: 403 });
        }

        if (provider === 'farcaster') {
            if (!nonce) return NextResponse.json({ error: 'Farcaster SIWF missing nonce.' }, { status: 401 });
            try {
                const domainMatch = message?.match(/(.+) wants you to sign in/);
                const extractedDomain = domainMatch ? domainMatch[1] : 'openads-backend.vercel.app';

                const result = await appClient.verifySignInMessage({
                    message: message,
                    signature: signature as `0x${string}`,
                    domain: extractedDomain,
                    nonce: nonce,
                });
                if (!result.success || result.fid.toString() !== String(fid)) {
                    return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid.' }, { status: 401 });
                }
            } catch (err) {
                return NextResponse.json({ error: 'Farcaster Authentication Exception.' }, { status: 401 });
            }
        } else {
            try {
                const expectedMessage = message || 'Sign to login to OpenAds Network';
                const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
                if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                    throw new Error("Signature mismatch");
                }
            } catch (authErr) {
                console.error('[Security] Read API Web3 SIWE Failed:', authErr);
                return NextResponse.json({ error: 'Cryptographic authentication failed. Invalid signature.' }, { status: 401 });
            }
        }
        // ==========================================

        // 1. Fetch Publisher total earnings from DB
        const { data: publisherData, error: pubError } = await supabase
            .from('publishers')
            .select('total_earned_wei, paid_out_wei, syndicate_earned_wei')
            .eq('wallet', wallet)
            .single();

        let totalEarnedWei = BigInt(0);
        let paidOutWei = BigInt(0);
        let syndicateEarnedWei = BigInt(0);

        if (publisherData) {
            // Supabase returns NUMERIC types as numbers or strings with decimals (e.g. 450000000.00000)
            // BigInt() throws an error or fails if there is a decimal point, so we must truncate/round it first.
            const earnedStr = String(publisherData.total_earned_wei || '0').split('.')[0];
            const paidStr = String(publisherData.paid_out_wei || '0').split('.')[0];
            const syndStr = String(publisherData.syndicate_earned_wei || '0').split('.')[0];

            totalEarnedWei = BigInt(earnedStr);
            paidOutWei = BigInt(paidStr);
            syndicateEarnedWei = BigInt(syndStr);
        } else if (pubError && pubError.code !== 'PGRST116') { // PGRST116 is "Row not found"
            console.error('Supabase fetch publisher error:', pubError);
            return NextResponse.json({ error: 'Database error fetching stats' }, { status: 500 });
        }

        // 2. Fetch Impression and Click counts
        const { count: viewCount, error: viewError } = await supabase
            .from('tracking_events')
            .select('*', { count: 'exact', head: true })
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'view')
            .eq('is_test', false);

        const { count: clickCount } = await supabase
            .from('tracking_events')
            .select('*', { count: 'exact', head: true })
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'click')
            .eq('is_test', false);

        if (viewError) {
            console.error('Supabase fetch views error:', viewError);
        }
        
        // 3. Fetch most recent event timestamps
        const { data: viewData } = await supabase
            .from('tracking_events')
            .select('created_at')
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'view')
            .eq('is_test', false)
            .order('created_at', { ascending: false })
            .limit(1);
            
        const { data: clickData } = await supabase
            .from('tracking_events')
            .select('created_at')
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'click')
            .eq('is_test', false)
            .order('created_at', { ascending: false })
            .limit(1);

        // 2a. Fetch temporal 24-hour impression subsets specifically for Today's Earnings
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const { count: todayViewCount } = await supabase
            .from('tracking_events')
            .select('*', { count: 'exact', head: true })
            .eq('publisher_wallet', wallet)
            .eq('event_type', 'view')
            .eq('is_test', false)
            .gte('created_at', yesterday.toISOString());

        // =========================================================================
        // FEATURE: 100% Real-Time Publisher Dashboard Fusion
        // Bypass the Vercel 24-hour Cron restriction by dynamically calculating real-time earnings 
        // entirely from the Upstash Redis volatile ledger to ensure 0-millisecond lag.
        // =========================================================================
        let redisRealtimeViews = 0;
        let redisRealtimeEarningsWei = BigInt(0);
        let redisLastActiveAt: string | null = null;

        try {
            const { Redis } = require('@upstash/redis');
            const redisClient = Redis.fromEnv();
            
            // 1. Fetch exact high-fidelity timestamp directly mapped from telemetry
            const realLastActive = await redisClient.get(`pub_last_active_${wallet}`);
            if (realLastActive) {
                redisLastActiveAt = new Date(Number(realLastActive)).toISOString();
            }

            // 2. Compute volatile metrics aggregation for Real-Time USD earnings
            const pendingViews = await redisClient.hgetall('cron_pending_views');
            
            if (pendingViews) {
                const recentAdIds = [];
                for (const [key, val] of Object.entries(pendingViews)) {
                    const [adId, pubWallet] = key.split('::');
                    if (pubWallet.toLowerCase() === wallet.toLowerCase()) {
                        redisRealtimeViews += Number(val as string);
                        recentAdIds.push(adId);
                    }
                }
                
                if (recentAdIds.length > 0) {
                    const { data: cpmData } = await supabase.from('campaigns').select('id, cpm_rate_wei').in('id', recentAdIds);
                    if (cpmData) {
                        const cpmMap = new Map();
                        cpmData.forEach(c => cpmMap.set(String(c.id), BigInt(c.cpm_rate_wei || 0)));
                        
                        for (const [key, val] of Object.entries(pendingViews)) {
                            const [adId, pubWallet] = key.split('::');
                            if (pubWallet.toLowerCase() === wallet.toLowerCase()) {
                                const views = Number(val as string);
                                const cpm = cpmMap.get(adId) || BigInt(0);
                                const earningsShare = (cpm * BigInt(views)) / BigInt(1000);
                                redisRealtimeEarningsWei += earningsShare;
                            }
                        }
                    }
                }
            }
        } catch(e) { console.warn("[Security] Publisher Dashboard Redis Fusion offline.", e); }

        // 4. Calculate distinct ledger tracks (Ad Revenue vs Syndicate Revenue) using the Vouchers Table as a proxy ledger
        const { data: syndPayouts } = await supabase
            .from('vouchers')
            .select('amount_usd')
            .eq('used_by_wallet', wallet)
            .eq('campaign_id', 'SYNDICATE')
            .eq('status', 'consumed');

        let syndicatePaidOutWei = BigInt(0);
        if (syndPayouts) {
            for (let v of syndPayouts) {
                syndicatePaidOutWei += BigInt(Math.round(v.amount_usd * 1000000));
            }
        }

        const adEarnedWei = totalEarnedWei - syndicateEarnedWei + redisRealtimeEarningsWei;
        const adPaidOutWei = paidOutWei - syndicatePaidOutWei;

        const pendingAdWei = adEarnedWei - adPaidOutWei;
        const pendingSyndWei = syndicateEarnedWei - syndicatePaidOutWei;

        const finalTotalEarnedWei = totalEarnedWei + redisRealtimeEarningsWei;

        // Mathematically derive Today's fraction strictly based on aggregate Lifetime ECPM performance
        let todayEarnedWei = BigInt(0);
        if (viewCount && viewCount > 0) {
            // Deduct the realtime injected portion to calculate base history
            const baseHistoryEarned = adEarnedWei - redisRealtimeEarningsWei;
            const weiPerView = baseHistoryEarned / BigInt(viewCount);
            todayEarnedWei = (weiPerView * BigInt(todayViewCount || 0)) + redisRealtimeEarningsWei;
        } else if (redisRealtimeEarningsWei > BigInt(0)) {
            // Edge case: first day of a Miniapp, no Postgres history yet
            todayEarnedWei = redisRealtimeEarningsWei;
        }

        // Convert bigints to readable USD formatting for the frontend UI
        return NextResponse.json(
            {
                success: true,
                stats: {
                    todayEarnedUSD: Number(ethers.formatUnits(todayEarnedWei.toString(), 6)).toFixed(4),
                    totalEarnedUSD: Number(ethers.formatUnits(finalTotalEarnedWei.toString(), 6)).toFixed(4),
                    pendingUSD: Number(ethers.formatUnits(pendingAdWei.toString(), 6)).toFixed(4), // Base Ad Revenue Claimable
                    pendingSyndicateUSD: Number(ethers.formatUnits(pendingSyndWei.toString(), 6)).toFixed(4), // Syndicate Revenue Claimable
                    paidOutUSD: Number(ethers.formatUnits(paidOutWei.toString(), 6)).toFixed(4),
                    syndicateEarnedUSD: Number(ethers.formatUnits(syndicateEarnedWei.toString(), 6)).toFixed(4), // All Time Protocol Earnings
                    impressions: (viewCount || 0) + redisRealtimeViews,
                    todayImpressions: (todayViewCount || 0) + redisRealtimeViews,
                    clicks: clickCount || 0,
                    lastImpression: redisLastActiveAt || (viewData && viewData.length > 0 ? viewData[0].created_at : null),
                    lastClick: clickData && clickData.length > 0 ? clickData[0].created_at : null
                }
            },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, X-OpenAds-Auth',
                },
            }
        );
    } catch (err) {
        console.error('Publisher Stats API Error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-OpenAds-Auth',
        },
    });
}

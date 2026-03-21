import { NextResponse } from 'next/server';
import { supabase } from '@/app/lib/supabase';

import { createAppClient, viemConnector } from '@farcaster/auth-client';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Basic IP rate limiter: 5 requests per 5 seconds
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '5 s'),
  analytics: true,
});

// Advanced Anti-Fraud: FID Rate Limiters
const fidPerMinRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 impressions max per minute
  analytics: false,
});

const fidPerHourRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(30, '1 h'), // 30 impressions max per hour
  analytics: false,
});

const appClient = createAppClient({
    ethereum: viemConnector(),
});

export async function POST(request: Request) {
    try {
        // =========================================================================
        // FEATURE: Rate Limiting (Upstash Redis)
        // Prevent DDoS, Bot Farms, and API Replay Attacks to protect advertiser budgets.
        // =========================================================================
        const ip = request.headers.get('x-forwarded-for') || 'anonymous-ip';
        try {
            const { success } = await ratelimit.limit(`ratelimit_${ip}`);
            if (!success) {
                console.warn(`[OpenAds Security] 🚨 Rate Limit Exceeded for IP: ${ip}. Request blocked.`);
                return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
            }
        } catch (redisErr) {
            console.warn(`[OpenAds Security] Redis check failed, bypassing rate limit:`, redisErr);
            // If Redis is unconfigured or fails, we allow traffic to pass to not break the app.
        }

        const payload = await request.json();
        const { event, placement, publisher, fid, sig, message, nonce, ad, client_type = 'farcaster', logo } = payload;
        
        const safeFidStr = String(fid || '0');

        // Normalize event name (SDK sends 'impression', RPC expects 'view')
        let normalizedEvent = 'click';
        if (event === 'impression' || event === 'view') normalizedEvent = 'view';
        if (event === 'connect') normalizedEvent = 'connect';

        // =========================================================================
        // FEATURE: Advanced FID-Based Rate Limiting (Anti-Bot Farm)
        // =========================================================================
        if (normalizedEvent === 'view' && safeFidStr !== '0' && safeFidStr !== 'undefined') {
            try {
                // Minutely limit
                const { success: successMin } = await fidPerMinRatelimit.limit(`fid_min_${safeFidStr}`);
                if (!successMin) {
                    console.warn(`[OpenAds Security] 🚨 FID Minutely Rate Limit Exceeded for FID: ${safeFidStr}. Bot farm detected. Request blocked.`);
                    return NextResponse.json({ error: 'Too Many Impressions (Minute)' }, { status: 429 });
                }
                // Hourly limit
                const { success: successHour } = await fidPerHourRatelimit.limit(`fid_hour_${safeFidStr}`);
                if (!successHour) {
                    console.warn(`[OpenAds Security] 🚨 FID Hourly Rate Limit Exceeded for FID: ${safeFidStr}. Request blocked.`);
                    return NextResponse.json({ error: 'Too Many Impressions (Hour)' }, { status: 429 });
                }
            } catch (redisErr) {
                console.warn(`[Security] Redis FID rate limit bypass due to outage.`, redisErr);
            }
        }

        // =========================================================================
        // EDGE CASE 1: Legacy SDK Block (Enforce iframe)
        // =========================================================================
        const fetchDest = request.headers.get('sec-fetch-dest');
        if (fetchDest === 'script') {
            console.warn(`[Security] Blocked tracking ping from deprecated legacy SDK script.`);
            return NextResponse.json({ error: 'Legacy script SDK is deprecated. Please upgrade to the secure iframe integration.' }, { status: 403 });
        }

        if (!event || !placement || !ad || !ad.id) {
            return NextResponse.json({ error: 'Missing required tracking parameters' }, { status: 400 });
        }

        if (client_type === 'farcaster') {
            console.log(`[OpenAds Backend API] 📱 Farcaster Mini App Traffic Detected: Extracting FID ${fid} for ad ${ad.id}`);
            
            // 🚨 ZERO-DAY MITIGATION PATCH: ENFORCE SIWF CRYPTOGRAPHY
            const result = await appClient.verifySignInMessage({
                message: message,
                signature: sig as `0x${string}`,
                domain: (message?.match(/(.+) wants you to sign in/) || [])[1] || 'openads-backend.vercel.app',
                nonce: nonce,
            });
            
            if (!result.success) {
                console.error(`[Security] CRITICAL: Fraudulent Farcaster Telemetry Signature Detected for FID: ${fid}`);
                return NextResponse.json({ error: 'Farcaster Cryptographic Signature Invalid. Click/Impression rejected by OpenAds.' }, { status: 401 });
            }
        } else if (client_type === 'web') {
            // SECURITY UPGRADE: Cryptographic Impression Validation
            if (event !== 'connect') {
                if (!sig || !sig.includes(':')) {
                    console.error(`[Security] CRITICAL: Web Telemetry missing HMAC Token for ${event}`);
                    return NextResponse.json({ error: 'Missing Cryptographic Token.' }, { status: 401 });
                }
                const [adId, pId, ts, clientHmac] = sig.split(':');
                const tokenSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'openads-secure-fallback';
                
                // Dynamically import crypto for Next.js Route Handler compatibility
                const crypto = require('crypto');
                const expectedHmac = crypto.createHmac('sha256', tokenSecret).update(`${adId}:${pId}:${ts}`).digest('hex');
                
                if (clientHmac !== expectedHmac) {
                    console.error(`[Security] CRITICAL: Fraudulent Web Telemetry Signature Detected for Ad: ${ad.id}`);
                    return NextResponse.json({ error: 'Cryptographic Signature Invalid. Click/Impression rejected by OpenAds.' }, { status: 401 });
                }
                
                // Replay Attack Prevention: Tokens expire strictly after 1 hour
                if (Date.now() - Number(ts) > 3600000) {
                     console.warn(`[Security] Expired Token execution attempt for Ad: ${ad.id}`);
                     return NextResponse.json({ error: 'Telemetry Token Expired. Time-Box Enforced.' }, { status: 401 });
                }
                
                // Replay Attack Prevention 2: One-Time Use Ledger via Redis Distributed Lock
                try {
                    const redis = Redis.fromEnv();
                    const lockKey = `openads_nonce_${event}_${clientHmac}`;
                    const isNew = await redis.set(lockKey, 'consumed', { nx: true, ex: 3600 });
                    if (!isNew) {
                         console.error(`[Security] CRITICAL: Replay Attack Blocked! Token already consumed for event: ${event}`);
                         return NextResponse.json({ error: 'Token already used for this event type. Replay forbidden.' }, { status: 403 });
                    }
                } catch (redisErr) {
                    console.warn(`[Security] Redis nonce check skipped due to connection offline.`, redisErr);
                }
            }
            console.log(`[OpenAds Backend API] 🌍 Web Traffic Detected and MAC Verified: Processing ad ${ad.id}`);
        } else {
            return NextResponse.json({ error: 'Invalid client authentication channel' }, { status: 400 });
        }

        // Explicit publisher wallet from SDK (data-publisher attribute)
        let publisherWallet = publisher;

        // Fallback for older SDKs (extract Publisher Wallet from placement e.g. "top-0xABC...")
        if (!publisherWallet) {
            const parts = placement.split('-');
            publisherWallet = parts.length > 1 ? parts[1] : null;
        }

        // Cryptographic Wallet Integrity Firewall
        if (!publisherWallet || !publisherWallet.startsWith('0x') || publisherWallet.length !== 42) {
            console.warn(`[Security] Blocked tracking ping with malformed wallet: ${publisherWallet}`);
            return NextResponse.json({ error: 'Invalid Publisher Wallet format.' }, { status: 400 });
        }

        // NULL_WEB_SIG to satisfy strict DB validations that expect a 132-char hex string 
        const NULL_WEB_SIG = '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

        // =========================================================================
        // SECURITY UPDATE: Strict Domain Authentication mapped to Publisher Wallet
        // We use payload.parent_url sent from the iframe to resolve the true domain.
        // =========================================================================
        const originHeader = request.headers.get('origin') || request.headers.get('referer') || '';
        let requestHost = '';
        if (payload.parent_url) {
            try { requestHost = new URL(payload.parent_url).host; } catch(e) {}
        }
        if (!requestHost) {
            try { requestHost = new URL(originHeader).host; } catch(e) {}
        }

        if (!requestHost) {
            console.warn(`[Security] Blocked tracking ping with no Origin/Referer/Parent header: ${ip}`);
            return NextResponse.json({ error: 'Missing Origin/Referer header' }, { status: 403 });
        }

        // Validate the Publisher's Domain using case-insensitive wallet matching
        const { data: publisherApp, error: appError } = await supabase
            .from('apps')
            .select('id, domain, logo_url, publisher_wallet')
            .ilike('publisher_wallet', publisherWallet)
            .ilike('domain', `%${requestHost}%`)
            .single();

        if (appError || !publisherApp) {
            if (requestHost.includes('openads-backend')) {
                 console.warn(`[Security] Referrer-Policy Masking Detected! The parent frame (Miniapp) is blocking Origin routing.`);
                 return NextResponse.json({ error: 'Strict Referrer-Policy block detected. You must disable `no-referrer` headers on your Miniapp to authenticate telemetry from this domain.' }, { status: 403 });
            }
            console.warn(`[Security] Click Fraud Attempt! Unauthorized domain ${requestHost} trying to track for wallet ${publisherWallet}`);
            return NextResponse.json({ error: 'Unauthorized Domain for this Publisher Wallet.' }, { status: 403 });
        }

        // ===============================================
        // VULNERABILITY N: THE 'COSMETIC Verification' FIX
        // Ensure that Impressions and Clicks are STRICTLY REJECTED if the Publisher has not passed Verification.
        // Connect events (System Pings) are permitted to allow the Crawler to handshake properly.
        // ===============================================
        
        if (publisherApp.logo_url !== 'verified' && normalizedEvent !== 'connect') {
            console.warn(`[Security] Blocked Billable Event (${normalizedEvent}) from UNVERIFIED Domain: ${requestHost}`);
            return NextResponse.json({ error: 'Domain is registered but NOT Verified. Telemetry rejected.' }, { status: 403 });
        }

        // =========================================================================
        // SECURITY UPGRADE: Rapid-Click Block (Anti-Bot)
        // Prevents Auto-clickers that fire immediately after a view.
        // =========================================================================
        if ((normalizedEvent === 'view' || normalizedEvent === 'click') && ad && ad.id) {
            try {
                const redis = Redis.fromEnv();
                // Combine IP, FID, and Ad ID as the unique actor identifier for this session
                const actorKey = `actor_${ip}_${safeFidStr}_${ad.id}`;
                
                if (normalizedEvent === 'view') {
                    // Log the timestamp of the view
                    await redis.set(`view_ts_${actorKey}`, Date.now(), { ex: 3600 });
                } else if (normalizedEvent === 'click') {
                    const viewTs = await redis.get(`view_ts_${actorKey}`);
                    // Strict Check: No View before Click? Discard.
                    if (!viewTs) {
                        console.warn(`[Security] 🚨 Orphaned Click (No preceding view) for Ad ${ad.id} by Actor ${actorKey}. Dropped.`);
                        return NextResponse.json({ error: 'Orphaned Click Rejected' }, { status: 403 });
                    }
                    
                    const elapsedMs = Date.now() - Number(viewTs);
                    // Minimal physical cognitive reaction time limit (500ms)
                    if (elapsedMs < 500) {
                        console.warn(`[Security] 🚨 Rapid-Click Bot Detected! Speed: ${elapsedMs}ms for Ad ${ad.id}. Dropped.`);
                        return NextResponse.json({ error: 'Rapid-Click Bot Detected' }, { status: 403 });
                    }
                }
            } catch (redisErr) {
                console.warn(`[Security] Redis Rapid-Click check skipped due to connection error.`, redisErr);
            }
        }

        // =========================================================================
        // DATABASE INSERTION (Must happen AFTER Security Checks!)
        // =========================================================================
        // Record the Impression Securely via our Atomic RPC function
        if (normalizedEvent === 'view') {
            const safeFid = client_type === 'web' ? 0 : Number(fid);
            const safeSig = (client_type === 'web' || sig === 'verified_origin') ? NULL_WEB_SIG : sig;

            const { data, error } = await supabase.rpc('record_impression', {
                p_campaign_id: ad.id,
                p_publisher_wallet: publisherApp.publisher_wallet,
                p_fid: safeFid,
                p_event_type: normalizedEvent,
                p_sig: safeSig
            });

            if (error) {
                console.error('Supabase RPC Error (View):', error.message || error);
                // Return 200 to not block the frontend, but log the DB error aggressively
            }
        }
        else if (normalizedEvent === 'click') {
            // For production, clicks log for CTR computation
            const safeFid = client_type === 'web' ? 0 : Number(fid);
            const safeSig = (client_type === 'web' || sig === 'verified_origin') ? NULL_WEB_SIG : sig;

            const { error } = await supabase.from('tracking_events').insert([{
                campaign_id: ad.id,
                publisher_wallet: publisherApp.publisher_wallet,
                fid: safeFid,
                event_type: normalizedEvent,
                sig: safeSig
            }]);

            if (error) console.error('Supabase Click Log Error:', error.message || error);
        }
        else if (normalizedEvent === 'connect') {
            const safeFid = client_type === 'web' ? 0 : Number(fid);
            const safeSig = (client_type === 'web' || sig === 'verified_origin') ? NULL_WEB_SIG : sig;

            // Log a synthetic connection heartbeat for verification (No campaign_id)
            const { error } = await supabase.from('tracking_events').insert([{
                campaign_id: null,
                publisher_wallet: publisherApp.publisher_wallet,
                fid: safeFid,
                event_type: 'connect',
                sig: safeSig
            }]);

            if (error) console.error('Supabase Connect Log Error:', error.message || error);
        }

        // =========================================================================
        // SECURITY UPDATE: Restore Publisher Verification (Soft-Lock Fix)
        // If this is the very first valid ping from the authorized domain, 
        // mark it as 'verified' in the DB to unlock the Dashboard UI.
        // =========================================================================
        if (!publisherApp.logo_url) {
            await supabase
                .from('apps')
                .update({ logo_url: 'verified' })
                .eq('id', publisherApp.id);
            console.log(`[OpenAds Backend API] ✅ Publisher App ${publisherApp.id} successfully verified via first ping!`);
        }


        return NextResponse.json(
            { success: true, verifiedFid: fid, loggedEvent: event },
            {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            }
        );
    } catch (error) {
        console.error('Tracking API Error:', error);
        return NextResponse.json({ error: 'Failed to process tracking event' }, { status: 500 });
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

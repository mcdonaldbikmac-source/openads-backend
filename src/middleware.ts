import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------------
// OpenAds Edge Rate Limiter
// Purpose: Protect the Vercel Serverless Architecture (Hobby Tier) from basic DDoS,
// runaway loops, or intentional malicious API scraping.
//
// UX Policy: Normal legitimate usage MUST NOT be negatively impacted.
// Therefore, limits are set extremely high. An average user browsing a page or 
// triggering a dashboard action might make 5-20 requests a minute.
// We allow 500 requests per minute per IP.
// ---------------------------------------------------------------------------------
const ipRequestMap = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute sliding window per block
const MAX_REQUESTS = 500;    // 500 requests allowed per minute

export function middleware(request: NextRequest) {
  // Ensure we only rate-limit the actual API endpoints, not static assets if any
  if (request.nextUrl.pathname.startsWith('/api')) {
    
    // Extract Client IP address. Vercel provides 'x-forwarded-for'.
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    
    if (ip !== 'unknown') {
      const now = Date.now();
      const record = ipRequestMap.get(ip) || { count: 0, resetTime: now + WINDOW_MS };
      
      // If the time window has passed, reset their counter
      if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + WINDOW_MS;
      }
      
      record.count += 1;
      ipRequestMap.set(ip, record);
      
      // If they blew past the generous limit, cut them off with HTTP 429
      if (record.count > MAX_REQUESTS) {
        console.warn(`[RATE LIMIT TRIGGERED] IP ${ip} exceeded ${MAX_REQUESTS} req/min. Blocked.`);
        return new NextResponse(
          JSON.stringify({ 
            error: 'Too Many Requests', 
            message: 'To protect the network, your IP has been temporarily rate-limited due to excessive API traffic. Please try again in 1 minute.',
            code: 429
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }
  
  // Proceed to the normal API route cleanly
  return NextResponse.next();
}

// Optimization: Tell Next.js this middleware ONLY needs to boot up for /api/* routes
export const config = {
  matcher: '/api/:path*',
};

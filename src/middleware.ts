import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------------
// OpenAds Edge Rate Limiter & Global CORS
// Purpose: Protect the Vercel Serverless Architecture (Hobby Tier) from DDoS
// and establish a unified Cross-Origin Resource Sharing policy to prevent Chrome cache crashes.
// ---------------------------------------------------------------------------------
const ipRequestMap = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-OpenAds-Auth, Cache-Control, Pragma, Expires',
};

export function middleware(request: NextRequest) {
  // Handle Preflight OPTIONS requests universally
  if (request.method === 'OPTIONS') {
    return NextResponse.json({}, { status: 204, headers: corsHeaders });
  }

  // Ensure we only rate-limit the actual API endpoints
  if (request.nextUrl.pathname.startsWith('/api')) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    
    if (ip !== 'unknown') {
      const now = Date.now();
      const record = ipRequestMap.get(ip) || { count: 0, resetTime: now + WINDOW_MS };
      
      if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + WINDOW_MS;
      }
      
      record.count += 1;
      ipRequestMap.set(ip, record);
      
      if (record.count > MAX_REQUESTS) {
        console.warn(`[RATE LIMIT TRIGGERED] IP ${ip} exceeded ${MAX_REQUESTS} req/min.`);
        return NextResponse.json(
          { 
            error: 'Too Many Requests', 
            message: 'To protect the network, your IP has been temporarily rate-limited due to excessive API traffic. Please try again in 1 minute.',
            code: 429
          },
          { status: 429, headers: corsHeaders }
        );
      }
    }
  }
  
  // Proceed to normal API route cleanly, injecting the CORS headers on the outbound response
  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
};

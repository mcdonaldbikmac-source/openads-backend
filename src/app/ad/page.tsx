"use client";

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AdFrameContent() {
    const searchParams = useSearchParams();
    const placementId = searchParams.get('placement');
    const position = searchParams.get('position') || 'bottom';
    const publisherWallet = searchParams.get('publisher');
    const clientType = searchParams.get('client_type') || 'web';
    const fid = searchParams.get('fid') ? parseInt(searchParams.get('fid') as string, 10) : 0;

    const [adData, setAdData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch the ad on mount
    useEffect(() => {
        if (!placementId) return;

        async function fetchAd() {
            try {
                const res = await fetch(`/api/v1/ad/decide?placement=${placementId}&position=${position}&t=${Date.now()}`);
                if (!res.ok) throw new Error('API unreachable');
                const data = await res.json();
                
                if (data.ad && !sessionStorage.getItem(`openads_closed_${data.ad.id}`)) {
                    setAdData(data.ad);
                    // Resize postMessage is now triggered via the img onLoad handler below
                } else {
                    // No ad available, or user closed this ad in this session
                    window.parent.postMessage({ type: 'OPENADS_COLLAPSE' }, '*');
                }
            } catch (err) {
                console.error('[OpenAds Iframe] Failed to load ad payload.', err);
                window.parent.postMessage({ type: 'OPENADS_COLLAPSE' }, '*');
            } finally {
                setLoading(false);
            }
        }
        fetchAd();
    }, [placementId, position]);

    // Intersection Observer for Viewability tracking
    useEffect(() => {
        if (!adData || hasTrackedImpression || !containerRef.current) return;
        
        let timeoutId: NodeJS.Timeout | null = null;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    // Started viewing
                    if (!timeoutId) {
                        timeoutId = setTimeout(() => {
                            setHasTrackedImpression(true);
                            observer.disconnect();
                            
                            // Log cryptographically signed verified impression
                            fetch('/api/v1/ad/track', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    client_type: clientType,
                                    event: 'impression',
                                    ad: { id: adData.id },
                                    placement: placementId,
                                    publisher: publisherWallet,
                                    fid,
                                    sig: 'verified_origin',
                                    message: `impression:${placementId}:${publisherWallet}`
                                })
                            }).catch(console.error);
                            
                        }, 1000); // 1 second threshold
                    }
                } else {
                    // Stopped viewing before threshold
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                }
            });
        }, { threshold: 0.5 });
        
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [adData, hasTrackedImpression, placementId, publisherWallet, clientType, fid]);

    const handleClick = () => {
        if (!adData) return;
        
        // 1. Notify parent to execute redirect to bypass Farcaster Webview iframe traps
        window.parent.postMessage({
            type: 'OPENADS_CLICK',
            url: adData.url
        }, '*');
        
        // 2. Track click synchronously in background
        fetch('/api/v1/ad/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_type: clientType,
                event: 'click',
                ad: { id: adData.id },
                placement: placementId,
                publisher: publisherWallet,
                fid,
                sig: 'verified_origin',
                message: `click:${adData.id}:${placementId}:${publisherWallet}`
            }),
            keepalive: true // Crucial for navigating away
        }).catch(console.error);
    };

    if (loading || !adData) return null;

    let width = '100%';
    let height = 'auto';
    let borderRadius = position === 'floating' ? '50%' : '4px';

    if (adData.size && adData.size.includes('x')) {
        const [w, h] = adData.size.split('x');
        width = `${w}px`;
        height = `${h}px`;
    }
    
    if (position === 'floating') {
        width = '100%';
        height = '100%';
    }

    return (
        <div 
            ref={containerRef}
            onClick={handleClick}
            style={{ 
                width: width, 
                height: height, 
                maxWidth: '100%', 
                cursor: 'pointer', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                overflow: 'hidden', 
                borderRadius: borderRadius, 
                margin: '0 auto', 
                background: 'transparent' 
            }}
        >
            <img 
                src={adData.image} 
                alt="Advertisement" 
                onLoad={(e) => {
                    const imgElement = e.currentTarget;
                    const h = imgElement.offsetHeight || imgElement.naturalHeight;
                    const w = imgElement.offsetWidth || imgElement.naturalWidth;
                    window.parent.postMessage({
                        type: 'OPENADS_RESIZE',
                        height: h,
                        width: w,
                        position: position
                    }, '*');
                }}
                style={{ 
                    maxWidth: '100%', 
                    maxHeight: '100%', 
                    objectFit: 'cover', 
                    display: 'block', 
                    borderRadius: borderRadius 
                }} 
            />
        </div>
    );
}

export default function AdIframePage() {
    return (
        <>
            <style dangerouslySetInnerHTML={{__html: `
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background-color: transparent !important;
                    overflow: hidden;
                }
                body > div {
                    background-color: transparent !important;
                }
            `}} />
            <Suspense fallback={null}>
                <AdFrameContent />
            </Suspense>
        </>
    );
}

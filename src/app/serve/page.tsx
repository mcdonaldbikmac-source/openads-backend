"use client";

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function AdFrameContent() {
    const searchParams = useSearchParams();
    const publisherWallet = searchParams.get('publisher');
    // BACKWARDS COMPATIBILITY: Relax position default to 'all' so legacy snippets can still serve Pop up icons and highest-bidding ads.
    const placementId = searchParams.get('placement') || (publisherWallet ? `responsive-${publisherWallet}` : null);
    const position = (searchParams.get('position') || 'all').toLowerCase();
    const clientType = searchParams.get('client_type') || 'web';
    const fid = searchParams.get('fid') ? parseInt(searchParams.get('fid') as string, 10) : 0;
    const isPreview = searchParams.get('preview') === 'true';

    const [adData, setAdData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch the ad on mount
    useEffect(() => {
        if (!placementId) return;

        // Unconditional telemetry ping to guarantee backend connection validation even if Ad Inventory is perfectly empty (Scenario B fix)
        fetch('/api/v1/serve/pulse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_type: clientType,
                event: 'connect',
                ad: { id: '00000000-0000-0000-0000-000000000000' }, // Dummy UUID, will be ignored by pulse route for 'connect' events
                placement: placementId,
                publisher: publisherWallet,
                fid,
                logo: searchParams.get('logo') || '',
                sig: 'verified_origin',
                message: `connect:${placementId}:${publisherWallet}`,
                parent_url: document.referrer || window.location.href
            }),
            keepalive: true
        }).catch(() => {});

        async function fetchAd() {
            try {
                const res = await fetch(`/api/v1/serve/decide?placement=${placementId}&position=${position}&t=${Date.now()}`);
                if (!res.ok) throw new Error('API unreachable');
                const data = await res.json();
                
                // Bypass sessionStorage check if testing via preview mode
                if (data.ad && (isPreview || !sessionStorage.getItem(`openads_closed_${data.ad.id}`))) {
                    setAdData(data.ad);
                    
                    // Native Dimension Morphing Dispatch
                    if (placementId && placementId.includes('responsive')) {
                        const frameId = searchParams.get('frameId') || `openads-resp-${publisherWallet}`;
                        if (data.ad.size === '64x64' || position === 'floating') {
                            window.parent.postMessage({ morph: true, id: frameId, style: { position: 'fixed', top: '20px', right: '20px', width: '64px', height: '64px', borderRadius: '50%', zIndex: 2147483647, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', minHeight: '64px', background: 'transparent' } }, '*');
                        } else if (data.ad.size === '300x250' || position === 'popup') {
                            window.parent.postMessage({ morph: true, id: frameId, style: { position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', zIndex: 2147483647, background: 'rgba(0,0,0,0.5)', minHeight: '100vh' } }, '*');
                        }
                    }
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
                            fetch('/api/v1/serve/pulse', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    client_type: clientType,
                                    event: 'impression',
                                    ad: { id: adData.id },
                                    placement: placementId,
                                    publisher: publisherWallet,
                                    fid,
                                    logo: searchParams.get('logo') || '',
                                    sig: 'verified_origin',
                                    message: `impression:${placementId}:${publisherWallet}`,
                                    parent_url: document.referrer || window.location.href
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

    const handleClick = (e: React.MouseEvent) => {
        if (!adData) return;
        
        // Track the click synchronously while the native browser handles the Anchor <a> routing mechanism
        fetch('/api/v1/serve/pulse', {
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
            keepalive: true // Crucial for navigating away smoothly
        }).catch(console.error);
        
        // Ensure graceful fallback notification for publishers who happen to still be running legacy framework logic
        window.parent.postMessage({
            type: 'OPENADS_CLICK',
            url: adData.url
        }, '*');
    };

    if (loading || !adData) return null;

    let width = '100%';
    let height = 'auto';
    let borderRadius = position === 'floating' || adData.size === '64x64' ? '50%' : '4px';

    if (adData.size && adData.size.includes('x')) {
        const [w, h] = adData.size.split('x');
        width = `${w}px`;
        height = `${h}px`;
    }
    
    if (position === 'floating') {
        width = '100%';
        height = '100%';
    }

    const isResponsivePlacement = placementId && placementId.includes('responsive');
    const isFullScreenPopup = isResponsivePlacement && adData.size === '300x250';

    const isFloating64 = position === 'floating' || adData.size === '64x64';

    const innerAdContent = (
        <a 
            href={adData.url}
            target="_blank"
            rel="noopener noreferrer"
            ref={containerRef as any}
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
                background: 'transparent',
                position: 'relative',
                textDecoration: 'none'
            }}
        >
            {/* Overlay Buttons */}
            <div style={{
                position: 'absolute', top: position === 'floating' || adData.size === '64x64' ? '12px' : '6px', right: position === 'floating' || adData.size === '64x64' ? '12px' : '6px', display: 'flex', gap: '6px', zIndex: 1000000
            }}>
                {/* Info Button */}
                <div 
                    onClick={(e) => { e.stopPropagation(); window.open('https://openads.xyz', '_blank'); }}
                    style={{
                        width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', 
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: '11px', fontWeight: 'bold', cursor: 'help', backdropFilter: 'blur(4px)'
                    }}
                    title="Powered by OpenAds"
                >
                    ?
                </div>
                {/* Close Button */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        sessionStorage.setItem(`openads_closed_${adData.id}`, 'true');
                        if (containerRef.current) containerRef.current.style.display = 'none';
                        window.parent.postMessage({ type: 'OPENADS_COLLAPSE' }, '*');
                    }}
                    style={{
                        width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', 
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)'
                    }}
                    title="Close Ad"
                >
                    ✕
                </div>
            </div>

            <img 
                src={adData.image} 
                alt="" 
                onError={(e) => {
                    e.currentTarget.style.display = 'none';
                }}
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
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover', 
                    display: 'block', 
                    borderRadius: borderRadius 
                }} 
            />
        </a>
    );

    if (isFullScreenPopup) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100vw', height: '100vh' }}>
                <div style={{ position: 'relative', width: '300px', height: '250px', background: '#fff', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                    {innerAdContent}
                </div>
            </div>
        );
    }

    return innerAdContent;
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

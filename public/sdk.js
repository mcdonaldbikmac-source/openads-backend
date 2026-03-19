(function() {
    function initOpenAds() {
        const containers = document.querySelectorAll('[data-openads-publisher]');
        
        containers.forEach(container => {
            if (container.dataset.initialized) return;
            
            const publisher = container.getAttribute('data-openads-publisher');
            const position = container.getAttribute('data-position') || 'all';
            const frameId = 'openads-frame-' + Math.random().toString(36).substring(2, 9);
            
            // Generate the URL (assuming backend is prod or local relative)
            const backendUrl = "https://openads-backend.vercel.app";
            
            const iframe = document.createElement('iframe');
            iframe.id = frameId;
            iframe.src = `${backendUrl}/serve?publisher=${publisher}&placement=responsive-${publisher}&position=${position}&frameId=${frameId}`;
            iframe.title = "OpenAds Advertisement";
            iframe.style.width = "100%";
            iframe.style.minHeight = "100px";
            iframe.style.border = "none";
            iframe.style.display = "block";
            iframe.style.transition = "all 0.3s ease";
            iframe.frameBorder = "0";
            iframe.scrolling = "no";
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
            iframe.setAttribute('allow', 'clipboard-write');
            
            container.appendChild(iframe);
            container.dataset.initialized = "true";
        });
    }

    // Attach message listener for natural Dimension Morphing (The Communication Channel)
    window.addEventListener('message', function(e) {
        if (e.data && e.data.morph && e.data.id) {
            const frame = document.getElementById(e.data.id);
            if (frame) {
                // Safely assign geometry
                Object.assign(frame.style, e.data.style);
            }
        }
        
        if (e.data && e.data.type === 'OPENADS_COLLAPSE') {
            document.querySelectorAll('iframe[id^="openads-frame-"]').forEach(frame => {
                frame.style.display = 'none';
            });
        }
    });

    // Run on DOM loaded or immediately if already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOpenAds);
    } else {
        initOpenAds();
    }
    
    // Support dynamic React/Next.js navigations
    let lastUrl = location.href; 
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            initOpenAds();
        }
    }).observe(document, {subtree: true, childList: true});
})();

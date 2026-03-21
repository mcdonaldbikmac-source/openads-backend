const fs = require('fs');
const file = 'src/app/serve/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `
    const innerAdContent = (
        <a 
            href={adData.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            style={{ 
                position: isFloating64 ? 'relative' : 'absolute',
                top: isFloating64 ? 'auto' : 0, 
                left: isFloating64 ? 'auto' : 0, 
                right: isFloating64 ? 'auto' : 0, 
                bottom: isFloating64 ? 'auto' : 0,
                display: 'block', 
                background: 'transparent',
                textDecoration: 'none',
                overflow: 'hidden',
                borderRadius: borderRadius,
                aspectRatio: (position === 'floating' || adData?.size === '64x64') ? '1 / 1' : 'auto',
                boxSizing: 'border-box',
                boxShadow: isFloating64 ? '0 4px 12px rgba(0,0,0,0.15)' : (isFullScreenPopup ? '0 10px 30px rgba(0,0,0,0.2)' : 'none'),
                border: isFullScreenPopup ? '1px solid rgba(0,0,0,0.1)' : 'none'
            }}
        >
            {/* Overlay Buttons */}
            <div style={{
                position: 'absolute', 
                top: isFloating64 ? '6px' : '6px', 
                right: isFloating64 ? '6px' : '6px', 
                display: 'flex', 
                gap: '4px', 
                zIndex: 1000000,
                opacity: 0.9
            }}>
                {/* Info Button - Hidden on 64x64 to save space */}
                {!isFloating64 && (
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
                )}
                {/* Close Button */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        sessionStorage.setItem(\`openads_closed_\${adData.id}\`, 'true');
                        if (containerRef.current) containerRef.current.style.display = 'none';
                        window.parent.postMessage({ type: 'OPENADS_COLLAPSE' }, '*');
                    }}
                    style={{
                        width: isFloating64 ? '14px' : '18px', 
                        height: isFloating64 ? '14px' : '18px', 
                        borderRadius: '50%', 
                        background: 'rgba(0,0,0,0.5)', 
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: isFloating64 ? '8px' : '9px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)'
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
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover', 
                    display: 'block', 
                    borderRadius: borderRadius,
                    aspectRatio: (position === 'floating' || adData?.size === '64x64') ? '1 / 1' : 'auto',
                    zIndex: 1
                }} 
            />
        </a>
    );`;

const newStr = `    const innerAdContent = (
        <div 
            ref={containerRef as any}
            style={{ 
                width: '100%', 
                height: '100%', 
                position: 'relative', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center' 
            }}
        >
            <a 
                href={adData.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClick}
                style={{ 
                    display: 'block', 
                    width: isFloating64 ? '56px' : '100%',
                    height: isFloating64 ? '56px' : '100%',
                    background: 'transparent',
                    textDecoration: 'none',
                    overflow: 'hidden',
                    borderRadius: borderRadius,
                    boxSizing: 'border-box',
                    boxShadow: isFloating64 ? '0 4px 12px rgba(0,0,0,0.15)' : (isFullScreenPopup ? '0 10px 30px rgba(0,0,0,0.2)' : 'none'),
                    border: isFullScreenPopup ? '1px solid rgba(0,0,0,0.1)' : 'none'
                }}
            >
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
                        display: 'block'
                    }} 
                />
            </a>

            {/* Overlay Buttons */}
            <div style={{
                position: 'absolute', 
                top: isFloating64 ? '4px' : '6px', 
                right: isFloating64 ? '4px' : '6px', 
                display: 'flex', 
                gap: '4px', 
                zIndex: 1000000,
                opacity: 0.9
            }}>
                {/* Info Button - Hidden on 64x64 to save space */}
                {!isFloating64 && (
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
                )}
                {/* Close Button */}
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        sessionStorage.setItem(\`openads_closed_\${adData.id}\`, 'true');
                        if (containerRef.current) containerRef.current.style.display = 'none';
                        window.parent.postMessage({ type: 'OPENADS_COLLAPSE' }, '*');
                    }}
                    style={{
                        width: isFloating64 ? '14px' : '18px', 
                        height: isFloating64 ? '14px' : '18px', 
                        borderRadius: '50%', 
                        background: 'rgba(0,0,0,0.5)', 
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        fontSize: isFloating64 ? '8px' : '9px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)'
                    }}
                    title="Close Ad"
                >
                    ✕
                </div>
            </div>
        </div>
    );`;

// Regex replacement from "const innerAdContent =" up to the first ");" after "</a>"
const regex = /const innerAdContent = \([\s\S]*?<\/a>\n    \);/m;
content = content.replace(regex, newStr);

fs.writeFileSync(file, content, 'utf8');
console.log("Success! Replaced innerAdContent block entirely.");

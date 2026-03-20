const fs = require('fs');
const path = require('path');

const targetFiles = [
    'src/app/api/v1/publisher/claim/route.ts',
    'src/app/api/v1/serve/create/route.ts',
    'src/app/api/v1/user/budget/route.ts',
    'src/app/api/v1/user/edit/route.ts',
    'src/app/api/v1/publisher/apps/route.ts',
    'src/app/api/v1/user/status/route.ts',
    'src/app/api/v1/publisher/apps/delete/route.ts',
    'src/app/api/v1/publisher/apps/toggle/route.ts'
];

targetFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        // Remove both variations of the flawed regex logic that traps MetaMask users
        content = content.replace(/\(body\.message\.includes\('farcaster\.xyz'\) \|\| \(body\.signature && body\.signature\.length > 130\)\)/g, "body.message.includes('farcaster.xyz')");
        content = content.replace(/\(body\.message\.includes\('farcaster\.xyz'\) \|\| body\.signature\?\.length > 130\)/g, "body.message.includes('farcaster.xyz')");
        
        fs.writeFileSync(fullPath, content);
        console.log(`Refactored Farcaster boundary in: ${file}`);
    }
});

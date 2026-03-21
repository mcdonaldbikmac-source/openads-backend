import { createAppClient, viemConnector } from '@farcaster/auth-client';
import { ethers } from 'ethers';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

// The strict whitelist of authorized Admin Custody Wallets
const ADMIN_WALLETS = [
    '0x16522953a383ea7ebda91e906ace289f4ab8614a'.toLowerCase(),
    '0xa0fd1927b7fe5a5d254b63e8abdc9a17000944c9'.toLowerCase()
];

/**
 * Validates the `Authorization` Bearer token containing a Farcaster SIWF JSON payload.
 * Throws an Error if unauthorized, or returns true if mathematically validated.
 */
export async function verifyAdminAuth(req: Request): Promise<boolean> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('[Admin Firewall] Missing or malformed Authorization Bearer token.');
        throw new Error('Unauthorized');
    }

    try {
        // Decode the JSON-stringified op-farcaster-auth payload
        const encodedPayload = authHeader.replace('Bearer ', '');
        const payload = JSON.parse(decodeURIComponent(encodedPayload));
        
        const { message, signature, nonce, fid } = payload;
        
        // Determine if this is a standard Web3 Wallet SIWE or Farcaster SIWF
        if (fid && String(fid).toLowerCase().startsWith('0x')) {
            // Web3 Wallet verification
            if (!signature) throw new Error('Unauthorized');
            const recoveredAddress = ethers.verifyMessage(`Sign to login to OpenAds Network`, signature);
            if (recoveredAddress.toLowerCase() !== String(fid).toLowerCase()) {
                console.error(`[Admin Firewall] MetaMask SIWE Signature mismatch. Expected: ${fid}, Recovered: ${recoveredAddress}`);
                throw new Error('Unauthorized');
            }
        } else {
            // Farcaster SIWF Verification
            if (!message || !signature || !nonce || !fid) {
                console.error('[Admin Firewall] Incomplete Farcaster payload structure.');
                throw new Error('Unauthorized');
            }
            
            const result = await appClient.verifySignInMessage({
                message: message,
                signature: signature as `0x${string}`,
                domain: (message.match(/(.+) wants you to sign in/) || [])[1] || 'openads-backend.vercel.app',
                nonce: nonce,
            });

            if (!result.success) {
                console.error(`[Admin Firewall] SIWF Mathematical Signature verification failed for FID: ${fid}`);
                throw new Error('Unauthorized');
            }
        }

        // 2. Validate against authorized personnel database
        const providedWallet = String(fid).toLowerCase();
        
        if (!ADMIN_WALLETS.includes(providedWallet)) {
            console.error(`[Admin Firewall] Wallet ${providedWallet} is cryptographically valid, but NOT IN ADMIN WHITELIST!`);
            throw new Error('Forbidden');
        }

        return true;
    } catch (err: any) {
        console.error('[Admin Firewall] Authorization Exception:', err.message);
        throw new Error(err.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized');
    }
}

import { AuthService } from '@/services/AuthService';

// The strict whitelist of authorized Admin Custody Wallets
const ADMIN_WALLETS = [
    '0x16522953a383ea7ebda91e906ace289f4ab8614a'.toLowerCase(),
    '0xa0fd1927b7fe5a5d254b63e8abdc9a17000944c9'.toLowerCase()
];

/**
 * Validates the `X-OpenAds-Auth` Base64 token containing a Farcaster SIWF JSON payload.
 * Throws an Error if unauthorized, or returns true if mathematically validated
 * and the user belongs to the elite Admin access tier.
 */
export async function verifyAdminAuth(req: Request): Promise<boolean> {
    try {
        const authObj = await AuthService.verifyBearer(req);
        
        // Ensure FID or wallet address matches the whitelist
        const providedWallet = String(authObj.fid || authObj.address).toLowerCase();
        
        if (!ADMIN_WALLETS.includes(providedWallet)) {
            console.error(`[Admin Firewall] Wallet ${providedWallet} successfully signed SIWF, but NOT IN ADMIN WHITELIST!`);
            throw new Error('Forbidden');
        }

        return true;
    } catch (err: any) {
        console.error('[Admin Firewall] Authorization Exception:', err.message);
        throw new Error(err.message.includes('Forbidden') ? 'Forbidden' : 'Unauthorized');
    }
}

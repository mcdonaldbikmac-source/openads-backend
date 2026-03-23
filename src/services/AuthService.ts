import { ethers } from 'ethers';
import { createAppClient, viemConnector } from '@farcaster/auth-client';
import { NextResponse } from 'next/server';

const appClient = createAppClient({
    ethereum: viemConnector(),
});

/**
 * Authentication Service
 * Resolves the incoming X-OpenAds-Auth bearer payload cryptographically.
 */
export class AuthService {
    
    /**
     * Extracts and thoroughly cryptographically validates the X-OpenAds-Auth header.
     * Returns the verified Auth Object if successful, or throws an Error.
     */
    static async verifyBearer(request: Request, expectedWallet?: string) {
        const authHeader = request.headers.get('x-openads-auth');
        if (!authHeader) {
            throw new Error('Unauthorized: Missing authentication header.');
        }

        let authObj;
        try {
            authObj = JSON.parse(Buffer.from(authHeader, 'base64').toString('utf-8'));
        } catch (e) {
            throw new Error('Unauthorized: Malformed authentication header.');
        }

        const { signature, message, nonce, provider, address, fid, custody } = authObj;
        const signer_wallet = provider === 'farcaster' ? String(fid) : (address || String(fid));

        if (!signature || !signer_wallet) {
            throw new Error('Unauthorized: Missing cryptographic signature sequence.');
        }

        if (expectedWallet && signer_wallet.toLowerCase() !== expectedWallet.toLowerCase()) {
            console.warn(`[Security] IDOR block! ${signer_wallet} attempted access for ${expectedWallet}`);
            throw new Error('Unauthorized: Token identity does not match requested wallet.');
        }

        // Farcaster SIWF Cryptographic Validation
        if (provider === 'farcaster') {
            if (!nonce) throw new Error('DEBUG_TRACE: Farcaster SIWF missing nonce.');
            
            const domainMatch = message?.match(/(.+) wants you to sign in/);
            const extractedDomain = domainMatch ? domainMatch[1] : 'openads-backend.vercel.app';

            const result = await appClient.verifySignInMessage({
                message: message,
                signature: signature as `0x${string}`,
                domain: extractedDomain,
                nonce: nonce,
            });
            
            if (!result.success || result.fid.toString() !== String(fid)) {
                throw new Error('Farcaster Cryptographic Signature Invalid.');
            }
        } else {
            // Web3 Signature Validation
            if (!message) throw new Error('Missing EIP-4361 Web3 Signature Message');
            const recoveredAddress = ethers.verifyMessage(message, signature);
            if (recoveredAddress.toLowerCase() !== signer_wallet.toLowerCase()) {
                throw new Error('Web3 Cryptographic Signature Invalid.');
            }
        }

        return authObj;
    }
    
    /**
     * Standardized helper to format NextResponse blocks for Auth Error trapping
     */
    static generateErrorResponse(err: any) {
        let msg = err.message || 'Unknown authentication failure';
        let status = msg.includes('Unauthorized') || msg.includes('Invalid') || msg.includes('TRACE') ? 401 : 403;
        return NextResponse.json({ error: msg }, { status });
    }
}

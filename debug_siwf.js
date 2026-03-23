require('dotenv').config({ path: '.env.local' });
const { createAppClient, viemConnector } = require('@farcaster/auth-client');
const appClient = createAppClient({ ethereum: viemConnector() });

// Mock the exact payload that the UI says it sends
const message = "openads.vercel.app wants you to sign in with your Ethereum account:\n0x18B8015525D0Edf23bc8D8A88ebD7203E70d2938\n\nFarcaster Auth\n\nURI: https://openads.vercel.app\nVersion: 1\nChain ID: 10\nNonce: 2q4Xy9R5B8Z1T0W6V\nIssued At: 2024-03-24T00:00:00.000Z";
const signature = "0x..."; // Fake signature for script load test
const domainMatch = message.match(/(.+) wants you to sign in/);
console.log("Extracted Domain:", domainMatch ? domainMatch[1] : 'FALLBACK');

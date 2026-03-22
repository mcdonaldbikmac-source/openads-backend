const { createAppClient, viemConnector } = require('@farcaster/auth-client');
console.log(Object.keys(createAppClient({ethereum: viemConnector()})));

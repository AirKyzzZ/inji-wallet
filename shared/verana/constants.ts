export const VERANA_RESOLVER_URL = 'https://resolver.testnet.verana.network';
export const VERANA_API_URL = 'https://api.testnet.verana.network';

// The registry these endpoints answer for. An absent flag must never be able to claim production
// trust, so testnet is the default and a production build has to say so explicitly.
export const IS_VERANA_TESTNET = true;

export const veranaLog = (scope: string) => (message: string) =>
  console.log(`[verana:${scope}] ${message}`);

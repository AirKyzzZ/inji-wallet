export const VERANA_RESOLVER_URL = 'https://resolver.testnet.verana.network';
export const VERANA_API_URL = 'https://api.testnet.verana.network';

// The registry these endpoints answer for. An absent flag must never be able to claim production
// trust, so testnet is the default and a production build has to say so explicitly.
export const IS_VERANA_TESTNET = true;

// console.warn, not console.log: release builds strip log but keep warn and error, and these
// lines are the only window into an interop failure on a device.
export const veranaLog = (scope: string) => (message: string) =>
  console.warn(`[verana:${scope}] ${message}`);

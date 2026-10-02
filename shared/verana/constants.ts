export type VeranaNetwork = {
  id: string;
  name: string;
  indexerUrl: string;
  explorerUrl?: string;
  production: boolean;
  trustedEcsEcosystemDids?: Array<string>;
};

export const VERANA_NETWORKS: Array<VeranaNetwork> = [
  {
    id: 'vna-devnet-1',
    name: 'Devnet',
    indexerUrl: 'https://idx.devnet.verana.network',
    explorerUrl: 'https://explorer.devnet.verana.network',
    production: false,
  },
  {
    id: 'vna-testnet-1',
    name: 'Testnet',
    indexerUrl: 'https://idx.testnet.verana.network',
    explorerUrl: 'https://explorer.testnet.verana.network',
    production: false,
  },
];

export const veranaNetworkById = (id: string): VeranaNetwork | undefined =>
  VERANA_NETWORKS.find(network => network.id === id);

// console.warn, not console.log: release builds strip log but keep warn and error, and these
// lines are the only window into an interop failure on a device.
export const veranaLog = (scope: string) => (message: string) =>
  console.warn(`[verana:${scope}] ${message}`);

export const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timeout);
  }
};

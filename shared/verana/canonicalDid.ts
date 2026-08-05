import {veranaLog} from './constants';

const debug = veranaLog('canonicalDid');

const RESOLUTION_TIMEOUT_MS = 10000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// did:web:host:a:b -> https://host/a/b/did.json, host-only -> /.well-known/did.json
export const didWebDocumentUrl = (did: string): string | undefined => {
  const identifier = did.startsWith('did:web:')
    ? did.slice('did:web:'.length)
    : undefined;
  if (!identifier) {
    return undefined;
  }

  const [host, ...path] = identifier.split(':').map(decodeURIComponent);
  if (!host) {
    return undefined;
  }
  return path.length
    ? `https://${host}/${path.join('/')}/did.json`
    : `https://${host}/.well-known/did.json`;
};

/**
 * The DID the Verana registry knows this counterparty by.
 *
 * A did:webvh agent also publishes a parallel did:web document, and wallets whose request
 * verification cannot resolve did:webvh identify it by that did:web name instead. Only the
 * did:webvh form is registered, so the parallel document's `alsoKnownAs` is followed back before
 * anything is asked of the registry. Any other DID, and any failure, is used as given.
 */
export const canonicalVeranaDid = async (
  did?: string,
): Promise<string | undefined> => {
  if (!did || !did.startsWith('did:web:')) {
    return did;
  }

  const url = didWebDocumentUrl(did);
  if (!url) {
    return did;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLUTION_TIMEOUT_MS);
  try {
    const response = await fetch(url, {signal: controller.signal});
    if (!response.ok) {
      debug(`${url} returned ${response.status}`);
      return did;
    }

    const document: unknown = await response.json();
    const alsoKnownAs = isRecord(document) ? document.alsoKnownAs : undefined;
    if (!Array.isArray(alsoKnownAs)) {
      return did;
    }

    const webvh = alsoKnownAs.find(
      (entry): entry is string =>
        typeof entry === 'string' && entry.startsWith('did:webvh:'),
    );
    return webvh ?? did;
  } catch (error) {
    debug(`could not read ${url}: ${error}`);
    return did;
  } finally {
    clearTimeout(timeout);
  }
};

import {didWebDocumentUrl} from './canonicalDid';
import {fetchWithTimeout, veranaLog} from './constants';

const debug = veranaLog('didDocument');

const RESOLUTION_TIMEOUT_MS = 10000;

export type VerificationMethod = {
  id: string;
  type?: string;
  publicKeyJwk?: Record<string, unknown>;
  publicKeyMultibase?: string;
};

export type DidDocument = {
  id: string;
  verificationMethod: Array<VerificationMethod>;
  assertionMethod: Array<string | VerificationMethod>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isResolvableDid = (did: string): boolean =>
  did.startsWith('did:web:') || did.startsWith('did:webvh:');

export const didWebvhLogUrl = (did: string): string | undefined => {
  const [, , , host, ...path] = did.split(':');
  if (!did.startsWith('did:webvh:') || !host) return undefined;
  const base = `https://${decodeURIComponent(host)}`;
  return path.length
    ? `${base}/${path.map(decodeURIComponent).join('/')}/did.jsonl`
    : `${base}/.well-known/did.jsonl`;
};

const absoluteId = (did: string, id: string): string =>
  id.startsWith('#') ? `${did}${id}` : id;

const toVerificationMethod = (
  did: string,
  value: unknown,
): VerificationMethod | undefined => {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined;
  return {
    id: absoluteId(did, value.id),
    type: typeof value.type === 'string' ? value.type : undefined,
    publicKeyJwk: isRecord(value.publicKeyJwk) ? value.publicKeyJwk : undefined,
    publicKeyMultibase:
      typeof value.publicKeyMultibase === 'string'
        ? value.publicKeyMultibase
        : undefined,
  };
};

export const parseDidDocument = (
  did: string,
  value: unknown,
): DidDocument | undefined => {
  if (!isRecord(value) || value.id !== did) return undefined;
  const methods = Array.isArray(value.verificationMethod)
    ? value.verificationMethod
        .map(method => toVerificationMethod(did, method))
        .filter((method): method is VerificationMethod => Boolean(method))
    : [];
  const assertionMethod = Array.isArray(value.assertionMethod)
    ? value.assertionMethod.flatMap(entry =>
        typeof entry === 'string'
          ? [absoluteId(did, entry)]
          : toVerificationMethod(did, entry) ?? [],
      )
    : [];
  return {id: did, verificationMethod: methods, assertionMethod};
};

export const assertionMethods = (
  document: DidDocument,
): Array<VerificationMethod> =>
  document.assertionMethod.flatMap(entry =>
    typeof entry === 'string'
      ? document.verificationMethod.filter(method => method.id === entry)
      : [entry],
  );

const lastLogState = (log: string): unknown => {
  const lines = log.split('\n').filter(line => line.trim());
  const entry: unknown = JSON.parse(lines[lines.length - 1] ?? 'null');
  return isRecord(entry) ? entry.state : undefined;
};

export const resolveDidDocument = async (
  did: string,
): Promise<DidDocument | undefined> => {
  const url = did.startsWith('did:webvh:')
    ? didWebvhLogUrl(did)
    : didWebDocumentUrl(did);
  if (!url) return undefined;

  try {
    const response = await fetchWithTimeout(url, {}, RESOLUTION_TIMEOUT_MS);
    if (!response.ok) {
      debug(`${url} returned ${response.status}`);
      return undefined;
    }
    const body = await response.text();
    return parseDidDocument(
      did,
      did.startsWith('did:webvh:') ? lastLogState(body) : JSON.parse(body),
    );
  } catch (error) {
    debug(`could not resolve ${did}: ${error}`);
    return undefined;
  }
};

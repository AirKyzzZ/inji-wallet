import {veranaLog} from './constants';

const debug = veranaLog('issuerDid');

const METADATA_TIMEOUT_MS = 15000;

const decodeSegment = (
  segment: string,
): Record<string, unknown> | undefined => {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(
      padded + '='.repeat((4 - (padded.length % 4)) % 4),
      'base64',
    ).toString('utf8');
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/** OID4VCI signed metadata names its signer in the JWS `kid`, which is how a Verana
 *  demo issuer states the DID the registry knows it by. Unsigned metadata names nobody. */
export const didFromSignedIssuerMetadata = (
  metadata?: string,
): string | undefined => {
  const parts = metadata?.trim().split('.');
  if (!parts || parts.length !== 3) return undefined;

  const header = decodeSegment(parts[0]);
  const kid = header?.kid;
  if (typeof kid !== 'string' || !kid.startsWith('did:')) return undefined;
  return kid.split('#')[0];
};

export const resolveIssuerDid = async (
  credentialIssuerHost?: string,
): Promise<string | undefined> => {
  if (!credentialIssuerHost) return undefined;

  const url = `${credentialIssuerHost.replace(
    /\/+$/,
    '',
  )}/.well-known/openid-credential-issuer`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {Accept: 'application/jwt'},
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    return didFromSignedIssuerMetadata(await response.text());
  } catch (error) {
    debug(`could not read signed metadata from ${url}: ${error}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

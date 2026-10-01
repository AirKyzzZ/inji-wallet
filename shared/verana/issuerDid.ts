import {ed25519} from '@noble/curves/ed25519';
import {p256} from '@noble/curves/p256';
import {sha256} from '@noble/hashes/sha256';
import {Buffer} from 'buffer';
import {fetchWithTimeout, veranaLog} from './constants';
import {base64UrlDecode, ed25519PublicKey, utf8} from './dataIntegrity';
import {
  assertionMethods,
  DidDocument,
  resolveDidDocument,
  VerificationMethod,
} from './didDocument';
import {readLeafCertificate} from './x509';

const debug = veranaLog('issuerDid');

const METADATA_TIMEOUT_MS = 15000;

type SignedMetadata = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: Uint8Array;
  signature: Uint8Array;
};

export type IssuerProof = 'verified' | 'invalid' | 'unavailable';

export type IssuerIdentity = {did?: string; vct?: string; proof?: IssuerProof};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeJson = (segment: string): Record<string, unknown> | undefined => {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(base64UrlDecode(segment)).toString('utf8'),
    );
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const parseSignedMetadata = (jwt?: string): SignedMetadata | undefined => {
  const parts = jwt?.trim().split('.');
  if (!parts || parts.length !== 3) return undefined;
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (!header || !payload) return undefined;
  return {
    header,
    payload,
    signingInput: utf8(`${parts[0]}.${parts[1]}`),
    signature: base64UrlDecode(parts[2]),
  };
};

const leafCertificate = (header: Record<string, unknown>) => {
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || typeof x5c[0] !== 'string') return undefined;
  try {
    return readLeafCertificate(new Uint8Array(Buffer.from(x5c[0], 'base64')));
  } catch (error) {
    debug(`unreadable x5c leaf: ${error}`);
    return undefined;
  }
};

const claimedDid = (metadata: SignedMetadata): string | undefined => {
  const certificate = leafCertificate(metadata.header);
  if (certificate) {
    return certificate.uris.find(uri => uri.startsWith('did:'))?.split('#')[0];
  }
  const kid = metadata.header.kid;
  return typeof kid === 'string' && kid.startsWith('did:')
    ? kid.split('#')[0]
    : undefined;
};

export const didFromSignedIssuerMetadata = (
  jwt?: string,
): string | undefined => {
  const metadata = parseSignedMetadata(jwt);
  return metadata ? claimedDid(metadata) : undefined;
};

export const vctFromSignedIssuerMetadata = (
  jwt?: string,
  configurationIds?: Array<string>,
): string | undefined => {
  const configurations =
    parseSignedMetadata(jwt)?.payload.credential_configurations_supported;
  if (!isRecord(configurations)) return undefined;

  const vctOf = (configuration: unknown) =>
    isRecord(configuration) && typeof configuration.vct === 'string'
      ? configuration.vct
      : undefined;

  if (configurationIds?.length === 1) {
    return vctOf(configurations[configurationIds[0]]);
  }
  const vcts = Object.values(configurations)
    .map(vctOf)
    .filter((vct): vct is string => Boolean(vct));
  return vcts.length === 1 ? vcts[0] : undefined;
};

const p256Point = (jwk?: Record<string, unknown>): Uint8Array | undefined =>
  jwk?.kty === 'EC' &&
  jwk.crv === 'P-256' &&
  typeof jwk.x === 'string' &&
  typeof jwk.y === 'string'
    ? new Uint8Array([4, ...base64UrlDecode(jwk.x), ...base64UrlDecode(jwk.y)])
    : undefined;

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

const verifyWith = (
  metadata: SignedMetadata,
  method: VerificationMethod,
): boolean => {
  const alg = metadata.header.alg;
  try {
    if (alg === 'ES256') {
      const point = p256Point(method.publicKeyJwk);
      return Boolean(
        point &&
          p256.verify(
            metadata.signature,
            sha256(metadata.signingInput),
            point,
            {
              prehash: false,
              format: 'compact',
            },
          ),
      );
    }
    if (alg === 'EdDSA') {
      const key = ed25519PublicKey(method);
      return Boolean(
        key && ed25519.verify(metadata.signature, metadata.signingInput, key),
      );
    }
  } catch (error) {
    debug(`signature check failed: ${error}`);
  }
  return false;
};

const signingMethod = (
  metadata: SignedMetadata,
  document: DidDocument,
): VerificationMethod | undefined => {
  const certificate = leafCertificate(metadata.header);
  if (certificate) {
    return assertionMethods(document).find(method => {
      const point = p256Point(method.publicKeyJwk);
      return point && sameBytes(point, certificate.p256PublicKey);
    });
  }
  return assertionMethods(document).find(
    method => method.id === metadata.header.kid,
  );
};

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const namesIssuer = (
  payload: Record<string, unknown>,
  credentialIssuer: string,
): boolean => {
  const named = [payload.credential_issuer, payload.sub].filter(
    (value): value is string => typeof value === 'string',
  );
  return (
    named.length > 0 &&
    named.every(
      value =>
        withoutTrailingSlash(value) === withoutTrailingSlash(credentialIssuer),
    )
  );
};

export const verifyIssuerMetadata = async (
  jwt: string,
  credentialIssuer: string,
): Promise<{did?: string; proof?: IssuerProof}> => {
  const metadata = parseSignedMetadata(jwt);
  const did = metadata && claimedDid(metadata);
  if (!metadata || !did) return {};

  const exp = metadata.payload.exp;
  if (
    !namesIssuer(metadata.payload, credentialIssuer) ||
    (typeof exp === 'number' && exp * 1000 < Date.now())
  ) {
    return {did, proof: 'invalid'};
  }

  const document = await resolveDidDocument(did);
  if (!document) return {did, proof: 'unavailable'};

  const method = signingMethod(metadata, document);
  return {
    did,
    proof: method && verifyWith(metadata, method) ? 'verified' : 'invalid',
  };
};

export const signedMetadataUrls = (credentialIssuer: string): Array<string> => {
  const issuer = withoutTrailingSlash(credentialIssuer);
  const match = /^(https:\/\/[^/]+)(\/.*)?$/.exec(issuer);
  if (!match) return [];
  const [, origin, path] = match;
  return path
    ? [
        `${origin}/.well-known/openid-credential-issuer${path}`,
        `${issuer}/.well-known/openid-credential-issuer`,
      ]
    : [`${origin}/.well-known/openid-credential-issuer`];
};

const fetchSignedMetadata = async (
  credentialIssuer: string,
): Promise<string | undefined> => {
  for (const url of signedMetadataUrls(credentialIssuer)) {
    try {
      const response = await fetchWithTimeout(
        url,
        {headers: {Accept: 'application/jwt'}},
        METADATA_TIMEOUT_MS,
      );
      const body = response.ok ? (await response.text()).trim() : '';
      if (parseSignedMetadata(body)) return body;
    } catch (error) {
      debug(`could not read signed metadata from ${url}: ${error}`);
    }
  }
  return undefined;
};

export const configurationIdsFromOffer = async (
  offer?: string,
): Promise<Array<string> | undefined> => {
  const query = offer?.split('?')[1];
  if (!query) return undefined;
  const params = new Map(
    query.split('&').map(pair => {
      const [key, value = ''] = pair.split('=');
      return [key, decodeURIComponent(value)] as const;
    }),
  );
  try {
    const inline = params.get('credential_offer');
    const uri = params.get('credential_offer_uri');
    const body: unknown = inline
      ? JSON.parse(inline)
      : uri?.startsWith('https://')
      ? await (await fetchWithTimeout(uri, {}, METADATA_TIMEOUT_MS)).json()
      : undefined;
    const ids = isRecord(body) ? body.credential_configuration_ids : undefined;
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : undefined;
  } catch (error) {
    debug(`could not read the credential offer: ${error}`);
    return undefined;
  }
};

export const resolveIssuerIdentity = async (
  credentialIssuer?: string,
  offer?: string,
): Promise<IssuerIdentity> => {
  if (!credentialIssuer) return {};
  const jwt = await fetchSignedMetadata(credentialIssuer);
  if (!jwt) return {};

  const [identity, configurationIds] = await Promise.all([
    verifyIssuerMetadata(jwt, credentialIssuer),
    configurationIdsFromOffer(offer),
  ]);
  return {
    ...identity,
    vct: vctFromSignedIssuerMetadata(jwt, configurationIds),
  };
};

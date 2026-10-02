import {sha256} from '@noble/hashes/sha256';
import {Buffer} from 'buffer';
import {veranaLog} from './constants';
import {base64UrlDecode} from './dataIntegrity';
import {
  assertionMethods,
  authenticationMethods,
  resolveDidDocument,
} from './didDocument';
import {IssuerProof, methodWithCertificateKey} from './issuerDid';
import {CertificateKey, readLeafCertificate} from './x509';

const debug = veranaLog('verifierDid');

const X509_HASH_PREFIX = 'x509_hash:';

export type VerifierIdentity = {did?: string; proof?: IssuerProof};

const readLeaf = (
  certificateChain?: Array<string>,
): {der: Uint8Array; certificate: CertificateKey} | undefined => {
  const leaf = certificateChain?.[0];
  if (typeof leaf !== 'string') return undefined;
  const der = new Uint8Array(Buffer.from(leaf, 'base64'));
  try {
    return {der, certificate: readLeafCertificate(der)};
  } catch (error) {
    debug(`unreadable x5c leaf: ${error}`);
    return undefined;
  }
};

const isLeafHash = (clientId: string, der: Uint8Array): boolean => {
  const hash = clientId.startsWith(X509_HASH_PREFIX)
    ? clientId.slice(X509_HASH_PREFIX.length)
    : clientId;
  return Buffer.from(base64UrlDecode(hash)).equals(Buffer.from(sha256(der)));
};

export const resolveVerifierIdentity = async (
  clientId?: string,
  certificateChain?: Array<string>,
): Promise<VerifierIdentity> => {
  const leaf = readLeaf(certificateChain);
  const did = leaf?.certificate.uris
    .find(uri => uri.startsWith('did:'))
    ?.split('#')[0];
  if (!clientId || !leaf || !did) return {};
  if (!isLeafHash(clientId, leaf.der)) return {did, proof: 'invalid'};

  const document = await resolveDidDocument(did);
  if (!document) return {did, proof: 'unavailable'};

  const method = methodWithCertificateKey(
    [...authenticationMethods(document), ...assertionMethods(document)],
    leaf.certificate,
  );
  return {did, proof: method ? 'verified' : 'invalid'};
};

import {ed25519} from '@noble/curves/ed25519';
import {Buffer} from 'buffer';
import {sha256} from '@noble/hashes/sha256';
import {assertionMethods, DidDocument, VerificationMethod} from './didDocument';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ED25519_MULTICODEC = [0xed, 0x01];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const utf8 = (value: string): Uint8Array =>
  new Uint8Array(Buffer.from(value, 'utf8'));

export const base64UrlDecode = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(
    Buffer.from(base64 + '='.repeat((4 - (base64.length % 4)) % 4), 'base64'),
  );
};

export const canonicalize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (isRecord(value)) {
    const members = Object.keys(value)
      .filter(key => value[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
};

export const base58btcDecode = (value: string): Uint8Array => {
  let number = BigInt(0);
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error(`invalid base58 character ${character}`);
    number = number * BigInt(58) + BigInt(digit);
  }
  const bytes: Array<number> = [];
  while (number > BigInt(0)) {
    bytes.unshift(Number(number % BigInt(256)));
    number /= BigInt(256);
  }
  for (const character of value) {
    if (character !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
};

export const ed25519PublicKey = (
  method: VerificationMethod,
): Uint8Array | undefined => {
  const multibase = method.publicKeyMultibase;
  if (multibase?.startsWith('z')) {
    const key = base58btcDecode(multibase.slice(1));
    return key.length === 34 &&
      key[0] === ED25519_MULTICODEC[0] &&
      key[1] === ED25519_MULTICODEC[1]
      ? key.subarray(2)
      : undefined;
  }
  const jwk = method.publicKeyJwk;
  if (
    jwk?.kty === 'OKP' &&
    jwk.crv === 'Ed25519' &&
    typeof jwk.x === 'string'
  ) {
    return base64UrlDecode(jwk.x);
  }
  return undefined;
};

export const issuerOf = (credential: Record<string, unknown>) => {
  const issuer = credential.issuer;
  if (typeof issuer === 'string') return issuer;
  return isRecord(issuer) && typeof issuer.id === 'string'
    ? issuer.id
    : undefined;
};

export const verifyEddsaJcs2022 = (
  document: Record<string, unknown>,
  issuerDocument: DidDocument,
): boolean => {
  const {proof, ...unsecured} = document;
  if (!isRecord(proof)) return false;
  const {proofValue, ...proofConfig} = proof;
  if (
    proof.type !== 'DataIntegrityProof' ||
    proof.cryptosuite !== 'eddsa-jcs-2022' ||
    proof.proofPurpose !== 'assertionMethod' ||
    typeof proofValue !== 'string' ||
    !proofValue.startsWith('z') ||
    issuerOf(unsecured) !== issuerDocument.id
  ) {
    return false;
  }

  const method = assertionMethods(issuerDocument).find(
    candidate => candidate.id === proof.verificationMethod,
  );
  const publicKey = method && ed25519PublicKey(method);
  if (!publicKey) return false;

  if (unsecured['@context'] !== undefined) {
    proofConfig['@context'] = unsecured['@context'];
  }
  const hashData = new Uint8Array([
    ...sha256(utf8(canonicalize(proofConfig))),
    ...sha256(utf8(canonicalize(unsecured))),
  ]);
  try {
    return ed25519.verify(
      base58btcDecode(proofValue.slice(1)),
      hashData,
      publicKey,
    );
  } catch {
    return false;
  }
};

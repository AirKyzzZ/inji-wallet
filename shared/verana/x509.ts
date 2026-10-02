import {Buffer} from 'buffer';

type DerNode = {tag: number; start: number; end: number};

const SUBJECT_ALT_NAME_OID = '551d11';
const EC_PUBLIC_KEY_OID = '2a8648ce3d0201';
const P256_OID = '2a8648ce3d030107';
const URI_NAME_TAG = 0x86;
const EXTENSIONS_TAG = 0xa3;
const VERSION_TAG = 0xa0;

const readNode = (der: Uint8Array, offset: number): DerNode => {
  let length = der[offset + 1];
  let header = 2;
  if (length & 0x80) {
    const bytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < bytes; i++) {
      length = length * 256 + der[offset + 2 + i];
    }
    header += bytes;
  }
  const end = offset + header + length;
  if (end > der.length) throw new Error('truncated DER');
  return {tag: der[offset], start: offset + header, end};
};

const childrenOf = (der: Uint8Array, node: DerNode): Array<DerNode> => {
  const children: Array<DerNode> = [];
  for (let offset = node.start; offset < node.end; ) {
    const child = readNode(der, offset);
    children.push(child);
    offset = child.end;
  }
  return children;
};

const hex = (der: Uint8Array, node: DerNode): string =>
  Buffer.from(der.subarray(node.start, node.end)).toString('hex');

export type CertificateKey = {
  p256PublicKey: Uint8Array;
  uris: Array<string>;
};

export const readLeafCertificate = (der: Uint8Array): CertificateKey => {
  const [tbs] = childrenOf(der, readNode(der, 0));
  const fields = childrenOf(der, tbs);
  const first = fields[0]?.tag === VERSION_TAG ? 1 : 0;
  const spki = fields[first + 5];
  const extensions = fields.slice(first + 6);
  if (!spki) throw new Error('certificate has no public key');

  const [algorithm, bitString] = childrenOf(der, spki);
  const [keyType, curve] = childrenOf(der, algorithm);
  if (hex(der, keyType) !== EC_PUBLIC_KEY_OID || hex(der, curve) !== P256_OID) {
    throw new Error('certificate key is not P-256');
  }
  const p256PublicKey = der.subarray(bitString.start + 1, bitString.end);

  const uris: Array<string> = [];
  for (const wrapper of extensions) {
    if (wrapper.tag !== EXTENSIONS_TAG) continue;
    for (const extension of childrenOf(der, childrenOf(der, wrapper)[0])) {
      const parts = childrenOf(der, extension);
      if (hex(der, parts[0]) !== SUBJECT_ALT_NAME_OID) continue;
      const names = readNode(der, parts[parts.length - 1].start);
      for (const name of childrenOf(der, names)) {
        if (name.tag === URI_NAME_TAG) {
          uris.push(
            Buffer.from(der.subarray(name.start, name.end)).toString('utf8'),
          );
        }
      }
    }
  }
  return {p256PublicKey, uris};
};

import {
  base58btcDecode,
  canonicalize,
  verifyEddsaJcs2022,
} from './dataIntegrity';
import {parseDidDocument} from './didDocument';
import {
  ECOSYSTEM_DID,
  ECOSYSTEM_DID_DOCUMENT,
  VTJSC,
} from './__fixtures__/devnet';

const ecosystemDocument = parseDidDocument(
  ECOSYSTEM_DID,
  ECOSYSTEM_DID_DOCUMENT,
)!;

describe('canonicalize', () => {
  it('sorts keys at every depth and drops undefined members', () => {
    expect(
      canonicalize({b: 1, a: {d: [true, null], c: 'x'}, e: undefined}),
    ).toBe('{"a":{"c":"x","d":[true,null]},"b":1}');
  });

  it('serializes numbers the way RFC 8785 does', () => {
    expect(canonicalize([1e21, 0.000001, -0, 10.5])).toBe(
      '[1e+21,0.000001,0,10.5]',
    );
  });
});

describe('base58btcDecode', () => {
  it('keeps leading zero bytes', () => {
    expect(Array.from(base58btcDecode('112'))).toEqual([0, 0, 1]);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base58btcDecode('0OIl')).toThrow();
  });
});

describe('verifyEddsaJcs2022', () => {
  it('verifies the devnet VTJSC against the ecosystem DID document', () => {
    expect(verifyEddsaJcs2022(VTJSC, ecosystemDocument)).toBe(true);
  });

  it('rejects a VTJSC whose subject was changed', () => {
    const tampered = {
      ...VTJSC,
      credentialSubject: {
        ...VTJSC.credentialSubject,
        jsonSchema: {$ref: 'vpr:verana:vna-devnet-1:cs:9'},
      },
    };
    expect(verifyEddsaJcs2022(tampered, ecosystemDocument)).toBe(false);
  });

  it('rejects a key that is not an assertion method of the issuer', () => {
    const withoutAssertion = {...ecosystemDocument, assertionMethod: []};
    expect(verifyEddsaJcs2022(VTJSC, withoutAssertion)).toBe(false);
  });

  it('rejects a VTJSC that names another issuer', () => {
    expect(
      verifyEddsaJcs2022(
        {...VTJSC, issuer: 'did:webvh:QmOther:other.example'},
        ecosystemDocument,
      ),
    ).toBe(false);
  });

  it('rejects another cryptosuite', () => {
    expect(
      verifyEddsaJcs2022(
        {...VTJSC, proof: {...VTJSC.proof, cryptosuite: 'eddsa-rdfc-2022'}},
        ecosystemDocument,
      ),
    ).toBe(false);
  });
});

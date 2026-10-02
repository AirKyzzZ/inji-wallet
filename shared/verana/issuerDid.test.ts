import {
  didFromSignedIssuerMetadata,
  resolveIssuerIdentity,
  signedMetadataUrls,
  vctFromSignedIssuerMetadata,
  verifyIssuerMetadata,
} from './issuerDid';
import {
  CREDENTIAL_ISSUER,
  ISSUER_DID,
  ISSUER_DID_DOCUMENT,
  SIGNED_METADATA,
  VCT,
} from './__fixtures__/devnet';
import {didLog, installFetch} from './__fixtures__/fetch';

const ISSUER_LOG =
  'https://demo-issuer-accredited.playground.devnet.verana.network/.well-known/did.jsonl';
const SPEC_METADATA_URL =
  'https://demo-issuer-accredited.playground.devnet.verana.network/.well-known/openid-credential-issuer/oid4vci/issuer';

const b64u = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const unsignedJwt = (header: object, payload: object) =>
  `${b64u(header)}.${b64u(payload)}.c2ln`;

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('didFromSignedIssuerMetadata', () => {
  it('reads the DID from the URI SAN of the x5c leaf', () => {
    expect(didFromSignedIssuerMetadata(SIGNED_METADATA)).toBe(ISSUER_DID);
  });

  it('falls back to a DID kid when there is no x5c', () => {
    expect(
      didFromSignedIssuerMetadata(
        unsignedJwt({alg: 'ES256', kid: `${ISSUER_DID}#key-1`}, {}),
      ),
    ).toBe(ISSUER_DID);
  });

  it('ignores unsigned and malformed metadata', () => {
    expect(didFromSignedIssuerMetadata('{"credential_issuer":"x"}')).toBe(
      undefined,
    );
    expect(didFromSignedIssuerMetadata('a.b.c')).toBeUndefined();
    expect(didFromSignedIssuerMetadata(undefined)).toBeUndefined();
  });
});

describe('vctFromSignedIssuerMetadata', () => {
  const twoConfigurations = unsignedJwt(
    {alg: 'ES256'},
    {
      credential_configurations_supported: {
        a: {vct: 'https://issuer.example/vct/a'},
        b: {vct: 'https://issuer.example/vct/b'},
      },
    },
  );

  it('reads the vct of the only configuration', () => {
    expect(vctFromSignedIssuerMetadata(SIGNED_METADATA)).toBe(VCT);
  });

  it('takes the configuration the offer names', () => {
    expect(vctFromSignedIssuerMetadata(twoConfigurations, ['b'])).toBe(
      'https://issuer.example/vct/b',
    );
  });

  it('refuses to guess between several configurations', () => {
    expect(vctFromSignedIssuerMetadata(twoConfigurations)).toBeUndefined();
  });
});

describe('signedMetadataUrls', () => {
  it('inserts the well-known segment before the issuer path first', () => {
    expect(signedMetadataUrls(`${CREDENTIAL_ISSUER}/`)).toEqual([
      SPEC_METADATA_URL,
      `${CREDENTIAL_ISSUER}/.well-known/openid-credential-issuer`,
    ]);
  });

  it('asks a host-only issuer once', () => {
    expect(signedMetadataUrls('https://issuer.example')).toEqual([
      'https://issuer.example/.well-known/openid-credential-issuer',
    ]);
  });
});

describe('verifyIssuerMetadata', () => {
  it('proves the issuer controls the DID its certificate names', async () => {
    installFetch({[ISSUER_LOG]: didLog(ISSUER_DID_DOCUMENT)});

    await expect(
      verifyIssuerMetadata(SIGNED_METADATA, CREDENTIAL_ISSUER),
    ).resolves.toEqual({did: ISSUER_DID, proof: 'verified'});
  });

  it('rejects metadata replayed by another credential issuer', async () => {
    installFetch({[ISSUER_LOG]: didLog(ISSUER_DID_DOCUMENT)});

    await expect(
      verifyIssuerMetadata(SIGNED_METADATA, 'https://impostor.example/issuer'),
    ).resolves.toEqual({did: ISSUER_DID, proof: 'invalid'});
  });

  it('rejects a certificate key the DID document does not list', async () => {
    installFetch({
      [ISSUER_LOG]: didLog({
        ...ISSUER_DID_DOCUMENT,
        assertionMethod: ISSUER_DID_DOCUMENT.assertionMethod.filter(
          (id: string) => !id.endsWith('#openid4vc-development-issuer'),
        ),
      }),
    });

    await expect(
      verifyIssuerMetadata(SIGNED_METADATA, CREDENTIAL_ISSUER),
    ).resolves.toEqual({did: ISSUER_DID, proof: 'invalid'});
  });

  it('cannot decide when the DID document does not answer', async () => {
    installFetch({[ISSUER_LOG]: new Error('network')});

    await expect(
      verifyIssuerMetadata(SIGNED_METADATA, CREDENTIAL_ISSUER),
    ).resolves.toEqual({did: ISSUER_DID, proof: 'unavailable'});
  });
});

describe('resolveIssuerIdentity', () => {
  const OFFER_URI = 'https://issuer.example/offers/1';
  const VTJSC_CONFIG =
    'https://playground-demo.playground.devnet.verana.network/vt/schemas-8-jsc.json';

  it('reads the signed metadata, the DID proof and the offered vct', async () => {
    const fetchMock = installFetch({
      [SPEC_METADATA_URL]: {body: SIGNED_METADATA},
      [ISSUER_LOG]: didLog(ISSUER_DID_DOCUMENT),
      [OFFER_URI]: {body: {credential_configuration_ids: [VTJSC_CONFIG]}},
    });

    await expect(
      resolveIssuerIdentity(
        CREDENTIAL_ISSUER,
        `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(
          OFFER_URI,
        )}`,
      ),
    ).resolves.toEqual({did: ISSUER_DID, proof: 'verified', vct: VCT});
    expect(fetchMock.mock.calls[0]).toEqual([
      SPEC_METADATA_URL,
      expect.objectContaining({headers: {Accept: 'application/jwt'}}),
    ]);
  });

  it('falls back to the metadata path under the issuer', async () => {
    installFetch({
      [`${CREDENTIAL_ISSUER}/.well-known/openid-credential-issuer`]: {
        body: SIGNED_METADATA,
      },
      [ISSUER_LOG]: didLog(ISSUER_DID_DOCUMENT),
    });

    await expect(
      resolveIssuerIdentity(CREDENTIAL_ISSUER),
    ).resolves.toMatchObject({did: ISSUER_DID, proof: 'verified'});
  });

  it('returns nothing for an issuer that does not sign its metadata', async () => {
    installFetch({[SPEC_METADATA_URL]: {body: {credential_issuer: 'x'}}});

    await expect(resolveIssuerIdentity(CREDENTIAL_ISSUER)).resolves.toEqual({});
  });

  it('returns nothing without an issuer', async () => {
    await expect(resolveIssuerIdentity(undefined)).resolves.toEqual({});
  });
});

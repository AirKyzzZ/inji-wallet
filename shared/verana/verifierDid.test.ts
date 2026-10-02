import {resolveVerifierIdentity} from './verifierDid';
import {
  VERIFIER_CERTIFICATE_CHAIN,
  VERIFIER_CLIENT_ID,
  VERIFIER_DID,
  VERIFIER_DID_DOCUMENT,
} from './__fixtures__/devnetVerifier';
import {didLog, installFetch} from './__fixtures__/fetch';

const VERIFIER_LOG =
  'https://demo-verifier-accredited.playground.devnet.verana.network/.well-known/did.jsonl';
const LEAF_KEY = `${VERIFIER_DID}#openid4vc-development-verifier`;

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('resolveVerifierIdentity', () => {
  it('binds the x5c leaf to the DID that lists its key for authentication', async () => {
    installFetch({[VERIFIER_LOG]: didLog(VERIFIER_DID_DOCUMENT)});

    await expect(
      resolveVerifierIdentity(VERIFIER_CLIENT_ID, VERIFIER_CERTIFICATE_CHAIN),
    ).resolves.toEqual({did: VERIFIER_DID, proof: 'verified'});
  });

  it('reads the hash out of the x509_hash client id prefix', async () => {
    installFetch({[VERIFIER_LOG]: didLog(VERIFIER_DID_DOCUMENT)});

    await expect(
      resolveVerifierIdentity(
        `x509_hash:${VERIFIER_CLIENT_ID}`,
        VERIFIER_CERTIFICATE_CHAIN,
      ),
    ).resolves.toEqual({did: VERIFIER_DID, proof: 'verified'});
  });

  it('accepts the leaf key listed only as an assertion method', async () => {
    installFetch({
      [VERIFIER_LOG]: didLog({
        ...VERIFIER_DID_DOCUMENT,
        authentication: [],
        assertionMethod: [LEAF_KEY],
      }),
    });

    await expect(
      resolveVerifierIdentity(VERIFIER_CLIENT_ID, VERIFIER_CERTIFICATE_CHAIN),
    ).resolves.toEqual({did: VERIFIER_DID, proof: 'verified'});
  });

  it('rejects a DID document that does not list the leaf key', async () => {
    installFetch({
      [VERIFIER_LOG]: didLog({
        ...VERIFIER_DID_DOCUMENT,
        authentication: VERIFIER_DID_DOCUMENT.authentication.filter(
          id => id !== LEAF_KEY,
        ),
      }),
    });

    await expect(
      resolveVerifierIdentity(VERIFIER_CLIENT_ID, VERIFIER_CERTIFICATE_CHAIN),
    ).resolves.toEqual({did: VERIFIER_DID, proof: 'invalid'});
  });

  it('rejects a chain whose leaf does not hash to the client id', async () => {
    const fetchMock = installFetch({
      [VERIFIER_LOG]: didLog(VERIFIER_DID_DOCUMENT),
    });

    await expect(
      resolveVerifierIdentity(
        `x509_hash:${'A'.repeat(43)}`,
        VERIFIER_CERTIFICATE_CHAIN,
      ),
    ).resolves.toEqual({did: VERIFIER_DID, proof: 'invalid'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cannot decide when the DID document does not answer', async () => {
    installFetch({[VERIFIER_LOG]: new Error('network')});

    await expect(
      resolveVerifierIdentity(VERIFIER_CLIENT_ID, VERIFIER_CERTIFICATE_CHAIN),
    ).resolves.toEqual({did: VERIFIER_DID, proof: 'unavailable'});
  });

  it('returns nothing without a certificate chain', async () => {
    await expect(
      resolveVerifierIdentity(VERIFIER_CLIENT_ID, undefined),
    ).resolves.toEqual({});
    await expect(
      resolveVerifierIdentity(`did:web:verifier.example`, []),
    ).resolves.toEqual({});
  });
});

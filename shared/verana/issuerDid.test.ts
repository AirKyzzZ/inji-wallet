import {didFromSignedIssuerMetadata, resolveIssuerDid} from './issuerDid';

const b64u = (value: object) =>
  Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const signedMetadata = (header: object) =>
  `${b64u(header)}.${b64u({credential_issuer: 'https://issuer.example'})}.sig`;

describe('didFromSignedIssuerMetadata', () => {
  const did = 'did:webvh:QmExample:issuer.example';

  it('reads the DID from the kid of a signed metadata JWT', () => {
    expect(
      didFromSignedIssuerMetadata(
        signedMetadata({alg: 'ES256', kid: `${did}#key-1`}),
      ),
    ).toBe(did);
  });

  it('keeps a kid that carries no fragment', () => {
    expect(
      didFromSignedIssuerMetadata(signedMetadata({alg: 'ES256', kid: did})),
    ).toBe(did);
  });

  it('ignores a kid that is not a DID', () => {
    expect(
      didFromSignedIssuerMetadata(
        signedMetadata({alg: 'ES256', kid: 'https://issuer.example/keys/1'}),
      ),
    ).toBeUndefined();
  });

  it('ignores unsigned metadata', () => {
    expect(
      didFromSignedIssuerMetadata(JSON.stringify({credential_issuer: 'x'})),
    ).toBeUndefined();
  });

  it('ignores malformed input rather than throwing', () => {
    expect(didFromSignedIssuerMetadata('a.b.c')).toBeUndefined();
    expect(didFromSignedIssuerMetadata('')).toBeUndefined();
    expect(didFromSignedIssuerMetadata(undefined)).toBeUndefined();
  });
});

describe('resolveIssuerDid', () => {
  const did = 'did:webvh:QmExample:issuer.example';
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('asks the issuer for signed metadata and returns its DID', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => signedMetadata({alg: 'ES256', kid: `${did}#key-1`}),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(resolveIssuerDid('https://issuer.example')).resolves.toBe(did);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://issuer.example/.well-known/openid-credential-issuer',
    );
    expect(init.headers.Accept).toBe('application/jwt');
  });

  it('returns undefined when the issuer does not sign its metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({credential_issuer: 'x'}),
    }) as unknown as typeof fetch;

    await expect(
      resolveIssuerDid('https://issuer.example'),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the issuer is unreachable', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network')) as unknown as typeof fetch;

    await expect(
      resolveIssuerDid('https://issuer.example'),
    ).resolves.toBeUndefined();
  });

  it('returns undefined without a host', async () => {
    await expect(resolveIssuerDid(undefined)).resolves.toBeUndefined();
  });
});

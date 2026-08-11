import {
  extractDidFromClientId,
  fetchVeranaTrustDetails,
  resolveVeranaTrust,
} from './veranaTrustService';

const did = 'did:webvh:example.com';
const mockFetch = jest.fn();

describe('veranaTrustService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as typeof fetch;
  });

  it('extracts a DID from an OID4VP decentralized_identifier client id', () => {
    expect(
      extractDidFromClientId(`decentralized_identifier:${did}#key-1`),
    ).toBe(did);
    expect(extractDidFromClientId('https://verifier.example')).toBeUndefined();
  });

  it('returns only a valid TRUSTED response for the requested DID', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        did,
        trustStatus: 'TRUSTED',
        production: true,
        evaluatedAtBlock: 42,
      }),
    });

    await expect(resolveVeranaTrust(did)).resolves.toEqual({
      did,
      trustStatus: 'TRUSTED',
      production: true,
      evaluatedAtBlock: 42,
    });
  });

  it.each([
    {did: 'did:webvh:other.example', trustStatus: 'TRUSTED', production: true},
    {did, trustStatus: 'TRUSTED', production: 'yes'},
  ])(
    'reports a malformed or mismatched response as UNVERIFIED',
    async response => {
      mockFetch.mockResolvedValue({ok: true, json: async () => response});
      await expect(resolveVeranaTrust(did)).resolves.toEqual({
        did,
        trustStatus: 'UNVERIFIED',
        production: true,
      });
    },
  );

  it('returns a not-trusted verdict unchanged', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({did, trustStatus: 'PARTIAL', production: false}),
    });
    await expect(resolveVeranaTrust(did)).resolves.toEqual({
      did,
      trustStatus: 'PARTIAL',
      production: false,
    });
  });

  it('maps transport failure to UNVERIFIED, never a refusal', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    await expect(resolveVeranaTrust(did)).resolves.toEqual({
      did,
      trustStatus: 'UNVERIFIED',
      production: true,
    });
  });

  it('returns an UNVERIFIED empty dossier when the full fetch fails', async () => {
    mockFetch.mockResolvedValue({ok: false, status: 502});
    await expect(fetchVeranaTrustDetails(did)).resolves.toEqual({
      did,
      trustStatus: 'UNVERIFIED',
      production: true,
      credentials: [],
    });
  });

  it('sanitizes full-detail credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        did,
        trustStatus: 'TRUSTED',
        production: true,
        credentials: [
          {ecsType: 'ECS-ORG', claims: {name: 'Example Org'}},
          null,
        ],
      }),
    });

    await expect(fetchVeranaTrustDetails(did)).resolves.toEqual({
      did,
      trustStatus: 'TRUSTED',
      production: true,
      credentials: [{ecsType: 'ECS-ORG', claims: {name: 'Example Org'}}],
    });
  });
});

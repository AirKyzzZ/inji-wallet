import {canonicalVeranaDid, didWebDocumentUrl} from './canonicalDid';

const WEBVH =
  'did:webvh:QmP6g7:demo-verifier-accredited.playground.testnet.verana.network';
const WEB =
  'did:web:demo-verifier-accredited.playground.testnet.verana.network';

describe('didWebDocumentUrl', () => {
  it('maps a host-only did:web to the well-known document', () => {
    expect(didWebDocumentUrl(WEB)).toBe(
      'https://demo-verifier-accredited.playground.testnet.verana.network/.well-known/did.json',
    );
  });

  it('maps path segments to a nested document', () => {
    expect(didWebDocumentUrl('did:web:example.com:agents:one')).toBe(
      'https://example.com/agents/one/did.json',
    );
  });

  it('decodes an encoded port', () => {
    expect(didWebDocumentUrl('did:web:example.com%3A8443')).toBe(
      'https://example.com:8443/.well-known/did.json',
    );
  });

  it('ignores anything that is not did:web', () => {
    expect(didWebDocumentUrl(WEBVH)).toBeUndefined();
  });
});

describe('canonicalVeranaDid', () => {
  afterEach(() => {
    (global.fetch as jest.Mock | undefined)?.mockReset?.();
  });

  const respondWith = (body: unknown, ok = true) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 404,
      json: async () => body,
    }) as unknown as typeof fetch;
  };

  it('follows alsoKnownAs from the parallel did:web to the registered did:webvh', async () => {
    respondWith({id: WEB, alsoKnownAs: [WEBVH]});
    await expect(canonicalVeranaDid(WEB)).resolves.toBe(WEBVH);
  });

  it('leaves a did:webvh untouched and asks for nothing', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await expect(canonicalVeranaDid(WEBVH)).resolves.toBe(WEBVH);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keeps the did:web when the document names no webvh equivalent', async () => {
    respondWith({id: WEB, alsoKnownAs: ['did:example:other']});
    await expect(canonicalVeranaDid(WEB)).resolves.toBe(WEB);
  });

  it('keeps the did:web when the document has no alsoKnownAs', async () => {
    respondWith({id: WEB});
    await expect(canonicalVeranaDid(WEB)).resolves.toBe(WEB);
  });

  it('keeps the did:web when the document cannot be fetched', async () => {
    respondWith({}, false);
    await expect(canonicalVeranaDid(WEB)).resolves.toBe(WEB);
  });

  it('keeps the did:web when the fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(canonicalVeranaDid(WEB)).resolves.toBe(WEB);
  });

  it('returns undefined when there is no did', async () => {
    await expect(canonicalVeranaDid(undefined)).resolves.toBeUndefined();
  });
});

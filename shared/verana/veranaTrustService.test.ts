import type {VeranaNetwork} from './constants';
import {extractDidFromClientId, resolveVeranaTrust} from './veranaTrustService';
import {installFetch, Route} from './__fixtures__/fetch';

const DID = 'did:webvh:QmService:service.example';

const DEVNET: VeranaNetwork = {
  id: 'vna-devnet-1',
  name: 'Devnet',
  indexerUrl: 'https://idx.devnet.example',
  production: false,
};
const TESTNET: VeranaNetwork = {
  id: 'vna-testnet-1',
  name: 'Testnet',
  indexerUrl: 'https://idx.testnet.example',
  production: false,
};

const resolveUrl = (network: VeranaNetwork) =>
  `${network.indexerUrl}/v4/verifiable-trust/resolve`;

const answer = (trusted: boolean, did = DID): Route => ({
  body: {
    did,
    trusted,
    evaluatedAtTime: '2026-10-01T15:56:44.662Z',
    expiresAtTime: '2027-10-01T00:00:00.000Z',
    ecsCredentials: [
      {
        ecsSchema: 'ServiceCredential',
        ecosystemId: 3,
        credentialSubject: {name: 'Accredited Issuer (demo)'},
      },
      {ecsSchema: 'OrganizationCredential', ecosystemId: 3},
    ],
    presentations: [
      {
        id: 'https://service.example/vp.json',
        vtcCredentials: [],
        unresolvableCredentialIds: ['https://service.example/vtc.json'],
      },
    ],
  },
});

const DID_NOT_FOUND: Route = {
  status: 404,
  body: {error: 'DID not found', code: 404},
};
const ROUTE_NOT_FOUND: Route = {
  status: 404,
  body: {name: 'NotFoundError', message: 'Not found', code: 404},
};

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('resolveVeranaTrust', () => {
  it('asks the v4 resolve endpoint and reads a trusted answer', async () => {
    const fetchMock = installFetch({[resolveUrl(DEVNET)]: answer(true)});

    const resolution = await resolveVeranaTrust(DID, [DEVNET]);

    expect(resolution).toMatchObject({
      did: DID,
      trustStatus: 'TRUSTED',
      network: DEVNET,
      evaluatedAt: '2026-10-01T15:56:44.662Z',
      expiresAt: '2027-10-01T00:00:00.000Z',
      failedCredentialIds: ['https://service.example/vtc.json'],
    });
    expect(resolution.ecsCredentials).toEqual([
      {
        ecsSchema: 'ServiceCredential',
        ecosystemId: 3,
        claims: {name: 'Accredited Issuer (demo)'},
      },
    ]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      did: DID,
      participations: {states: ['ACTIVE', 'EXPIRED', 'REVOKED']},
      presentations: {unresolvableCredentialIds: true},
      ecsCredentials: true,
    });
  });

  it('settles TRUSTED as soon as one network trusts the DID', async () => {
    installFetch({[resolveUrl(DEVNET)]: answer(true)});
    const hanging = jest.fn(() => new Promise(jest.fn()));
    const routed = global.fetch;
    global.fetch = jest.fn((url: string, init?: RequestInit) =>
      url === resolveUrl(TESTNET) ? hanging() : routed(url, init),
    ) as unknown as typeof fetch;

    await expect(
      resolveVeranaTrust(DID, [TESTNET, DEVNET]),
    ).resolves.toMatchObject({trustStatus: 'TRUSTED', network: DEVNET});
  });

  it('is UNTRUSTED when every network answers and none trusts', async () => {
    installFetch({
      [resolveUrl(DEVNET)]: answer(false),
      [resolveUrl(TESTNET)]: DID_NOT_FOUND,
    });

    await expect(
      resolveVeranaTrust(DID, [DEVNET, TESTNET]),
    ).resolves.toMatchObject({
      trustStatus: 'UNTRUSTED',
      reason: 'not-trusted',
      network: DEVNET,
    });
  });

  it('is UNTRUSTED for a DID no network knows', async () => {
    installFetch({[resolveUrl(DEVNET)]: DID_NOT_FOUND});

    await expect(resolveVeranaTrust(DID, [DEVNET])).resolves.toMatchObject({
      trustStatus: 'UNTRUSTED',
      reason: 'not-registered',
    });
  });

  it('is UNVERIFIED when a network without the v4 API cannot answer', async () => {
    installFetch({
      [resolveUrl(DEVNET)]: DID_NOT_FOUND,
      [resolveUrl(TESTNET)]: ROUTE_NOT_FOUND,
    });

    await expect(
      resolveVeranaTrust(DID, [DEVNET, TESTNET]),
    ).resolves.toMatchObject({trustStatus: 'UNVERIFIED'});
  });

  it('is UNVERIFIED on a transport failure or a malformed answer', async () => {
    installFetch({[resolveUrl(DEVNET)]: new Error('network')});
    await expect(resolveVeranaTrust(DID, [DEVNET])).resolves.toMatchObject({
      trustStatus: 'UNVERIFIED',
    });

    installFetch({[resolveUrl(DEVNET)]: answer(true, 'did:webvh:QmOther:x')});
    await expect(resolveVeranaTrust(DID, [DEVNET])).resolves.toMatchObject({
      trustStatus: 'UNVERIFIED',
    });
  });

  it('is UNTRUSTED without asking for a DID that has no DID Document', async () => {
    const fetchMock = installFetch({});

    await expect(
      resolveVeranaTrust('did:key:z6MkExample', [DEVNET]),
    ).resolves.toMatchObject({
      trustStatus: 'UNTRUSTED',
      reason: 'no-did-document',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('holds ECS credentials to the trusted ecosystems of the network', async () => {
    const restricted = {
      ...DEVNET,
      trustedEcsEcosystemDids: ['did:webvh:QmEcs:ecs.example'],
    };
    const ecosystem = (did: string): Route => ({
      body: {ecosystem: {id: 3, did}},
    });

    installFetch({
      [resolveUrl(DEVNET)]: answer(true),
      'https://idx.devnet.example/v4/ecosystem/get/3': ecosystem(
        'did:webvh:QmEcs:ecs.example',
      ),
    });
    await expect(resolveVeranaTrust(DID, [restricted])).resolves.toMatchObject({
      trustStatus: 'TRUSTED',
    });

    installFetch({
      [resolveUrl(DEVNET)]: answer(true),
      'https://idx.devnet.example/v4/ecosystem/get/3': ecosystem(
        'did:webvh:QmRogue:rogue.example',
      ),
    });
    await expect(resolveVeranaTrust(DID, [restricted])).resolves.toMatchObject({
      trustStatus: 'UNTRUSTED',
      reason: 'ecosystem-not-trusted',
    });
  });
});

describe('extractDidFromClientId', () => {
  it('reads a DID from an OID4VP decentralized_identifier client id', () => {
    expect(
      extractDidFromClientId(`decentralized_identifier:${DID}#key-1`),
    ).toBe(DID);
    expect(extractDidFromClientId('https://verifier.example')).toBeUndefined();
  });
});

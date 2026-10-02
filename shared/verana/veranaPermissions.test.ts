import {
  checkVeranaAccreditation,
  parseSchemaRef,
  withinValidity,
} from './veranaPermissions';
import {
  ECOSYSTEM_DID,
  ECOSYSTEM_DID_DOCUMENT,
  ISSUER_DID,
  TYPE_METADATA,
  UNACCREDITED_DID,
  VCT,
  VTJSC,
} from './__fixtures__/devnet';
import {didLog, installFetch, Route} from './__fixtures__/fetch';

const INDEXER = 'https://idx.devnet.verana.network';
const ECOSYSTEM_LOG =
  'https://playground-demo.playground.devnet.verana.network/.well-known/did.jsonl';

const participants = (did: string, role: string): Route => ({
  body: {
    participants:
      did === ISSUER_DID && role === 'ISSUER'
        ? [
            {
              id: 24,
              did,
              role,
              schema_id: 8,
              participant_state: 'ACTIVE',
            },
          ]
        : [],
  },
});

const participantUrl = (did: string, role: string) =>
  `${INDEXER}/v4/participant/list?did=${encodeURIComponent(
    did,
  )}&role=${role}&schema_id=8&participant_state=ACTIVE`;

const devnet = (overrides: Record<string, Route> = {}) =>
  installFetch({
    [VCT]: {body: TYPE_METADATA},
    [TYPE_METADATA.relatedJsonSchemaCredentialId]: {body: VTJSC},
    [ECOSYSTEM_LOG]: didLog(ECOSYSTEM_DID_DOCUMENT),
    [`${INDEXER}/v4/credential-schema/get/8`]: {
      body: {schema: {id: 8, ecosystem_id: 6}},
    },
    [`${INDEXER}/v4/ecosystem/get/6`]: {
      body: {ecosystem: {id: 6, did: ECOSYSTEM_DID}},
    },
    [participantUrl(ISSUER_DID, 'ISSUER')]: participants(ISSUER_DID, 'ISSUER'),
    [participantUrl(ISSUER_DID, 'VERIFIER')]: participants(
      ISSUER_DID,
      'VERIFIER',
    ),
    [participantUrl(UNACCREDITED_DID, 'ISSUER')]: participants(
      UNACCREDITED_DID,
      'ISSUER',
    ),
    [`${INDEXER}/v4/verifiable-trust/resolve`]: {
      body: {
        did: ECOSYSTEM_DID,
        trusted: true,
        ecsCredentials: [
          {
            ecsSchema: 'ServiceCredential',
            credentialSubject: {name: 'Playground Demo'},
          },
        ],
      },
    },
    ...overrides,
  });

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('checkVeranaAccreditation', () => {
  it('grants the accredited devnet issuer through the VTJSC chain', async () => {
    devnet();

    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'issuer', vct: VCT}),
    ).resolves.toMatchObject({
      granted: true,
      credentialName: 'DemoCredential',
      ecosystemName: 'Playground Demo',
    });
  });

  it('refuses the unaccredited devnet issuer', async () => {
    devnet();

    await expect(
      checkVeranaAccreditation({
        did: UNACCREDITED_DID,
        role: 'issuer',
        vct: VCT,
      }),
    ).resolves.toMatchObject({granted: false});
  });

  it('does not let an issuer participant satisfy a verifier check', async () => {
    devnet();

    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'verifier', vct: VCT}),
    ).resolves.toMatchObject({granted: false});
  });

  it('refuses a VTJSC whose proof does not verify', async () => {
    devnet({
      [TYPE_METADATA.relatedJsonSchemaCredentialId]: {
        body: {...VTJSC, validUntil: '2099-01-01T00:00:00.000Z'},
      },
    });

    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'issuer', vct: VCT}),
    ).resolves.toMatchObject({granted: false});
  });

  it('refuses a VTJSC not issued by the ecosystem that owns the schema', async () => {
    devnet({
      [`${INDEXER}/v4/ecosystem/get/6`]: {
        body: {ecosystem: {id: 6, did: 'did:webvh:QmOther:other.example'}},
      },
    });

    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'issuer', vct: VCT}),
    ).resolves.toMatchObject({granted: false});
  });

  it('refuses a credential type that names no schema credential', async () => {
    devnet({[VCT]: {body: {vct: VCT, name: 'DemoCredential'}}});

    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'issuer', vct: VCT}),
    ).resolves.toMatchObject({
      granted: false,
      credentialName: 'DemoCredential',
    });
    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'issuer'}),
    ).resolves.toMatchObject({granted: false});
  });

  it('cannot decide when the indexer does not answer', async () => {
    devnet({
      [participantUrl(ISSUER_DID, 'ISSUER')]: new Error('network'),
    });

    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'issuer', vct: VCT}),
    ).resolves.toMatchObject({granted: undefined});
  });

  it('cannot decide when the ecosystem DID does not resolve', async () => {
    devnet({[ECOSYSTEM_LOG]: {status: 503, body: ''}});

    await expect(
      checkVeranaAccreditation({did: ISSUER_DID, role: 'issuer', vct: VCT}),
    ).resolves.toMatchObject({granted: undefined});
  });
});

describe('withinValidity', () => {
  const now = Date.parse('2026-10-01T00:00:00Z');

  it('accepts a credential with no validity window', () => {
    expect(withinValidity({}, now)).toBe(true);
  });

  it('accepts a credential inside its window', () => {
    expect(
      withinValidity(
        {validFrom: '2026-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z'},
        now,
      ),
    ).toBe(true);
  });

  it('refuses an expired, not yet valid, or unreadable window', () => {
    expect(withinValidity({validUntil: '2026-09-01T00:00:00Z'}, now)).toBe(
      false,
    );
    expect(withinValidity({validFrom: '2026-11-01T00:00:00Z'}, now)).toBe(
      false,
    );
    expect(withinValidity({validUntil: 'soon'}, now)).toBe(false);
    expect(withinValidity({validFrom: 1}, now)).toBe(false);
  });
});

describe('parseSchemaRef', () => {
  it('maps a schema reference onto a configured network', () => {
    expect(parseSchemaRef('vpr:verana:vna-devnet-1:cs:8')).toMatchObject({
      network: {id: 'vna-devnet-1', indexerUrl: INDEXER},
      schemaId: '8',
    });
  });

  it('ignores unknown networks and other shapes', () => {
    expect(parseSchemaRef('vpr:verana:vna-mainnet-9:cs:8')).toBeUndefined();
    expect(parseSchemaRef('vpr:verana:vna-testnet-1/cs/v1/js/253')).toBe(
      undefined,
    );
  });
});

import {
  checkVeranaAccreditation,
  fetchPermissions,
  isPermissionActive,
  resetPermissionCache,
  resolveAccreditation,
} from './veranaPermissions';
import type {VeranaPermission} from './veranaPermissions';

const did = 'did:webvh:service.example';
const schemaId = '5';
const mockFetch = jest.fn();

const wirePermission = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: '101',
  did,
  schema_id: schemaId,
  type: 'ISSUER',
  ...overrides,
});

const jsonResponse = (body: unknown) => ({ok: true, json: async () => body});

describe('veranaPermissions', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetPermissionCache();
    global.fetch = mockFetch as typeof fetch;
  });

  it('grants an active issuer permission and asks the VPR only for this DID', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({permissions: [wirePermission()]}),
    );

    await expect(
      checkVeranaAccreditation({did, schemaId, role: 'issuer'}),
    ).resolves.toEqual({
      granted: true,
      reason: 'An active issuer permission covers this schema',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `/verana/perm/v1/find_with_did?did=${encodeURIComponent(
          did,
        )}&type=1&schema_id=${schemaId}`,
      ),
      expect.anything(),
    );
  });

  it('asks for permission type 2 on a verifier check', async () => {
    mockFetch.mockResolvedValue(jsonResponse({permissions: []}));

    await checkVeranaAccreditation({did, schemaId, role: 'verifier'});

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('&type=2&'),
      expect.anything(),
    );
  });

  it.each([
    {
      state: 'PENDING',
      overrides: {vp_state: 'PENDING'},
      reason: 'A issuer permission for this schema is still pending validation',
    },
    {
      state: 'TERMINATED',
      overrides: {vp_state: 'TERMINATED'},
      reason:
        'A issuer permission exists for this schema but is no longer in force',
    },
    {
      state: 'revoked',
      overrides: {revoked: '2026-01-01T00:00:00Z'},
      reason:
        'A issuer permission exists for this schema but is no longer in force',
    },
    {
      state: 'expired',
      overrides: {effective_until: '2026-01-01T00:00:00Z'},
      reason:
        'A issuer permission exists for this schema but is no longer in force',
    },
  ])(
    'holds a $state permission as not a grant',
    async ({overrides, reason}) => {
      mockFetch.mockResolvedValue(
        jsonResponse({permissions: [wirePermission(overrides)]}),
      );

      await expect(
        checkVeranaAccreditation({did, schemaId, role: 'issuer'}),
      ).resolves.toEqual({granted: false, reason});
    },
  );

  it('refuses definitively when the VPR holds no permission for the DID', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        permissions: [wirePermission({did: 'did:webvh:someone-else.example'})],
      }),
    );

    await expect(
      checkVeranaAccreditation({did, schemaId, role: 'issuer'}),
    ).resolves.toEqual({
      granted: false,
      reason: 'No issuer permission for this schema',
    });
  });

  it('does not let an issuer permission satisfy a verifier check', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({permissions: [wirePermission()]}),
    );

    await expect(
      checkVeranaAccreditation({did, schemaId, role: 'verifier'}),
    ).resolves.toEqual({
      granted: false,
      reason: 'No verifier permission for this schema',
    });
  });

  it.each([
    {
      failure: 'a network failure',
      mock: () =>
        mockFetch.mockRejectedValue(new TypeError('Network request failed')),
    },
    {
      failure: 'a VPR error response',
      mock: () => mockFetch.mockResolvedValue({ok: false, status: 500}),
    },
  ])(
    'reports could-not-determine, never a refusal, on $failure',
    async ({mock}) => {
      mock();

      const result = await checkVeranaAccreditation({
        did,
        schemaId,
        role: 'issuer',
      });
      expect(result.granted).toBeUndefined();
      expect(result.reason).toBe(
        'The Verana registry could not be reached, so this permission could not be checked',
      );
    },
  );

  it('reports could-not-determine when the credential type matches no Verana schema', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        schemas: [
          {id: '9', json_schema: JSON.stringify({title: 'SomethingElse'})},
        ],
      }),
    );

    const result = await checkVeranaAccreditation({
      did,
      vct: 'OpaqueServiceCredential',
      role: 'issuer',
    });
    expect(result.granted).toBeUndefined();
    expect(result.reason).toBe(
      'This credential type could not be matched to a Verana schema, so the permission could not be checked',
    );
  });

  it('resolves the schema through the vct type metadata and the schema credential', async () => {
    const vct = 'https://issuer.example/vct/service-credential';
    const vtjscId = 'https://issuer.example/credentials/schema';
    mockFetch.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url === vct) {
        return Promise.resolve(
          jsonResponse({relatedJsonSchemaCredentialId: vtjscId}),
        );
      }
      if (url === vtjscId) {
        return Promise.resolve(
          jsonResponse({
            credentialSubject: {jsonSchema: {$id: 'vpr:verana:vna/cs/v1/js/5'}},
          }),
        );
      }
      if (url.includes('/verana/perm/v1/')) {
        return Promise.resolve(jsonResponse({permissions: [wirePermission()]}));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    await expect(
      checkVeranaAccreditation({did, vct, role: 'issuer'}),
    ).resolves.toEqual({
      granted: true,
      reason: 'An active issuer permission covers this schema',
    });
  });

  it('resolves the schema when the VTJSC carries only $ref, the live cast shape', async () => {
    const vct = 'https://issuer.example/vct/service-credential';
    const vtjscId = 'https://issuer.example/credentials/schema';
    mockFetch.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url === vct) {
        return Promise.resolve(
          jsonResponse({relatedJsonSchemaCredentialId: vtjscId}),
        );
      }
      if (url === vtjscId) {
        return Promise.resolve(
          jsonResponse({
            credentialSubject: {
              jsonSchema: {$ref: 'vpr:verana:vna-testnet-1/cs/v1/js/253'},
              id: 'vpr:verana:vna-testnet-1/cs/v1/js/253',
            },
          }),
        );
      }
      if (url.includes('/verana/perm/v1/')) {
        return Promise.resolve(
          jsonResponse({permissions: [wirePermission({schema_id: '253'})]}),
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    await expect(
      checkVeranaAccreditation({did, vct, role: 'issuer'}),
    ).resolves.toEqual({
      granted: true,
      reason: 'An active issuer permission covers this schema',
    });
  });

  it('refuses when the VPR has no such schema, rather than failing open', async () => {
    mockFetch.mockResolvedValue({ok: false, status: 404});

    await expect(
      checkVeranaAccreditation({did, schemaId, role: 'issuer'}),
    ).resolves.toEqual({
      granted: false,
      reason: 'No issuer permission for this schema',
    });
  });

  it('treats a full VPR page as truncated, so a grant beyond the cut cannot read as absent', async () => {
    const page = Array.from({length: 1000}, (_, index) =>
      wirePermission({id: `${index}`, did: 'did:webvh:filler.example'}),
    );
    mockFetch.mockResolvedValue(jsonResponse({permissions: page}));

    await expect(fetchPermissions()).resolves.toBeUndefined();
  });

  it('holds a permission inactive outside its effective window', () => {
    const at = new Date('2026-08-01T00:00:00Z');
    const permission: VeranaPermission = {
      id: '1',
      did,
      schemaId,
      type: 'ISSUER',
    };

    expect(isPermissionActive(permission, at)).toBe(true);
    expect(
      isPermissionActive(
        {...permission, effectiveFrom: '2027-01-01T00:00:00Z'},
        at,
      ),
    ).toBe(false);
    expect(
      isPermissionActive(
        {...permission, effectiveUntil: '2026-01-01T00:00:00Z'},
        at,
      ),
    ).toBe(false);
    expect(
      isPermissionActive({...permission, slashed: '2026-07-01T00:00:00Z'}, at),
    ).toBe(false);
  });

  it('keeps the Paradym result shape on resolveAccreditation', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({permissions: [wirePermission()]}),
    );

    await expect(
      resolveAccreditation({did, schemaId, role: 'ISSUER'}),
    ).resolves.toEqual({
      role: 'ISSUER',
      granted: true,
      schemaId,
      permissionId: '101',
    });
  });
});

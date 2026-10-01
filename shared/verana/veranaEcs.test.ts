import {
  findOrganizationCredential,
  findServiceCredential,
  readEcsOrganization,
  readEcsService,
} from './veranaEcs';
import type {VeranaEcsCredential} from './veranaTrustService';

const service = (claims: Record<string, unknown>): VeranaEcsCredential => ({
  ecsSchema: 'ServiceCredential',
  ecosystemId: 3,
  claims,
});

const organization = (
  claims: Record<string, unknown>,
): VeranaEcsCredential => ({
  ecsSchema: 'OrganizationCredential',
  ecosystemId: 3,
  claims,
});

describe('veranaEcs', () => {
  it('reads a v4 service credential and keeps the digests', () => {
    const ecs = readEcsService(
      service({
        name: 'Accredited Issuer (demo)',
        termsAndConditionsUri: 'https://example.org/terms.pdf',
        termsAndConditionsDigestSri: 'sha384-abc',
        logoUri: 'https://example.org/logo.png',
        logoDigestSri: 'sha384-def',
        minimumAgeRequired: 18,
      }),
    );

    expect(ecs?.name).toBe('Accredited Issuer (demo)');
    expect(ecs?.terms).toEqual({
      uri: 'https://example.org/terms.pdf',
      digest: 'sha384-abc',
    });
    expect(ecs?.logo?.digest).toBe('sha384-def');
    expect(ecs?.minimumAgeRequired).toBe(18);
  });

  it('reads the operator identity off an organization credential', () => {
    const ecs = readEcsOrganization(
      organization({
        name: 'Playground Organization (demo)',
        countryCode: 'fr',
        registryId: 'FR-123',
      }),
    );

    expect(ecs?.name).toBe('Playground Organization (demo)');
    expect(ecs?.countryCode).toBe('FR');
    expect(ecs?.registryId).toBe('FR-123');
  });

  it('finds the service and the operator by their ECS schema', () => {
    const credentials = [
      organization({name: 'O'}),
      service({name: 'S'}),
      {ecsSchema: 'PersonaCredential', claims: {name: 'P'}},
    ];

    expect(findServiceCredential(credentials)?.claims.name).toBe('S');
    expect(findOrganizationCredential(credentials)?.claims.name).toBe('O');
    expect(findOrganizationCredential([credentials[2]])?.claims.name).toBe('P');
  });
});

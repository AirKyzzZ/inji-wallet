import {
  deriveVerdict,
  findOrganizationCredential,
  readEcsOrganization,
  readEcsService,
} from './veranaEcs';
import type {VeranaTrustCredential} from './veranaTrustService';

const service = (claims: Record<string, unknown>): VeranaTrustCredential => ({
  ecsType: 'ECS-SERVICE',
  result: 'VALID',
  claims,
});

const organization = (
  claims: Record<string, unknown>,
): VeranaTrustCredential => ({
  ecsType: 'ECS-ORG',
  result: 'VALID',
  claims,
});

describe('veranaEcs', () => {
  // The testnet serves v3 claims while the published schemas are v4, so both
  // shapes reach the wallet and both have to render.
  it('reads a v3 service credential, which carries no integrity digest', () => {
    const ecs = readEcsService(
      service({
        name: 'Unfold Verifier',
        termsAndConditions: 'https://example.org/terms.pdf',
        privacyPolicy: 'https://example.org/privacy.pdf',
      }),
    );

    expect(ecs?.name).toBe('Unfold Verifier');
    expect(ecs?.terms?.uri).toBe('https://example.org/terms.pdf');
    expect(ecs?.terms?.digest).toBeUndefined();
  });

  it('reads a v4 service credential and keeps the digest', () => {
    const ecs = readEcsService(
      service({
        name: 'Unfold Verifier',
        termsAndConditionsUri: 'https://example.org/terms.pdf',
        termsAndConditionsDigestSri: 'sha384-abc',
        logoUri: 'https://example.org/logo.png',
        logoDigestSri: 'sha384-def',
      }),
    );

    expect(ecs?.terms?.uri).toBe('https://example.org/terms.pdf');
    expect(ecs?.terms?.digest).toBe('sha384-abc');
    expect(ecs?.logo?.digest).toBe('sha384-def');
  });

  it('reads the operator identity off an organization credential', () => {
    const ecs = readEcsOrganization(
      organization({
        name: 'Verana Foundation',
        countryCode: 'KY',
        registryId: 'KY-XXX.XXX.XXX',
      }),
    );

    expect(ecs?.name).toBe('Verana Foundation');
    expect(ecs?.countryCode).toBe('KY');
    expect(ecs?.registryId).toBe('KY-XXX.XXX.XXX');
  });

  it('needs both checks verified before the verdict is TRUSTED', () => {
    const both = [service({name: 'S'}), organization({name: 'O'})];
    expect(deriveVerdict(both)).toBe('TRUSTED');

    const serviceOnly = [service({name: 'S'})];
    expect(deriveVerdict(serviceOnly)).not.toBe('TRUSTED');

    expect(deriveVerdict([])).toBe('UNTRUSTED');
    expect(deriveVerdict(undefined)).toBe('UNTRUSTED');
  });

  it('finds the organization credential among a mixed list', () => {
    const found = findOrganizationCredential([
      service({name: 'S'}),
      organization({name: 'O'}),
    ]);
    expect(found?.claims?.name).toBe('O');
  });
});

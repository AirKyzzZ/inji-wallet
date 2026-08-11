import type {VeranaTrustCredential} from './veranaTrustService';

export type EcsAssetRef = {
  uri: string;
  /** Absent on v3-shaped credentials, which carry no integrity digest at all. */
  digest?: string;
};

export type EcsService = {
  id?: string;
  name?: string;
  type?: string;
  description?: string;
  descriptionFormat: 'text/plain' | 'text/markdown';
  logo?: EcsAssetRef;
  minimumAgeRequired?: number;
  terms?: EcsAssetRef;
  privacy?: EcsAssetRef;
};

export type EcsOrganization = {
  id?: string;
  name?: string;
  logo?: EcsAssetRef;
  registryId?: string;
  address?: string;
  countryCode?: string;
  registryUri?: string;
  legalJurisdiction?: string;
  organizationKind?: string;
  lei?: string;
};

export type EcsVerdict = 'TRUSTED' | 'PARTIAL' | 'UNTRUSTED';

const str = (
  claims: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const value = claims?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const int = (
  claims: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const value = claims?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
};

// The published schemas are v4 (`<thing>Uri` + `<thing>DigestSri`) but the deployed
// testnet services still issue v3 (`<thing>` + `<thing>Hash`, and no logo digest at
// all). Both shapes have to read until every service is re-issued.
const asset = (
  claims: Record<string, unknown> | undefined,
  v4Uri: string,
  v4Digest: string,
  v3Uri: string,
  v3Digest?: string,
): EcsAssetRef | undefined => {
  const uri = str(claims, v4Uri) ?? str(claims, v3Uri);
  if (!uri) return undefined;
  const digest =
    str(claims, v4Digest) ?? (v3Digest ? str(claims, v3Digest) : undefined);
  return digest ? {uri, digest} : {uri};
};

// [PW-POT-4]: claims render as facts only from credentials the resolver verified. A revoked or
// tampered ECS credential still carries claims; they belong in the failure detail, not blocks 2-3.
export const readEcsService = (
  credential: VeranaTrustCredential | undefined,
): EcsService | undefined => {
  const claims = credential?.claims;
  if (!claims || !isValid(credential)) return undefined;

  const format = str(claims, 'descriptionFormat');
  return {
    id: str(claims, 'id'),
    name: str(claims, 'name'),
    type: str(claims, 'type'),
    description: str(claims, 'description'),
    descriptionFormat:
      format === 'text/markdown' ? 'text/markdown' : 'text/plain',
    logo: asset(claims, 'logoUri', 'logoDigestSri', 'logo'),
    minimumAgeRequired: int(claims, 'minimumAgeRequired'),
    terms: asset(
      claims,
      'termsAndConditionsUri',
      'termsAndConditionsDigestSri',
      'termsAndConditions',
      'termsAndConditionsHash',
    ),
    privacy: asset(
      claims,
      'privacyPolicyUri',
      'privacyPolicyDigestSri',
      'privacyPolicy',
      'privacyPolicyHash',
    ),
  };
};

export const readEcsOrganization = (
  credential: VeranaTrustCredential | undefined,
): EcsOrganization | undefined => {
  const claims = credential?.claims;
  if (!claims || !isValid(credential)) return undefined;

  return {
    id: str(claims, 'id'),
    name: str(claims, 'name'),
    logo: asset(claims, 'logoUri', 'logoDigestSri', 'logo'),
    registryId: str(claims, 'registryId'),
    address: str(claims, 'address'),
    countryCode: str(claims, 'countryCode')?.toUpperCase(),
    registryUri: str(claims, 'registryUri'),
    legalJurisdiction: str(claims, 'legalJurisdiction'),
    organizationKind: str(claims, 'organizationKind'),
    lei: str(claims, 'lei'),
  };
};

const isValid = (credential: VeranaTrustCredential | undefined): boolean =>
  credential?.result === 'VALID';

export const findEcsCredential = (
  credentials: VeranaTrustCredential[] | undefined,
  ecsTypes: string[],
): VeranaTrustCredential | undefined =>
  credentials?.find(c => c.ecsType && ecsTypes.includes(c.ecsType));

export const findServiceCredential = (
  credentials: VeranaTrustCredential[] | undefined,
) => findEcsCredential(credentials, ['ECS-SERVICE']);

export const findOrganizationCredential = (
  credentials: VeranaTrustCredential[] | undefined,
) =>
  findEcsCredential(credentials, [
    'ECS-ORG',
    'ECS-ORGANIZATION',
    'ECS-PERSONA',
  ]);

// The badge renders only when both mandatory identity credentials verify. Exactly one
// of them is PARTIAL, which the resolver's TrustStatus union reserves but never emits.
export const deriveVerdict = (
  credentials: VeranaTrustCredential[] | undefined,
): EcsVerdict => {
  const service = isValid(findServiceCredential(credentials));
  const organization = isValid(findOrganizationCredential(credentials));

  if (service && organization) return 'TRUSTED';
  if (service || organization) return 'PARTIAL';
  return 'UNTRUSTED';
};

// Wording is fixed by the versioned card at playground/public/trust-card/index.html. Same sentence
// in every wallet, or the same evaluation reads differently depending on who rendered it.
export const describeVerdict = (
  verdict: EcsVerdict,
  credentials: VeranaTrustCredential[] | undefined,
): string => {
  if (verdict === 'TRUSTED')
    return 'Both identity credentials verified against the Verana public registry';
  if (verdict === 'UNTRUSTED') {
    // A service can present structurally valid ECS credentials and still be untrusted, because
    // whoever issued them is not trusted. Saying "neither credential verified" beside two green
    // ticks would be a visible contradiction, so name the reason the resolver actually gave.
    return isValid(findServiceCredential(credentials)) ||
      isValid(findOrganizationCredential(credentials))
      ? 'The Verana public registry does not vouch for this service.'
      : 'Neither identity credential verified. This counterparty cannot present verifiable trust credentials.';
  }
  return isValid(findServiceCredential(credentials))
    ? 'The service credential verified. Nothing verifies who operates it.'
    : 'The operator credential verified. Nothing verifies the service itself.';
};

const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
const BARE_URL = /\bhttps?:\/\/\S+/gi;

/**
 * `descriptionFormat` may be `text/markdown` over 4096 characters, rendered on the
 * screen where someone decides whom to trust. A link there is phishing served by the
 * trust component itself, so links are removed and the count is surfaced.
 */
export const stripLinks = (
  description: string | undefined,
): {text: string; removed: number} => {
  if (!description) return {text: '', removed: 0};

  let removed = 0;
  const withoutMarkdown = description.replace(
    MARKDOWN_LINK,
    (_match, label: string) => {
      removed += 1;
      return label;
    },
  );
  const text = withoutMarkdown.replace(BARE_URL, () => {
    removed += 1;
    return '';
  });

  return {text: text.replace(/\s{2,}/g, ' ').trim(), removed};
};

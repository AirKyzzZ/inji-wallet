import type {VeranaEcsCredential} from './veranaTrustService';

export type EcsAssetRef = {
  uri: string;
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

const str = (
  claims: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = claims[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const int = (
  claims: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = claims[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
};

const asset = (
  claims: Record<string, unknown>,
  uriKey: string,
  digestKey: string,
): EcsAssetRef | undefined => {
  const uri = str(claims, uriKey);
  if (!uri) return undefined;
  const digest = str(claims, digestKey);
  return digest ? {uri, digest} : {uri};
};

export const readEcsService = (
  credential: VeranaEcsCredential | undefined,
): EcsService | undefined => {
  const claims = credential?.claims;
  if (!claims) return undefined;

  const format = str(claims, 'descriptionFormat');
  return {
    id: str(claims, 'id'),
    name: str(claims, 'name'),
    type: str(claims, 'type'),
    description: str(claims, 'description'),
    descriptionFormat:
      format === 'text/markdown' ? 'text/markdown' : 'text/plain',
    logo: asset(claims, 'logoUri', 'logoDigestSri'),
    minimumAgeRequired: int(claims, 'minimumAgeRequired'),
    terms: asset(
      claims,
      'termsAndConditionsUri',
      'termsAndConditionsDigestSri',
    ),
    privacy: asset(claims, 'privacyPolicyUri', 'privacyPolicyDigestSri'),
  };
};

export const readEcsOrganization = (
  credential: VeranaEcsCredential | undefined,
): EcsOrganization | undefined => {
  const claims = credential?.claims;
  if (!claims) return undefined;

  return {
    id: str(claims, 'id'),
    name: str(claims, 'name'),
    logo: asset(claims, 'logoUri', 'logoDigestSri'),
    registryId: str(claims, 'registryId'),
    address: str(claims, 'address'),
    countryCode: str(claims, 'countryCode')?.toUpperCase(),
    registryUri: str(claims, 'registryUri'),
    legalJurisdiction: str(claims, 'legalJurisdiction'),
    organizationKind: str(claims, 'organizationKind'),
    lei: str(claims, 'lei'),
  };
};

export const findEcsCredential = (
  credentials: Array<VeranaEcsCredential> | undefined,
  ecsSchemas: Array<string>,
): VeranaEcsCredential | undefined =>
  credentials?.find(credential => ecsSchemas.includes(credential.ecsSchema));

export const findServiceCredential = (
  credentials: Array<VeranaEcsCredential> | undefined,
) => findEcsCredential(credentials, ['ServiceCredential']);

export const findOrganizationCredential = (
  credentials: Array<VeranaEcsCredential> | undefined,
) =>
  findEcsCredential(credentials, [
    'OrganizationCredential',
    'PersonaCredential',
  ]);

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

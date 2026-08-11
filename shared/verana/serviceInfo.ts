import {
  findOrganizationCredential,
  findServiceCredential,
  readEcsOrganization,
  readEcsService,
  stripLinks,
} from './veranaEcs';
import type {
  VeranaTrustCredential,
  VeranaTrustDetails,
  VeranaTrustStatus,
} from './veranaTrustService';

export type VeranaServiceInfo = {
  did: string;
  trustStatus: VeranaTrustStatus;
  name?: string;
  description?: string;
  descriptionLinksRemoved: number;
  minimumAgeRequired: number;
  termsAndConditionsUrl?: string;
  termsAndConditionsDigestSri?: string;
  dataPrivacyUrl?: string;
  dataPrivacyDigestSri?: string;
  organization?: {
    entityName?: string;
    countryCode?: string;
    address?: string;
    officialPublicRegistryNumber?: string;
  };
  /**
   * The resolver anchored these ECS credentials in a registry the wallet trusts. A service that
   * issues its own ECS credentials to itself presents structurally valid ones either way, so
   * without this it would earn a green tick the registry never gave it.
   */
  claimsVerified: boolean;
  claimsSelfIssued: boolean;
};

const isSelfIssued = (
  credential: VeranaTrustCredential | undefined,
  did: string,
): boolean =>
  Boolean(credential?.issuedBy && credential.issuedBy.split('#')[0] === did);

export const toVeranaServiceInfo = (
  details: VeranaTrustDetails | undefined,
): VeranaServiceInfo | undefined => {
  if (!details) return undefined;

  const {did, trustStatus, credentials} = details;
  const serviceCredential = findServiceCredential(credentials);
  const organizationCredential = findOrganizationCredential(credentials);
  const service = readEcsService(serviceCredential);
  const organization = readEcsOrganization(organizationCredential);

  const claimsVerified = trustStatus === 'TRUSTED' || trustStatus === 'PARTIAL';
  const stripped = stripLinks(service?.description);

  return {
    did,
    trustStatus,
    name: service?.name,
    description: stripped.text,
    descriptionLinksRemoved: stripped.removed,
    minimumAgeRequired: service?.minimumAgeRequired ?? 0,
    termsAndConditionsUrl: service?.terms?.uri,
    termsAndConditionsDigestSri: service?.terms?.digest,
    dataPrivacyUrl: service?.privacy?.uri,
    dataPrivacyDigestSri: service?.privacy?.digest,
    organization: organization
      ? {
          entityName: organization.name,
          countryCode: organization.countryCode,
          address: organization.address,
          officialPublicRegistryNumber: organization.registryId,
        }
      : undefined,
    claimsVerified,
    claimsSelfIssued:
      isSelfIssued(serviceCredential, did) ||
      isSelfIssued(organizationCredential, did),
  };
};

import {
  findOrganizationCredential,
  findServiceCredential,
  readEcsOrganization,
  readEcsService,
  stripLinks,
} from './veranaEcs';
import type {
  VeranaTrustResolution,
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
  claimsVerified: boolean;
};

export const toVeranaServiceInfo = (
  resolution: VeranaTrustResolution,
): VeranaServiceInfo => {
  const {did, trustStatus, ecsCredentials} = resolution;
  const service = readEcsService(findServiceCredential(ecsCredentials));
  const organization = readEcsOrganization(
    findOrganizationCredential(ecsCredentials),
  );
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
    claimsVerified: trustStatus === 'TRUSTED',
  };
};

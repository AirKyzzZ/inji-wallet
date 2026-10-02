import {VERANA_NETWORKS, VeranaNetwork} from './constants';
import type {
  VeranaTrustStatus,
  VeranaUntrustedReason,
} from './veranaTrustService';

const UNTRUSTED_REASONS: Record<VeranaUntrustedReason, string> = {
  'no-did-document':
    'This service cannot present verifiable trust credentials.',
  'not-registered': 'The Verana public registry does not know this service.',
  'not-trusted': 'The Verana public registry does not vouch for this service.',
  'ecosystem-not-trusted':
    'Only ecosystems this wallet does not accept vouch for this service.',
  'did-not-proven': 'This service could not prove that it controls this DID.',
};

export const describeVeranaVerdict = (
  status: VeranaTrustStatus,
  reason?: VeranaUntrustedReason,
): string => {
  if (status === 'UNVERIFIED') {
    return 'The Verana registry could not be reached. This counterparty is neither trusted nor untrusted.';
  }
  if (status === 'TRUSTED') {
    return 'The Verana public registry trusts this service.';
  }
  return UNTRUSTED_REASONS[reason ?? 'not-trusted'];
};

export const veranaNetworkLabel = (
  network?: VeranaNetwork,
): string | undefined => {
  const labels = (network ? [network] : VERANA_NETWORKS)
    .filter(candidate => !candidate.production)
    .map(candidate => candidate.name.toUpperCase());
  return labels.length ? labels.join(' · ') : undefined;
};

export const isVeranaActionBlocked = (input: {
  trustStatus: VeranaTrustStatus;
  isResolving: boolean;
  permissionGranted?: boolean;
  isCheckingPermission?: boolean;
}): boolean =>
  input.isResolving ||
  Boolean(input.isCheckingPermission) ||
  input.trustStatus !== 'TRUSTED' ||
  input.permissionGranted !== true;

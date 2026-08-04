import type {VeranaTrustStatus} from './veranaTrustService';

export const VERANA_EXPLORER_URL = 'https://explorer.testnet.verana.network';

export type VeranaTrustEvidence = {
  resolved: boolean;
  hasServiceCredential: boolean;
  hasOrganizationCredential: boolean;
  structurallyValid?: boolean;
};

// Wording is fixed by the versioned card. A service can present structurally valid ECS credentials
// and still be untrusted, because whoever issued them is not trusted, so naming the reason the
// resolver actually gave avoids a sentence that contradicts the ticks beside it.
export const describeVeranaVerdict = (
  status: VeranaTrustStatus,
  evidence: VeranaTrustEvidence,
): string => {
  if (status === 'UNVERIFIED') {
    return 'The Verana resolver could not be reached. This counterparty is neither trusted nor untrusted.';
  }
  if (status === 'TRUSTED') {
    return 'Both identity credentials verified against the Verana public registry';
  }
  if (status === 'PARTIAL') {
    return evidence.hasServiceCredential
      ? 'The service credential verified. Nothing verifies who operates it.'
      : 'The operator credential verified. Nothing verifies the service itself.';
  }
  return evidence.structurallyValid
    ? 'The Verana public registry does not vouch for this service.'
    : 'Neither identity credential verified. This counterparty cannot present verifiable trust credentials.';
};

/**
 * Only a verdict settles a resolution. A placeholder carrying a name but no verdict is still in
 * flight, and treating it as an answer makes the card state that the resolver was unreachable
 * before it was ever called.
 */
export const isVeranaResolutionPending = (input: {
  did?: string;
  trustStatus?: VeranaTrustStatus;
  isFetching?: boolean;
  failed?: boolean;
}): boolean => {
  if (input.isFetching) return true;
  if (!input.did) return false;
  return !input.failed && !input.trustStatus;
};

/**
 * Blocks on a refusal and while a check is still running, never on could-not-determine: an
 * unreachable registry is a warning, and refusing on it would punish a flaky network.
 */
export const isVeranaActionBlocked = (input: {
  trustStatus: VeranaTrustStatus;
  isResolving: boolean;
  permissionGranted?: boolean;
  isCheckingPermission?: boolean;
}): boolean => {
  if (input.isResolving || input.isCheckingPermission) return true;
  if (input.trustStatus === 'UNTRUSTED') return true;
  return input.permissionGranted === false;
};

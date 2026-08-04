import {useEffect, useState} from 'react';
import {toVeranaServiceInfo, VeranaServiceInfo} from './serviceInfo';
import {
  checkVeranaAccreditation,
  VeranaAccreditationCheck,
} from './veranaPermissions';
import {
  extractDidFromClientId,
  fetchVeranaTrustDetails,
  VeranaTrustStatus,
} from './veranaTrustService';
import {
  isVeranaActionBlocked,
  isVeranaResolutionPending,
} from './veranaVerdict';

type Options = {
  /** Raw OID4VP client_id, or a bare DID. `decentralized_identifier:` is stripped. */
  clientId?: string;
  role: 'issuer' | 'verifier';
  /** Schema the counterparty is accredited against, for the Q2/Q3 check. */
  schemaId?: string;
  vct?: string;
  title?: string;
};

export type VeranaTrust = {
  did?: string;
  serviceInfo?: VeranaServiceInfo;
  trustStatus: VeranaTrustStatus;
  isResolving: boolean;
  accreditation?: VeranaAccreditationCheck;
  isCheckingAccreditation: boolean;
  /** Accept/share must be disabled while this is true. */
  blocked: boolean;
};

export const useVeranaTrust = (options: Options): VeranaTrust => {
  const did = extractDidFromClientId(options.clientId);
  const [serviceInfo, setServiceInfo] = useState<VeranaServiceInfo>();
  const [failed, setFailed] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [accreditation, setAccreditation] =
    useState<VeranaAccreditationCheck>();
  const [isCheckingAccreditation, setIsChecking] = useState(false);

  useEffect(() => {
    if (!did) return;
    let cancelled = false;
    setFailed(false);
    setIsFetching(true);
    fetchVeranaTrustDetails(did)
      .then(details => {
        if (cancelled) return;
        const info = toVeranaServiceInfo(details);
        if (info) setServiceInfo(info);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setIsFetching(false));
    return () => {
      cancelled = true;
    };
  }, [did]);

  useEffect(() => {
    if (!did) return;
    let cancelled = false;
    setIsChecking(true);
    checkVeranaAccreditation({
      did,
      role: options.role,
      schemaId: options.schemaId,
      vct: options.vct,
      title: options.title,
    })
      .then(result => !cancelled && setAccreditation(result))
      .catch(
        () =>
          !cancelled &&
          setAccreditation({
            granted: undefined,
            reason: 'This could not be checked against the registry.',
          }),
      )
      .finally(() => !cancelled && setIsChecking(false));
    return () => {
      cancelled = true;
    };
  }, [did, options.role, options.schemaId, options.vct, options.title]);

  const isResolving = isVeranaResolutionPending({
    did,
    trustStatus: serviceInfo?.trustStatus,
    isFetching,
    failed,
  });
  const trustStatus: VeranaTrustStatus =
    serviceInfo?.trustStatus ?? 'UNVERIFIED';

  return {
    did,
    serviceInfo,
    trustStatus,
    isResolving,
    accreditation,
    isCheckingAccreditation,
    blocked: isVeranaActionBlocked({
      trustStatus,
      isResolving,
      permissionGranted: accreditation?.granted,
      isCheckingPermission: isCheckingAccreditation,
    }),
  };
};

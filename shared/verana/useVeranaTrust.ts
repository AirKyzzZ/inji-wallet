import {useCallback, useEffect, useState} from 'react';
import {veranaLog} from './constants';
import {canonicalVeranaDid} from './canonicalDid';
import type {IssuerProof} from './issuerDid';
import {toVeranaServiceInfo, VeranaServiceInfo} from './serviceInfo';
import {
  checkVeranaAccreditation,
  VeranaAccreditationCheck,
} from './veranaPermissions';
import {
  extractDidFromClientId,
  resolveVeranaTrust,
  unresolved,
  VeranaTrustResolution,
  VeranaTrustStatus,
  VeranaUntrustedReason,
} from './veranaTrustService';
import {isVeranaActionBlocked, veranaNetworkLabel} from './veranaVerdict';
import {credentialNameFromVct} from './vctName';

const debug = veranaLog('useVeranaTrust');

type Options = {
  /** Raw OID4VP client_id, or a bare DID. `decentralized_identifier:` is stripped. */
  clientId?: string;
  role: 'issuer' | 'verifier';
  vct?: string;
  didProof?: IssuerProof;
  pending?: boolean;
};

export type VeranaTrust = {
  did?: string;
  serviceInfo?: VeranaServiceInfo;
  trustStatus: VeranaTrustStatus;
  reason?: VeranaUntrustedReason;
  isResolving: boolean;
  accreditation?: VeranaAccreditationCheck;
  isCheckingAccreditation: boolean;
  credentialName?: string;
  networkLabel?: string;
  explorerUrl?: string;
  evaluatedAt?: string;
  /** Accept/share must be disabled while this is true. */
  blocked: boolean;
  retry: () => void;
};

const resolveWithProof = (
  did: string,
  didProof?: IssuerProof,
): Promise<VeranaTrustResolution> => {
  if (didProof === 'invalid') {
    return Promise.resolve(unresolved(did, 'UNTRUSTED', 'did-not-proven'));
  }
  if (didProof === 'unavailable') {
    return Promise.resolve(unresolved(did, 'UNVERIFIED'));
  }
  return resolveVeranaTrust(did);
};

type Keyed<T> = {key: string; value: T};

const settled = <T>(entry: Keyed<T> | undefined, key: string) =>
  entry?.key === key ? entry.value : undefined;

export const useVeranaTrust = (options: Options): VeranaTrust => {
  const clientDid = extractDidFromClientId(options.clientId);
  const [attempt, setAttempt] = useState(0);
  const [canonical, setCanonical] = useState<Keyed<string | undefined>>();
  const [resolved, setResolved] = useState<Keyed<VeranaTrustResolution>>();
  const [checked, setChecked] = useState<Keyed<VeranaAccreditationCheck>>();
  const [named, setNamed] = useState<Keyed<string | undefined>>();

  const retry = useCallback(() => setAttempt(value => value + 1), []);

  const did = settled(canonical, `${clientDid}`);
  const resolutionKey = `${did}|${options.didProof}|${attempt}`;
  const accreditationKey = `${did}|${options.role}|${options.vct}|${attempt}`;
  const resolution = settled(resolved, resolutionKey);
  const accreditation = settled(checked, accreditationKey);
  const vctName = settled(named, `${options.vct}`);
  const isCheckingAccreditation = Boolean(did) && !accreditation;

  useEffect(() => {
    let cancelled = false;
    credentialNameFromVct(options.vct).then(
      name => !cancelled && setNamed({key: `${options.vct}`, value: name}),
    );
    return () => {
      cancelled = true;
    };
  }, [options.vct]);

  useEffect(() => {
    let cancelled = false;
    canonicalVeranaDid(clientDid).then(
      value => !cancelled && setCanonical({key: `${clientDid}`, value}),
    );
    return () => {
      cancelled = true;
    };
  }, [clientDid]);

  useEffect(() => {
    if (!did) return;
    let cancelled = false;
    resolveWithProof(did, options.didProof)
      .catch(() => unresolved(did, 'UNVERIFIED'))
      .then(value => !cancelled && setResolved({key: resolutionKey, value}));
    return () => {
      cancelled = true;
    };
  }, [did, options.didProof, resolutionKey]);

  useEffect(() => {
    if (!did) return;
    let cancelled = false;
    checkVeranaAccreditation({did, role: options.role, vct: options.vct}).then(
      value => !cancelled && setChecked({key: accreditationKey, value}),
    );
    return () => {
      cancelled = true;
    };
  }, [did, options.role, options.vct, accreditationKey]);

  const isResolving = Boolean(clientDid) && (!did || !resolution);
  const trustStatus = resolution?.trustStatus ?? 'UNVERIFIED';
  const network = resolution?.network;
  const blocked =
    Boolean(options.pending) ||
    (Boolean(clientDid) &&
      isVeranaActionBlocked({
        trustStatus,
        isResolving,
        permissionGranted: accreditation?.granted,
        isCheckingPermission: isCheckingAccreditation,
      }));

  debug(
    `gate did=${did} trust=${trustStatus} resolving=${isResolving} vct=${options.vct} ` +
      `granted=${accreditation?.granted} checking=${isCheckingAccreditation} blocked=${blocked}`,
  );

  return {
    did,
    serviceInfo: resolution && toVeranaServiceInfo(resolution),
    trustStatus,
    reason: resolution?.reason,
    isResolving,
    accreditation,
    isCheckingAccreditation,
    credentialName: accreditation?.credentialName ?? vctName,
    networkLabel: veranaNetworkLabel(network),
    explorerUrl:
      did && network?.explorerUrl
        ? `${network.explorerUrl}/did/${encodeURIComponent(did)}`
        : undefined,
    evaluatedAt: resolution?.evaluatedAt,
    blocked,
    retry,
  };
};

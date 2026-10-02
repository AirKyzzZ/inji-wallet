import {
  fetchWithTimeout,
  VERANA_NETWORKS,
  VeranaNetwork,
  veranaLog,
} from './constants';
import {isResolvableDid} from './didDocument';

const debug = veranaLog('veranaTrustService');

const RESOLVE_TIMEOUT_MS = 15000;

export type VeranaTrustStatus = 'TRUSTED' | 'UNTRUSTED' | 'UNVERIFIED';

export type VeranaUntrustedReason =
  | 'no-did-document'
  | 'not-registered'
  | 'not-trusted'
  | 'ecosystem-not-trusted'
  | 'did-not-proven';

export type VeranaEcsCredential = {
  ecsSchema: string;
  ecosystemId?: number;
  claims: Record<string, unknown>;
};

export type VeranaTrustResolution = {
  did: string;
  trustStatus: VeranaTrustStatus;
  network?: VeranaNetwork;
  evaluatedAt?: string;
  expiresAt?: string;
  ecsCredentials: Array<VeranaEcsCredential>;
  failedCredentialIds: Array<string>;
  reason?: VeranaUntrustedReason;
};

type NetworkAnswer =
  | {kind: 'trusted' | 'untrusted'; resolution: VeranaTrustResolution}
  | {kind: 'unanswered'};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const unresolved = (
  did: string,
  trustStatus: VeranaTrustStatus,
  reason?: VeranaUntrustedReason,
  network?: VeranaNetwork,
): VeranaTrustResolution => ({
  did,
  trustStatus,
  reason,
  network,
  ecsCredentials: [],
  failedCredentialIds: [],
});

const parseEcsCredential = (value: unknown): VeranaEcsCredential[] =>
  isRecord(value) &&
  typeof value.ecsSchema === 'string' &&
  isRecord(value.credentialSubject)
    ? [
        {
          ecsSchema: value.ecsSchema,
          ecosystemId:
            typeof value.ecosystemId === 'number'
              ? value.ecosystemId
              : undefined,
          claims: value.credentialSubject,
        },
      ]
    : [];

export const parseResolveResponse = (
  value: unknown,
  did: string,
  network: VeranaNetwork,
): VeranaTrustResolution | undefined => {
  if (
    !isRecord(value) ||
    value.did !== did ||
    typeof value.trusted !== 'boolean'
  ) {
    return undefined;
  }
  const presentations = Array.isArray(value.presentations)
    ? value.presentations
    : [];
  return {
    did,
    trustStatus: value.trusted ? 'TRUSTED' : 'UNTRUSTED',
    reason: value.trusted ? undefined : 'not-trusted',
    network,
    evaluatedAt: asString(value.evaluatedAtTime),
    expiresAt: asString(value.expiresAtTime),
    ecsCredentials: Array.isArray(value.ecsCredentials)
      ? value.ecsCredentials.flatMap(parseEcsCredential)
      : [],
    failedCredentialIds: presentations.flatMap(presentation =>
      isRecord(presentation) &&
      Array.isArray(presentation.unresolvableCredentialIds)
        ? presentation.unresolvableCredentialIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
    ),
  };
};

const fetchEcosystemDid = async (
  network: VeranaNetwork,
  ecosystemId: number,
): Promise<string | undefined> => {
  const response = await fetchWithTimeout(
    `${network.indexerUrl}/v4/ecosystem/get/${ecosystemId}`,
    {headers: {Accept: 'application/json'}},
    RESOLVE_TIMEOUT_MS,
  );
  const body: unknown = response.ok ? await response.json() : undefined;
  return isRecord(body) && isRecord(body.ecosystem)
    ? asString(body.ecosystem.did)
    : undefined;
};

const fromTrustedEcosystems = async (
  network: VeranaNetwork,
  credentials: Array<VeranaEcsCredential>,
): Promise<boolean | undefined> => {
  const trusted = network.trustedEcsEcosystemDids;
  if (!trusted) return true;
  const dids = await Promise.all(
    credentials.map(credential =>
      credential.ecosystemId === undefined
        ? Promise.resolve(undefined)
        : fetchEcosystemDid(network, credential.ecosystemId),
    ),
  );
  if (dids.some(did => did === undefined)) return undefined;
  return dids.every(did => did !== undefined && trusted.includes(did));
};

const queryNetwork = async (
  network: VeranaNetwork,
  did: string,
): Promise<NetworkAnswer> => {
  try {
    const response = await fetchWithTimeout(
      `${network.indexerUrl}/v4/verifiable-trust/resolve`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          did,
          participations: {states: ['ACTIVE', 'EXPIRED', 'REVOKED']},
          presentations: {unresolvableCredentialIds: true},
          ecsCredentials: true,
        }),
      },
      RESOLVE_TIMEOUT_MS,
    );
    const body: unknown = await response.json().catch(() => undefined);
    if (
      response.status === 404 &&
      isRecord(body) &&
      body.error === 'DID not found'
    ) {
      return {
        kind: 'untrusted',
        resolution: unresolved(did, 'UNTRUSTED', 'not-registered', network),
      };
    }
    const resolution = response.ok
      ? parseResolveResponse(body, did, network)
      : undefined;
    if (!resolution) {
      debug(`${network.id} answered ${response.status} for ${did}`);
      return {kind: 'unanswered'};
    }
    if (resolution.trustStatus !== 'TRUSTED') {
      return {kind: 'untrusted', resolution};
    }

    const ecosystemsTrusted = await fromTrustedEcosystems(
      network,
      resolution.ecsCredentials,
    );
    if (ecosystemsTrusted === undefined) return {kind: 'unanswered'};
    return ecosystemsTrusted
      ? {kind: 'trusted', resolution}
      : {
          kind: 'untrusted',
          resolution: {
            ...resolution,
            trustStatus: 'UNTRUSTED',
            reason: 'ecosystem-not-trusted',
          },
        };
  } catch (error) {
    debug(`${network.id} resolve failed for ${did}: ${error}`);
    return {kind: 'unanswered'};
  }
};

const settledVerdict = (
  did: string,
  answers: Array<NetworkAnswer>,
): VeranaTrustResolution => {
  if (answers.some(answer => answer.kind === 'unanswered')) {
    return unresolved(did, 'UNVERIFIED');
  }
  const untrusted = answers.flatMap(answer =>
    answer.kind === 'untrusted' ? [answer.resolution] : [],
  );
  return (
    untrusted.find(resolution => resolution.reason !== 'not-registered') ??
    untrusted[0] ??
    unresolved(did, 'UNTRUSTED', 'not-registered')
  );
};

export const resolveVeranaTrust = (
  did: string,
  networks: Array<VeranaNetwork> = VERANA_NETWORKS,
): Promise<VeranaTrustResolution> => {
  if (!isResolvableDid(did)) {
    return Promise.resolve(unresolved(did, 'UNTRUSTED', 'no-did-document'));
  }
  if (!networks.length) {
    return Promise.resolve(unresolved(did, 'UNVERIFIED'));
  }

  return new Promise(resolve => {
    const answers: Array<NetworkAnswer> = [];
    networks.forEach(network =>
      queryNetwork(network, did).then(answer => {
        if (answer.kind === 'trusted') {
          resolve(answer.resolution);
          return;
        }
        answers.push(answer);
        if (answers.length === networks.length) {
          resolve(settledVerdict(did, answers));
        }
      }),
    );
  });
};

export const extractDidFromClientId = (
  clientId?: string,
): string | undefined => {
  if (!clientId) {
    return undefined;
  }
  const did = clientId.startsWith('decentralized_identifier:')
    ? clientId.slice('decentralized_identifier:'.length)
    : clientId;
  return did.startsWith('did:') ? did.split('#')[0] : undefined;
};

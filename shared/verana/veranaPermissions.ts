import {
  fetchWithTimeout,
  VERANA_NETWORKS,
  veranaLog,
  VeranaNetwork,
  veranaNetworkById,
} from './constants';
import {issuerOf, verifyEddsaJcs2022} from './dataIntegrity';
import {resolveDidDocument} from './didDocument';
import {resolveVeranaTrust} from './veranaTrustService';

const debug = veranaLog('veranaPermissions');

const REQUEST_TIMEOUT_MS = 15000;
const SCHEMA_REF = /^vpr:verana:([^:]+):cs:(\d+)$/;

export type VeranaAccreditationCheck = {
  granted: boolean | undefined;
  reason: string;
  credentialName?: string;
  ecosystemName?: string;
};

export type VeranaSchemaRef = {network: VeranaNetwork; schemaId: string};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fetchJson = async (url: string): Promise<unknown> => {
  try {
    const response = await fetchWithTimeout(
      url,
      {headers: {Accept: 'application/json'}},
      REQUEST_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error(`answered ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`${url}: ${error}`);
  }
};

const refused = (
  reason: string,
  credentialName?: string,
): VeranaAccreditationCheck => ({granted: false, reason, credentialName});

const boundHolds = (
  bound: unknown,
  holds: (time: number) => boolean,
): boolean => {
  if (bound === undefined) return true;
  const time = typeof bound === 'string' ? Date.parse(bound) : NaN;
  return Number.isFinite(time) && holds(time);
};

export const withinValidity = (
  credential: Record<string, unknown>,
  now: number,
): boolean =>
  boundHolds(credential.validFrom, from => from <= now) &&
  boundHolds(credential.validUntil, until => until > now);

export const parseSchemaRef = (ref: unknown): VeranaSchemaRef | undefined => {
  const match = typeof ref === 'string' ? SCHEMA_REF.exec(ref) : null;
  const network = match ? veranaNetworkById(match[1]) : undefined;
  return match && network ? {network, schemaId: match[2]} : undefined;
};

const ecosystemName = async (did: string): Promise<string | undefined> => {
  const resolution = await resolveVeranaTrust(did, VERANA_NETWORKS);
  const service = resolution.ecsCredentials.find(
    credential => credential.ecsSchema === 'ServiceCredential',
  );
  return resolution.trustStatus === 'TRUSTED' &&
    typeof service?.claims.name === 'string'
    ? service.claims.name
    : undefined;
};

const holdsActiveParticipant = async (
  {network, schemaId}: VeranaSchemaRef,
  did: string,
  role: 'ISSUER' | 'VERIFIER',
): Promise<boolean> => {
  const query = `did=${encodeURIComponent(
    did,
  )}&role=${role}&schema_id=${schemaId}&participant_state=ACTIVE`;
  const body = await fetchJson(
    `${network.indexerUrl}/v4/participant/list?${query}`,
  );
  if (!isRecord(body) || !Array.isArray(body.participants)) {
    throw new Error('malformed participant list');
  }
  return body.participants.some(
    participant =>
      isRecord(participant) &&
      participant.did === did &&
      participant.role === role &&
      String(participant.schema_id) === schemaId &&
      participant.participant_state === 'ACTIVE',
  );
};

const schemaEcosystemDid = async ({
  network,
  schemaId,
}: VeranaSchemaRef): Promise<string> => {
  const schema = await fetchJson(
    `${network.indexerUrl}/v4/credential-schema/get/${schemaId}`,
  );
  const ecosystemId =
    isRecord(schema) && isRecord(schema.schema)
      ? schema.schema.ecosystem_id
      : undefined;
  if (typeof ecosystemId !== 'number') {
    throw new Error('malformed credential schema');
  }
  const ecosystem = await fetchJson(
    `${network.indexerUrl}/v4/ecosystem/get/${ecosystemId}`,
  );
  const did =
    isRecord(ecosystem) && isRecord(ecosystem.ecosystem)
      ? ecosystem.ecosystem.did
      : undefined;
  if (typeof did !== 'string') throw new Error('malformed ecosystem');
  return did;
};

const checkAccreditation = async (
  did: string,
  role: 'ISSUER' | 'VERIFIER',
  vct?: string,
): Promise<VeranaAccreditationCheck> => {
  if (!vct?.startsWith('https://')) {
    return refused('This credential type does not name a Verana schema.');
  }

  const typeMetadata = await fetchJson(vct);
  const credentialName =
    isRecord(typeMetadata) && typeof typeMetadata.name === 'string'
      ? typeMetadata.name
      : undefined;
  const vtjscId = isRecord(typeMetadata)
    ? typeMetadata.relatedJsonSchemaCredentialId
    : undefined;
  if (typeof vtjscId !== 'string' || !vtjscId.startsWith('https://')) {
    return refused(
      'This credential type does not name a Verana schema.',
      credentialName,
    );
  }

  const vtjsc = await fetchJson(vtjscId);
  const vtjscIssuer = isRecord(vtjsc) ? issuerOf(vtjsc) : undefined;
  if (!isRecord(vtjsc) || !vtjscIssuer) {
    return refused('The schema credential is malformed.', credentialName);
  }
  const issuerDocument = await resolveDidDocument(vtjscIssuer);
  if (!issuerDocument) {
    throw new Error(`could not resolve ${vtjscIssuer}`);
  }
  if (
    !verifyEddsaJcs2022(vtjsc, issuerDocument) ||
    !withinValidity(vtjsc, Date.now())
  ) {
    return refused(
      'The schema credential of this credential type is not valid.',
      credentialName,
    );
  }

  const subject = vtjsc.credentialSubject;
  const schemaRef = parseSchemaRef(
    isRecord(subject) && isRecord(subject.jsonSchema)
      ? subject.jsonSchema.$ref
      : undefined,
  );
  if (!schemaRef) {
    return refused(
      'This credential type belongs to a network this wallet does not know.',
      credentialName,
    );
  }

  const [ecosystemDid, authorized] = await Promise.all([
    schemaEcosystemDid(schemaRef),
    holdsActiveParticipant(schemaRef, did, role),
  ]);
  if (ecosystemDid !== vtjscIssuer) {
    return refused(
      'The schema credential was not issued by the ecosystem that owns the schema.',
      credentialName,
    );
  }

  return {
    granted: authorized,
    reason: authorized
      ? `An active ${role.toLowerCase()} participant covers this schema.`
      : `No active ${role.toLowerCase()} participant for this schema.`,
    credentialName,
    ecosystemName: await ecosystemName(ecosystemDid),
  };
};

export const checkVeranaAccreditation = async (options: {
  did: string;
  role: 'issuer' | 'verifier';
  vct?: string;
}): Promise<VeranaAccreditationCheck> => {
  try {
    return await checkAccreditation(
      options.did,
      options.role === 'issuer' ? 'ISSUER' : 'VERIFIER',
      options.vct,
    );
  } catch (error) {
    debug(`accreditation check failed: ${error}`);
    return {
      granted: undefined,
      reason:
        'The Verana registry could not be reached, so this permission could not be checked.',
    };
  }
};

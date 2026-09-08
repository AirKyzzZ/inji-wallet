import {VERANA_API_URL, veranaLog} from './constants';

const debug = veranaLog('veranaPermissions');

// The list endpoint takes no filter, so this is the whole registry in one response: ~780 KB and
// growing, which already overran a 10s budget on device and aborted mid-download.
const PERMISSION_TIMEOUT_MS = 45000;
const PERMISSION_CACHE_TTL_MS = 120000;

// The VPR list endpoints ignore `pagination.*` entirely and default to 64 records;
// `response_max_size` is the parameter that actually widens the response. Reading the default
// would make an accredited issuer beyond record 64 look unaccredited, so the ceiling is
// requested explicitly and a full page is treated as truncated rather than complete.
const RESPONSE_MAX_SIZE = 1000;

export type VeranaPermissionType =
  | 'ISSUER'
  | 'VERIFIER'
  | 'ISSUER_GRANTOR'
  | 'VERIFIER_GRANTOR'
  | 'ECOSYSTEM'
  | 'HOLDER';

export type VeranaPermission = {
  id: string;
  did: string;
  schemaId: string;
  type: VeranaPermissionType;
  effectiveFrom?: string;
  effectiveUntil?: string;
  revoked?: string;
  slashed?: string;
  validationState?: string;
};

export type VeranaAccreditation = {
  role: 'ISSUER' | 'VERIFIER';
  granted: boolean;
  schemaId?: string;
  permissionId?: string;
  reason?: string;
};

export type VeranaSchema = {
  id: string;
  trustRegistryId?: string;
  title?: string;
  vprId?: string;
};

export type VeranaAccreditationCheck = {
  granted: boolean | undefined;
  reason: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const PERMISSION_TYPES: Array<VeranaPermissionType> = [
  'ISSUER',
  'VERIFIER',
  'ISSUER_GRANTOR',
  'VERIFIER_GRANTOR',
  'ECOSYSTEM',
  'HOLDER',
];

const parsePermission = (value: unknown): VeranaPermission | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = PERMISSION_TYPES.find(candidate => candidate === value.type);
  const id = asString(value.id);
  const schemaId = asString(value.schema_id);
  if (!type || !id || !schemaId) {
    return undefined;
  }

  return {
    id,
    schemaId,
    type,
    did: asString(value.did) ?? '',
    effectiveFrom: asString(value.effective_from),
    effectiveUntil: asString(value.effective_until),
    revoked: asString(value.revoked),
    slashed: asString(value.slashed),
    validationState: asString(value.vp_state),
  };
};

export const isPermissionActive = (
  permission: VeranaPermission,
  at: Date = new Date(),
): boolean => {
  if (permission.revoked || permission.slashed) {
    return false;
  }
  // PENDING is an application under review, not a grant - the live testnet holds such records.
  if (
    permission.validationState === 'TERMINATED' ||
    permission.validationState === 'PENDING'
  ) {
    return false;
  }

  const now = at.getTime();
  if (permission.effectiveFrom) {
    const from = Date.parse(permission.effectiveFrom);
    if (Number.isFinite(from) && from > now) {
      return false;
    }
  }
  if (permission.effectiveUntil) {
    const until = Date.parse(permission.effectiveUntil);
    if (Number.isFinite(until) && until <= now) {
      return false;
    }
  }
  return true;
};

export const findAccreditation = (
  permissions: Array<VeranaPermission>,
  options: {
    did: string;
    schemaId: string;
    role: 'ISSUER' | 'VERIFIER';
    at?: Date;
  },
): VeranaAccreditation => {
  const forSchema = permissions.filter(
    permission =>
      permission.did === options.did &&
      permission.schemaId === options.schemaId,
  );
  const forRole = forSchema.filter(
    permission => permission.type === options.role,
  );
  const live = forRole.find(permission =>
    isPermissionActive(permission, options.at),
  );

  if (live) {
    return {
      role: options.role,
      granted: true,
      schemaId: options.schemaId,
      permissionId: live.id,
    };
  }

  const reason = forRole.some(
    permission => permission.validationState === 'PENDING',
  )
    ? `A ${options.role.toLowerCase()} permission for this schema is still pending validation`
    : forRole.length
    ? `A ${options.role.toLowerCase()} permission exists for this schema but is no longer in force`
    : `No ${options.role.toLowerCase()} permission for this schema`;

  return {
    role: options.role,
    granted: false,
    schemaId: options.schemaId,
    reason,
  };
};

const VPR_SCHEMA_ID = /\/cs\/v\d+\/js\/(\d+)\b/;

export const schemaIdFromVct = (vct?: string): string | undefined => {
  if (!vct) {
    return undefined;
  }
  return VPR_SCHEMA_ID.exec(vct)?.[1];
};

export type VctSchemaResolution = {schemaId?: string; credentialName?: string};

// The SD-JWT type metadata names the schema credential (`relatedJsonSchemaCredentialId`), which
// names the VPR schema in `credentialSubject.jsonSchema.$id` - the schema the issuer actually
// committed to, rather than a credential title anyone can reuse. The type metadata's `name` is
// the display name the consent screens render.
export const resolveVctSchema = async (
  vct: string,
): Promise<VctSchemaResolution> => {
  const direct = VPR_SCHEMA_ID.exec(vct)?.[1];
  if (direct) {
    return {schemaId: direct};
  }
  if (!/^https:\/\//.test(vct)) {
    return {};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS);
  try {
    const typeMetadata: unknown = await (
      await fetch(vct, {signal: controller.signal})
    ).json();
    const credentialName = isRecord(typeMetadata)
      ? asString(typeMetadata.name)
      : undefined;
    const vtjscId = isRecord(typeMetadata)
      ? asString(typeMetadata.relatedJsonSchemaCredentialId)
      : undefined;
    if (!vtjscId || !/^https:\/\//.test(vtjscId)) {
      return {credentialName};
    }

    const vtjsc: unknown = await (
      await fetch(vtjscId, {signal: controller.signal})
    ).json();
    if (!isRecord(vtjsc) || !isRecord(vtjsc.credentialSubject)) {
      return {credentialName};
    }
    // Live VTJSCs carry the pointer as `jsonSchema.$ref` (vpr:…/cs/v1/js/N) with a copy in
    // `credentialSubject.id`; `$id` is the published-schema variant. Read all three.
    const jsonSchema = vtjsc.credentialSubject.jsonSchema;
    const id =
      (isRecord(jsonSchema)
        ? asString(jsonSchema.$id) ?? asString(jsonSchema.$ref)
        : undefined) ?? asString(vtjsc.credentialSubject.id);
    return {
      schemaId: id ? VPR_SCHEMA_ID.exec(id)?.[1] : undefined,
      credentialName,
    };
  } catch (error) {
    debug(`schema resolution failed for ${vct}: ${error}`);
    return {};
  } finally {
    clearTimeout(timeout);
  }
};

export const resolveSchemaIdFromVct = async (
  vct: string,
): Promise<string | undefined> => (await resolveVctSchema(vct)).schemaId;

export const fetchSchemas = async (): Promise<
  Array<VeranaSchema> | undefined
> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${VERANA_API_URL}/verana/cs/v1/list?response_max_size=${RESPONSE_MAX_SIZE}`,
      {signal: controller.signal},
    );
    if (!response.ok) {
      debug(`schema list returned ${response.status}`);
      return undefined;
    }

    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      !Array.isArray(body.schemas) ||
      body.schemas.length >= RESPONSE_MAX_SIZE
    ) {
      return undefined;
    }

    return body.schemas.flatMap((entry): Array<VeranaSchema> => {
      if (!isRecord(entry)) {
        return [];
      }
      const id = asString(entry.id);
      if (!id) {
        return [];
      }

      let title: string | undefined;
      let vprId: string | undefined;
      const raw = asString(entry.json_schema);
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isRecord(parsed)) {
            title = asString(parsed.title);
            vprId = asString(parsed.$id);
          }
        } catch {
          // a malformed schema still has a usable id; only its title is lost
        }
      }
      return [{id, trustRegistryId: asString(entry.tr_id), title, vprId}];
    });
  } catch (error) {
    debug(`schema list fetch failed: ${error}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

export const findSchemaId = (
  schemas: Array<VeranaSchema>,
  options: {vct?: string; title?: string},
): string | undefined => {
  const direct = schemaIdFromVct(options.vct);
  if (direct) {
    return direct;
  }

  if (options.vct) {
    const byVprId = schemas.find(schema => schema.vprId === options.vct);
    if (byVprId) {
      return byVprId.id;
    }
  }

  // A title is only trusted when exactly one schema carries it - `ServiceCredential` alone is
  // registered a dozen times over on testnet.
  if (options.title) {
    const byTitle = schemas.filter(schema => schema.title === options.title);
    if (byTitle.length === 1) {
      return byTitle[0].id;
    }
  }

  return undefined;
};

let permissionCache:
  | {at: number; permissions: Array<VeranaPermission>}
  | undefined;

export const resetPermissionCache = () => {
  permissionCache = undefined;
};

export const fetchPermissions = async (options?: {
  limit?: number;
}): Promise<Array<VeranaPermission> | undefined> => {
  const limit = options?.limit ?? RESPONSE_MAX_SIZE;
  if (
    permissionCache &&
    Date.now() - permissionCache.at < PERMISSION_CACHE_TTL_MS
  ) {
    return permissionCache.permissions;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${VERANA_API_URL}/verana/perm/v1/list?response_max_size=${limit}`,
      {signal: controller.signal},
    );
    if (!response.ok) {
      debug(`permission list returned ${response.status}`);
      return undefined;
    }

    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      !Array.isArray(body.permissions) ||
      body.permissions.length >= limit
    ) {
      return undefined;
    }

    const permissions = body.permissions
      .map(parsePermission)
      .filter(
        (permission): permission is VeranaPermission =>
          permission !== undefined,
      );
    permissionCache = {at: Date.now(), permissions};
    return permissions;
  } catch (error) {
    debug(`permission list fetch failed: ${error}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

const vprTypeCode = (role: 'ISSUER' | 'VERIFIER'): number =>
  role === 'ISSUER' ? 1 : 2;

export const fetchPermissionsForDid = async (options: {
  did: string;
  role: 'ISSUER' | 'VERIFIER';
  schemaId: string;
}): Promise<Array<VeranaPermission> | undefined> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PERMISSION_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${VERANA_API_URL}/verana/perm/v1/find_with_did?did=${encodeURIComponent(
        options.did,
      )}&type=${vprTypeCode(options.role)}&schema_id=${encodeURIComponent(
        options.schemaId,
      )}`,
      {signal: controller.signal},
    );
    // 404 means the schema is not on chain, a determinate zero rather than a failure, so it denies.
    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      debug(`permission lookup returned ${response.status}`);
      return undefined;
    }

    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.permissions)) {
      return undefined;
    }

    return body.permissions
      .map(parsePermission)
      .filter(
        (permission): permission is VeranaPermission =>
          permission !== undefined,
      );
  } catch (error) {
    debug(`permission lookup failed: ${error}`);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
};

type AccreditationOutcome =
  | {status: 'unreachable'}
  | {status: 'unresolved-schema'}
  | {status: 'checked'; accreditation: VeranaAccreditation};

const resolveAccreditationOutcome = async (options: {
  did: string;
  role: 'ISSUER' | 'VERIFIER';
  schemaId?: string;
  vct?: string;
  title?: string;
}): Promise<AccreditationOutcome> => {
  let schemaId =
    options.schemaId ??
    (options.vct ? await resolveSchemaIdFromVct(options.vct) : undefined);

  if (!schemaId) {
    const schemas = await fetchSchemas();
    if (!schemas) {
      return {status: 'unreachable'};
    }
    schemaId = findSchemaId(schemas, {vct: options.vct, title: options.title});
  }
  if (!schemaId) {
    return {status: 'unresolved-schema'};
  }

  const permissions = await fetchPermissionsForDid({
    did: options.did,
    role: options.role,
    schemaId,
  });
  if (!permissions) {
    return {status: 'unreachable'};
  }

  return {
    status: 'checked',
    accreditation: findAccreditation(permissions, {
      did: options.did,
      schemaId,
      role: options.role,
    }),
  };
};

export const resolveAccreditation = async (options: {
  did: string;
  role: 'ISSUER' | 'VERIFIER';
  schemaId?: string;
  vct?: string;
  title?: string;
}): Promise<VeranaAccreditation | undefined> => {
  const outcome = await resolveAccreditationOutcome(options);
  return outcome.status === 'checked' ? outcome.accreditation : undefined;
};

// `granted: undefined` is could-not-determine, not a refusal: an unreachable registry or an
// unmatched schema must never render as "not accredited". Only a VPR answer sets true or false.
export const checkVeranaAccreditation = async (options: {
  did: string;
  role: 'issuer' | 'verifier';
  schemaId?: string;
  vct?: string;
  title?: string;
}): Promise<VeranaAccreditationCheck> => {
  const role = options.role === 'issuer' ? 'ISSUER' : 'VERIFIER';
  const outcome = await resolveAccreditationOutcome({
    did: options.did,
    role,
    schemaId: options.schemaId,
    vct: options.vct,
    title: options.title,
  });

  if (outcome.status === 'unreachable') {
    return {
      granted: undefined,
      reason:
        'The Verana registry could not be reached, so this permission could not be checked',
    };
  }
  if (outcome.status === 'unresolved-schema') {
    return {
      granted: undefined,
      reason:
        'This credential type could not be matched to a Verana schema, so the permission could not be checked',
    };
  }

  const {accreditation} = outcome;
  return accreditation.granted
    ? {
        granted: true,
        reason: `An active ${options.role} permission covers this schema`,
      }
    : {
        granted: false,
        reason:
          accreditation.reason ??
          `No ${options.role} permission for this schema`,
      };
};

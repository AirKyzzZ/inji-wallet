const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isVctPath = (path: unknown): boolean =>
  path === '$.vct' || path === "$['vct']" || path === '$["vct"]';

const vctFromFilter = (filter: unknown): string | undefined => {
  if (!isRecord(filter)) {
    return undefined;
  }
  if (typeof filter.const === 'string') {
    return filter.const;
  }
  if (
    Array.isArray(filter.enum) &&
    filter.enum.length === 1 &&
    typeof filter.enum[0] === 'string'
  ) {
    return filter.enum[0];
  }
  // A pattern is normally a regex and means nothing as a credential type, but a wallet that
  // parses the request into its own model can drop `const` entirely (inji-openid4vp keeps only
  // type and pattern), and then the escaped literal is all that survives. Follow it only when it
  // matches exactly one string.
  return typeof filter.pattern === 'string'
    ? literalFromPattern(filter.pattern)
    : undefined;
};

/**
 * The one string a fully-escaped pattern can match, or undefined when it can match more than one.
 */
const literalFromPattern = (pattern: string): string | undefined => {
  const body = pattern.replace(/^\^/, '').replace(/\$$/, '');
  // Every metacharacter must be escaped for the pattern to denote a single string. Drop the
  // escaped pairs first: whatever metacharacter is left over was meant as a regex operator.
  if (/[.*+?^${}()|[\]]/.test(body.replace(/\\./g, ''))) {
    return undefined;
  }
  return body.replace(/\\(.)/g, '$1');
};

export const vctFromPresentationDefinition = (
  definition: unknown,
): string | undefined => {
  // A wallet that parses the request into its own model and hands it back may rename these
  // fields to match that model, so both spellings of the descriptor list are accepted. Missing
  // it entirely left the vct empty and the accreditation check with nothing to gate on.
  const descriptors = isRecord(definition)
    ? definition.input_descriptors ?? definition.inputDescriptors
    : undefined;
  if (!Array.isArray(descriptors)) {
    return undefined;
  }

  const vcts = new Set<string>();
  for (const descriptor of descriptors) {
    if (!isRecord(descriptor) || !isRecord(descriptor.constraints)) {
      continue;
    }
    const fields = descriptor.constraints.fields;
    if (!Array.isArray(fields)) {
      continue;
    }
    for (const field of fields) {
      if (!isRecord(field) || !Array.isArray(field.path)) {
        continue;
      }
      if (!field.path.some(isVctPath)) {
        continue;
      }
      const vct = vctFromFilter(field.filter);
      if (vct) {
        vcts.add(vct);
      }
    }
  }

  // Only an unambiguous answer is useful: a request spanning several credential types has no
  // single schema to gate on, and guessing would check the wrong permission.
  return vcts.size === 1 ? [...vcts][0] : undefined;
};

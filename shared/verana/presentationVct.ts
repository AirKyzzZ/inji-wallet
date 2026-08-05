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
  // A `pattern` is a regex, not a credential type, so it is never followed.
  return Array.isArray(filter.enum) &&
    filter.enum.length === 1 &&
    typeof filter.enum[0] === 'string'
    ? filter.enum[0]
    : undefined;
};

export const vctFromPresentationDefinition = (
  definition: unknown,
): string | undefined => {
  if (!isRecord(definition) || !Array.isArray(definition.input_descriptors)) {
    return undefined;
  }

  const vcts = new Set<string>();
  for (const descriptor of definition.input_descriptors) {
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

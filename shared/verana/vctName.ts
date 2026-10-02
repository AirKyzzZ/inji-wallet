const cache = new Map<string, string | undefined>();

const displayName = (metadata: unknown): string | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const record = metadata as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name.trim()) {
    return record.name.trim();
  }
  const display = record.display;
  if (Array.isArray(display)) {
    for (const entry of display) {
      if (entry && typeof entry === 'object') {
        const name = (entry as Record<string, unknown>).name;
        if (typeof name === 'string' && name.trim()) return name.trim();
      }
    }
  }
  return undefined;
};

export const credentialNameFromVct = async (
  vct?: string,
): Promise<string | undefined> => {
  if (!vct || !/^https:\/\//i.test(vct)) return undefined;
  if (cache.has(vct)) return cache.get(vct);

  let name: string | undefined;
  try {
    const response = await fetch(vct, {headers: {Accept: 'application/json'}});
    if (response.ok) {
      name = displayName(await response.json());
    }
  } catch {
    name = undefined;
  }
  cache.set(vct, name);
  return name;
};

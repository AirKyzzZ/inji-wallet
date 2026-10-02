export type Route = {status?: number; body: unknown} | Error;

export const didLog = (state: unknown) => ({
  body: `${JSON.stringify({versionId: '1-Qm', state})}\n`,
});

export const routeFetch = (routes: Record<string, Route>) =>
  jest.fn(async (url: string) => {
    const route = routes[url] ?? {status: 404, body: {}};
    if (route instanceof Error) throw route;
    const status = route.status ?? 200;
    const text =
      typeof route.body === 'string' ? route.body : JSON.stringify(route.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  });

export const installFetch = (routes: Record<string, Route>) => {
  const mock = routeFetch(routes);
  global.fetch = mock as unknown as typeof fetch;
  return mock;
};

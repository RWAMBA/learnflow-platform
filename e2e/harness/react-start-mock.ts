/** Test-only stand-in for @tanstack/react-start used by the Playwright harness.
 * Routes the preflight server function through a plain HTTP endpoint the test
 * can intercept, without touching application code. */
export function useServerFn() {
  return async () => {
    const res = await fetch("/__preflight");
    if (!res.ok) throw new Error(`Preflight request failed with ${res.status}`);
    return res.json();
  };
}

/** The banner imports the real server function module, which declares its
 * function with createServerFn; the harness only needs a chainable no-op. */
export function createServerFn() {
  const chain = {
    inputValidator: () => chain,
    middleware: () => chain,
    handler: () => async () => undefined,
  };
  return chain;
}

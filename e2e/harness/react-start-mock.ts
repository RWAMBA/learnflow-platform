/** Test-only stand-in for @tanstack/react-start used by the Playwright harness.
 *
 * The banner itself fetches the `/api/env-preflight` server route directly, so
 * nothing here needs to emulate transport; the mock exists purely so that any
 * module pulled into the harness graph which declares a server function can be
 * evaluated in a plain browser bundle. */

/** Chainable no-op standing in for createServerFn declarations. */
export function createServerFn() {
  const chain = {
    inputValidator: () => chain,
    middleware: () => chain,
    handler: () => async () => undefined,
  };
  return chain;
}

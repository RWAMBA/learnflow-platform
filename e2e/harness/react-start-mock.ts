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

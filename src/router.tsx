import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";
import { installDocumentCsp } from "./lib/csp-ssr";

/**
 * Mints the per-response CSP nonce and installs the matching policy header
 * during SSR. TanStack Router threads `ssr.nonce` onto every inline script it
 * emits (hydration payload and stream barrier), so the document needs no
 * `'unsafe-inline'` for scripts. On the client the branch is stripped and the
 * nonce is undefined — hydration reads the attribute already in the markup.
 */
const resolveCspNonce = createIsomorphicFn()
  .client((): string | undefined => undefined)
  .server((): string | undefined => installDocumentCsp());

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ssr: { nonce: resolveCspNonce() },
  });

  return router;
};

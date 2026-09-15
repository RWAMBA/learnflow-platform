import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HarnessPage } from "./public-page";
import "@/styles.css";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const rootRoute = createRootRoute();
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HarnessPage,
});
const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

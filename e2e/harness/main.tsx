import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EnvPreflightBanner } from "@/components/shared/env-preflight-banner";
import "@/styles.css";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <EnvPreflightBanner />
    </QueryClientProvider>
  </StrictMode>,
);

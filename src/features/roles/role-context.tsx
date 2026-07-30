import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchViewerContext, viewerContextQueryKey } from "./api";
import type { ActiveRole, ViewerContext } from "./types";

const STORAGE_KEY = "platform.active-user-role-id";

interface RoleContextValue {
  viewer: ViewerContext;
  activeRole: ActiveRole | null;
  setActiveRoleId: (userRoleId: string) => void;
  /** True when the switcher should be rendered (more than one active role). */
  hasMultipleRoles: boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: viewerContextQueryKey(userId),
    queryFn: () => fetchViewerContext(userId),
  });

  const [activeRoleId, setActiveRoleIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setActiveRoleIdState(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const setActiveRoleId = (userRoleId: string) => {
    setActiveRoleIdState(userRoleId);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, userRoleId);
  };

  const value = useMemo<RoleContextValue | null>(() => {
    if (!data) return null;
    const activeRole =
      data.roles.find((role) => role.userRoleId === activeRoleId) ?? data.roles[0] ?? null;
    return {
      viewer: data,
      activeRole,
      setActiveRoleId,
      hasMultipleRoles: data.roles.length > 1,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeRoleId]);

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6" role="status" aria-live="polite">
        <p className="text-muted-foreground">Loading your workspace…</p>
      </div>
    );
  }

  if (error || !value) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">We couldn't load your account</h1>
          <p className="mt-2 text-muted-foreground">
            Your roles and organization could not be read. Please try again.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRoleContext() {
  const context = useContext(RoleContext);
  if (!context) throw new Error("useRoleContext must be used inside a RoleProvider");
  return context;
}

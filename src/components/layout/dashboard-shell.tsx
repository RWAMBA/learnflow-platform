import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MainNav } from "./main-nav";
import { NotificationBell } from "./notification-bell";
import { ProfileMenu } from "./profile-menu";
import { RoleSwitcher } from "./role-switcher";
import { EnvPreflightBanner } from "@/components/shared/env-preflight-banner";

/**
 * One shared shell for every role. Widgets and navigation are filtered by
 * permission rather than duplicated into per-role dashboards.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="text-base font-semibold tracking-tight">
            Dashboard
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <RoleSwitcher />
            <NotificationBell />
            <ProfileMenu />
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl overflow-x-auto px-2 pb-2">
          <MainNav />
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-6">
        <EnvPreflightBanner />
        {children}
      </main>
    </div>
  );
}

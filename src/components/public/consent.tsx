/**
 * GDPR consent management for the public website.
 *
 * Optional categories default to OFF and nothing optional loads, initialises
 * or fires a network request before an explicit opt-in. Accept, Reject and
 * Preferences are equally prominent; there is no cookie wall and no
 * pre-selected optional category. Withdrawal is one click and immediately
 * deletes the storage those categories controlled.
 *
 * Consent is versioned and expires, so it must be reaffirmed rather than
 * assumed indefinitely. Optional analytics stay disabled on authenticated
 * learner surfaces regardless of what was chosen publicly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_TTL_DAYS,
  CONSENT_VERSION,
} from "@/lib/public-site.constants";

export interface ConsentState {
  version: string;
  decidedAt: string;
  /** Strictly necessary is not a choice and is therefore not stored as one. */
  analytics: boolean;
  preferences: boolean;
}

interface ConsentContextValue {
  consent: ConsentState | null;
  hydrated: boolean;
  open: () => void;
  acceptAll: () => void;
  rejectAll: () => void;
  save: (next: Pick<ConsentState, "analytics" | "preferences">) => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    const ageDays = (Date.now() - Date.parse(parsed.decidedAt)) / 86400000;
    if (!Number.isFinite(ageDays) || ageDays > CONSENT_TTL_DAYS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Removes every browser artefact the optional categories controlled. */
function clearOptionalStorage() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("lf_pref_") || key.startsWith("lf_analytics_"))
        localStorage.removeItem(key);
    }
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name && (name.startsWith("_lf_a") || name.startsWith("_lf_p"))) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      }
    }
  } catch {
    // Storage may be unavailable; withdrawal still stands in memory.
  }
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, preferences: false });

  useEffect(() => {
    const stored = readConsent();
    setConsent(stored);
    setDraft({ analytics: stored?.analytics ?? false, preferences: stored?.preferences ?? false });
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Pick<ConsentState, "analytics" | "preferences">) => {
    const state: ConsentState = {
      version: CONSENT_VERSION,
      decidedAt: new Date().toISOString(),
      ...next,
    };
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // A blocked storage write must not break the page.
    }
    if (!next.analytics && !next.preferences) clearOptionalStorage();
    setConsent(state);
    setDialogOpen(false);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      hydrated,
      open: () => setDialogOpen(true),
      acceptAll: () => persist({ analytics: true, preferences: true }),
      rejectAll: () => persist({ analytics: false, preferences: false }),
      save: persist,
    }),
    [consent, hydrated, persist],
  );

  const needsDecision = hydrated && consent === null;

  return (
    <ConsentContext.Provider value={value}>
      {children}

      {needsDecision ? (
        <section
          aria-labelledby="consent-banner-title"
          className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/98 p-4 shadow-lg backdrop-blur"
        >
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
            <h2 id="consent-banner-title" className="text-sm font-semibold">
              Your privacy choices
            </h2>
            <p className="text-sm text-muted-foreground">
              We use strictly necessary cookies to keep this site secure, including a bot-protection
              check on our forms. Optional cookies stay switched off unless you turn them on. You
              can change this at any time from “Cookie preferences” in the footer.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" onClick={value.acceptAll}>
                Accept all
              </Button>
              <Button className="min-h-11" variant="secondary" onClick={value.rejectAll}>
                Reject all
              </Button>
              <Button className="min-h-11" variant="outline" onClick={value.open}>
                Preferences
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              Optional categories are off by default. Nothing optional loads until you turn it on.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Strictly necessary</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Session security, sign-in and the Cloudflare Turnstile bot check on public forms.
                These cannot be switched off because the site cannot operate safely without them.
              </p>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor="consent-preferences" className="text-sm font-medium">
                  Preferences
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Remembers display choices you make on public pages.
                </p>
              </div>
              <Switch
                id="consent-preferences"
                checked={draft.preferences}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, preferences: v }))}
              />
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor="consent-analytics" className="text-sm font-medium">
                  Analytics
                </Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  Not currently in use. No analytics provider is installed, and none will load
                  without this switch turned on.
                </p>
              </div>
              <Switch
                id="consent-analytics"
                checked={draft.analytics}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="secondary" className="min-h-11" onClick={value.rejectAll}>
              Reject all
            </Button>
            <Button className="min-h-11" onClick={() => persist(draft)}>
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used inside ConsentProvider");
  return ctx;
}

/** Re-opens the consent dialog so a decision can be changed at any time. */
export function ConsentPreferencesButton() {
  const { open } = useConsent();
  return (
    <Button variant="outline" className="min-h-11" onClick={open}>
      Change cookie preferences
    </Button>
  );
}

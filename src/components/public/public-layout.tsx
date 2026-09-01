/**
 * Public website shell.
 *
 * Renders with no backend data at all, so an outage degrades individual
 * sections rather than blanking the site. Order in the DOM matters: the skip
 * link comes first so the status bar can never obscure it.
 */
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppStatusBar } from "./app-status-bar";
import { ConsentProvider, useConsent } from "./consent";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/why-choose-us", label: "Why choose us" },
  { to: "/services", label: "Services" },
  { to: "/guide", label: "Guide" },
  { to: "/testimonials", label: "Testimonials" },
  { to: "/faqs", label: "FAQs" },
  { to: "/merchandise", label: "Merchandise" },
  { to: "/contact", label: "Contact" },
] as const;

function CookiePreferencesButton() {
  const { open } = useConsent();
  return (
    <button
      type="button"
      onClick={open}
      className="min-h-11 text-left text-sm underline underline-offset-4 hover:no-underline"
    >
      Cookie preferences
    </button>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          LearnFlow
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden lg:block">
          <ul className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  activeProps={{ className: "bg-muted font-semibold" }}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button asChild size="sm" className="hidden min-h-11 sm:inline-flex">
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 lg:hidden"
            aria-expanded={open}
            aria-controls="public-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </Button>
        </div>
      </div>

      {open ? (
        <nav id="public-mobile-nav" aria-label="Primary mobile" className="border-t lg:hidden">
          <ul className="mx-auto w-full max-w-6xl px-2 py-2">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  activeProps={{ className: "bg-muted font-semibold" }}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to="/auth"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold hover:bg-muted"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t bg-muted/30">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-base font-semibold">LearnFlow</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Curriculum, learning and administration for homeschools, tutors and schools.
          </p>
        </div>


        <nav aria-label="Explore">
          <h2 className="text-sm font-semibold">Explore</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {NAV.slice(1).map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="inline-flex min-h-11 items-center hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Get involved">
          <h2 className="text-sm font-semibold">Get involved</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link to="/consultation" className="inline-flex min-h-11 items-center hover:underline">
                Book a consultation
              </Link>
            </li>
            <li>
              <Link to="/instructors/apply" className="inline-flex min-h-11 items-center hover:underline">
                Teach with us
              </Link>
            </li>
            <li>
              <Link to="/auth" className="inline-flex min-h-11 items-center hover:underline">
                Sign in to LearnFlow
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legal">
          <h2 className="text-sm font-semibold">Legal</h2>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <Link to="/privacy-policy" className="inline-flex min-h-11 items-center hover:underline">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link to="/cookie-policy" className="inline-flex min-h-11 items-center hover:underline">
                Cookie Policy
              </Link>
            </li>
            <li>
              <CookiePreferencesButton />
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t">
        <section className="mx-auto w-full max-w-6xl px-4 py-10" aria-labelledby="newsletter-heading">
          <h2 id="newsletter-heading" className="text-sm font-semibold">
            LearnFlow updates
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Occasional email about curriculum changes, new features and homeschooling guidance. Double
            opt-in, and you can withdraw at any time.
          </p>
          <div className="mt-4 max-w-md">
            <NewsletterSignup />
          </div>
        </section>
      </div>
    </footer>

  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <ConsentProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppStatusBar />
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </ConsentProvider>
  );
}

/** Shared page heading used by every public route. */
export function PublicPageHeader({
  title,
  intro,
  eyebrow,
}: {
  title: string;
  intro?: string;
  eyebrow?: string;
}) {
  return (
    <div className="border-b bg-muted/20">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        {eyebrow ? (
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {intro ? <p className="mt-3 max-w-2xl text-base text-muted-foreground">{intro}</p> : null}
      </div>
    </div>
  );
}

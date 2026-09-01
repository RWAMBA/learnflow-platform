/**
 * Stage 3 — shared public-website constants.
 *
 * Values here are safe on both sides of the boundary: they are policy numbers
 * and identifiers, never credentials. Every salt, secret key and provider
 * credential is read server-side only (see public-site.server.ts).
 */

/** Version of the newsletter consent wording currently presented. */
export const NEWSLETTER_CONSENT_VERSION = "2026-09-01";

/** Version of the published privacy/cookie policy pair. */
export const POLICY_VERSION = "2026-09-01";

/** Exact consent sentence stored as evidence with every newsletter opt-in. */
export const NEWSLETTER_CONSENT_TEXT =
  "I agree to receive the LearnFlow newsletter by email and understand I can withdraw at any time using the link in every message.";

/** Retention windows, in days. Provisional until the controller approves them. */
export const RETENTION_DAYS = {
  inquiry: 365,
  newsletter: 1095,
} as const;

/** Confirmation-token lifetime for double opt-in. */
export const NEWSLETTER_TOKEN_TTL_MINUTES = 60 * 24 * 3;

/**
 * Durable rate-limit census. Every protected surface below is enforced by
 * public.consume_rate_limit against a server-derived bucket key.
 */
export const RATE_LIMITS = {
  health: { limit: 60, windowSeconds: 60 },
  contact: { limit: 3, windowSeconds: 900 },
  consultation: { limit: 3, windowSeconds: 900 },
  merchandise: { limit: 5, windowSeconds: 900 },
  instructor_application: { limit: 2, windowSeconds: 3600 },
  upload_ticket: { limit: 6, windowSeconds: 3600 },
  signed_download: { limit: 30, windowSeconds: 3600 },
  newsletter_subscribe: { limit: 3, windowSeconds: 3600 },
  newsletter_confirm: { limit: 10, windowSeconds: 3600 },
  newsletter_unsubscribe: { limit: 10, windowSeconds: 3600 },
  cms_mutation: { limit: 120, windowSeconds: 300 },
  inquiry_admin_action: { limit: 120, windowSeconds: 300 },
  relationship_invite: { limit: 20, windowSeconds: 3600 },
  messaging_send: { limit: 60, windowSeconds: 300 },
  search: { limit: 60, windowSeconds: 60 },
  assessment_analytics: { limit: 30, windowSeconds: 300 },
  email_trigger: { limit: 10, windowSeconds: 3600 },
} as const;

export type RateLimitPurpose = keyof typeof RATE_LIMITS;

/** Stable machine-readable error codes returned by the public boundary. */
export const PUBLIC_ERROR = {
  rateLimited: "RATE_LIMITED",
  validation: "VALIDATION_FAILED",
  botCheck: "BOT_CHECK_FAILED",
  notConfigured: "NOT_CONFIGURED",
  unavailable: "SERVICE_UNAVAILABLE",
} as const;

/** Minimum time a human plausibly needs to complete a public form. */
export const MIN_FORM_FILL_MS = 3000;

/** Upload bounds for instructor recruitment documents. */
export const UPLOAD_LIMITS = {
  maxFiles: 3,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  /** SVG and HTML are refused outright in Stage 3. */
  allowed: [
    { extension: "pdf", mime: "application/pdf", magic: "%PDF-" },
    {
      extension: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      magic: "PK\u0003\u0004",
    },
  ],
} as const;

export const CONSENT_STORAGE_KEY = "lf_consent";
export const CONSENT_VERSION = "2026-09-01";
/** Consent expires so it must be reaffirmed rather than assumed forever. */
export const CONSENT_TTL_DAYS = 180;

export const PUBLIC_ROUTES = [
  { path: "/", label: "Home", nav: true, changefreq: "weekly", priority: 1.0 },
  { path: "/about", label: "About", nav: true, changefreq: "monthly", priority: 0.7 },
  {
    path: "/why-choose-us",
    label: "Why choose us",
    nav: true,
    changefreq: "monthly",
    priority: 0.7,
  },
  { path: "/services", label: "Services", nav: true, changefreq: "monthly", priority: 0.8 },
  { path: "/guide", label: "Guide", nav: true, changefreq: "weekly", priority: 0.8 },
  { path: "/testimonials", label: "Testimonials", nav: true, changefreq: "monthly", priority: 0.5 },
  { path: "/faqs", label: "FAQs", nav: true, changefreq: "monthly", priority: 0.6 },
  { path: "/merchandise", label: "Merchandise", nav: true, changefreq: "weekly", priority: 0.6 },
  { path: "/contact", label: "Contact", nav: true, changefreq: "yearly", priority: 0.6 },
  {
    path: "/consultation",
    label: "Book a consultation",
    nav: false,
    changefreq: "yearly",
    priority: 0.6,
  },
  {
    path: "/instructors/apply",
    label: "Teach with us",
    nav: false,
    changefreq: "yearly",
    priority: 0.5,
  },
  {
    path: "/privacy-policy",
    label: "Privacy Policy",
    nav: false,
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/cookie-policy",
    label: "Cookie Policy",
    nav: false,
    changefreq: "yearly",
    priority: 0.3,
  },
] as const;

/**
 * Money is stored in fixed-precision minor units with an explicit currency, so
 * formatting never guesses. A missing price is shown as "on request" rather
 * than as a zero we cannot substantiate.
 */
export function formatMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor == null || !currency) return "Price on request";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      amountMinor / 100,
    );
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

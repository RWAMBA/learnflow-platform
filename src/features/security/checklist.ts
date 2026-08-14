import { MIN_PASSWORD_LENGTH } from "@/features/auth/schemas";
import { passwordRules } from "@/features/auth/password-rules";

export type ChecklistStatus = "compliant" | "attention" | "manual";

export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  status: ChecklistStatus;
  detail: string;
  steps?: string[];
  link?: { label: string; href: string };
};

export const securityChecklist: ChecklistItem[] = [
  {
    id: "min-length",
    title: `Minimum password length (${MIN_PASSWORD_LENGTH}+)`,
    description: "Sign-up, reset and change-password forms reject shorter passwords.",
    status: "compliant",
    detail: `Enforced in the app schemas and mirrored in supabase/config.toml (minimum_password_length = ${MIN_PASSWORD_LENGTH}).`,
  },
  {
    id: "complexity",
    title: "Password complexity rules",
    description: "Lowercase, uppercase, digits, symbols and no repeated runs.",
    status: "compliant",
    detail: `${passwordRules.length} rules are validated live on every password field: ${passwordRules
      .map((rule) => rule.label.toLowerCase())
      .join("; ")}.`,
  },
  {
    id: "strength-meter",
    title: "Live strength meter and checklist",
    description: "Users see rule-by-rule feedback before submitting.",
    status: "compliant",
    detail: "Shown on sign-up, password reset and the account password change form.",
  },
  {
    id: "lockout",
    title: "Server-side retry cooldown",
    description: "Repeated wrong current-password attempts trigger a lockout.",
    status: "compliant",
    detail:
      "Attempts are recorded in the password_change_attempts table with RLS, so refreshing the page cannot bypass the cooldown.",
  },
  {
    id: "leaked-password-protection",
    title: "Leaked password protection",
    description: "Blocks passwords found in known breach corpora (HaveIBeenPwned).",
    status: "attention",
    detail:
      "This is a hosted Supabase Auth project setting — it cannot be enabled from application code or SQL, and the security scanner still reports it as disabled.",
    steps: [
      "Open Supabase Dashboard → Authentication → Sign In / Providers → Email.",
      "Under Password settings, enable Leaked password protection.",
      `Set Minimum password length to ${MIN_PASSWORD_LENGTH}.`,
      "Set Password requirements to lowercase, uppercase letters, digits and symbols.",
      "Save the settings.",
    ],
    link: {
      label: "Supabase password settings",
      href: "https://supabase.com/dashboard/project/smvlwwevgtwkdndxfmtp/auth/providers",
    },
  },
  {
    id: "hosted-policy-parity",
    title: "Hosted Auth policy matches app policy",
    description: "Supabase should reject weak passwords even outside the app forms.",
    status: "manual",
    detail:
      "supabase/config.toml declares the intended policy, but the hosted project settings must be saved manually to take effect for API-level sign-ups.",
    link: {
      label: "Supabase password settings",
      href: "https://supabase.com/dashboard/project/smvlwwevgtwkdndxfmtp/auth/providers",
    },
  },
  {
    id: "email-confirm",
    title: "Email confirmation on sign-up",
    description: "New accounts verify ownership of their address.",
    status: "manual",
    detail:
      "Confirm that 'Confirm email' is enabled in Supabase Authentication settings for production use.",
    link: {
      label: "Supabase auth providers",
      href: "https://supabase.com/dashboard/project/smvlwwevgtwkdndxfmtp/auth/providers",
    },
  },
];

export function summarizeChecklist(items: ChecklistItem[] = securityChecklist) {
  const compliant = items.filter((item) => item.status === "compliant").length;
  const attention = items.filter((item) => item.status === "attention").length;
  const manual = items.filter((item) => item.status === "manual").length;
  return {
    compliant,
    attention,
    manual,
    total: items.length,
    score: Math.round((compliant / items.length) * 100),
  };
}

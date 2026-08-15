import { MIN_PASSWORD_LENGTH } from "./schemas";

export type PasswordRule = {
  id: string;
  label: string;
  test: (value: string) => boolean;
};

export const passwordRules: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (value) => value.length >= MIN_PASSWORD_LENGTH,
  },
  { id: "lower", label: "A lowercase letter", test: (value) => /[a-z]/.test(value) },
  { id: "upper", label: "An uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { id: "number", label: "A number", test: (value) => /[0-9]/.test(value) },
  { id: "symbol", label: "A symbol", test: (value) => /[^A-Za-z0-9]/.test(value) },
  {
    id: "repeat",
    label: "No character repeated 3+ times in a row",
    test: (value) => value.length > 0 && !/(.)\1{2,}/.test(value),
  },
];

export type PasswordStrength = {
  passed: number;
  total: number;
  score: number;
  label: string;
  results: Array<PasswordRule & { met: boolean }>;
};

export function evaluatePassword(value: string): PasswordStrength {
  const results = passwordRules.map((rule) => ({ ...rule, met: rule.test(value) }));
  const passed = results.filter((rule) => rule.met).length;
  const total = results.length;
  const score = Math.round((passed / total) * 100);
  const label =
    value.length === 0
      ? "Enter a password"
      : passed === total
        ? "Strong"
        : passed >= total - 2
          ? "Almost there"
          : passed >= 2
            ? "Weak"
            : "Very weak";
  return { passed, total, score, label, results };
}

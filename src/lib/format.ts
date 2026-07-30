const dateFormatter = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeZone: "Africa/Nairobi",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-KE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
});

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return dateTimeFormatter.format(new Date(value));
}

export function formatCurrency(amount: number | null | undefined, currency: string) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(amount);
}

export function isOverdue(dueAt: string | null | undefined, status: string) {
  if (!dueAt) return false;
  if (status === "graded" || status === "submitted") return false;
  return new Date(dueAt).getTime() < Date.now();
}

export function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Stage 2 — Extracurricular Programmes.
 *
 * School-level only. Completion is an enrollment status and nothing else:
 * there is no certificate, badge, credential or higher-learning progression
 * anywhere in this module, by architectural decision.
 */

export const PROGRAMME_CATEGORIES = [
  "academic",
  "language",
  "arts",
  "music",
  "stem",
  "sport",
  "technology",
  "life_skills",
  "enrichment",
] as const;

export type ProgrammeCategory = (typeof PROGRAMME_CATEGORIES)[number];

export const PROGRAMME_CATEGORY_LABELS: Record<ProgrammeCategory, string> = {
  academic: "Academic",
  language: "Language",
  arts: "Arts",
  music: "Music",
  stem: "STEM",
  sport: "Sport",
  technology: "Technology",
  life_skills: "Life skills",
  enrichment: "Enrichment",
};

export const PROGRAMME_STATUSES = ["draft", "published", "archived"] as const;
export type ProgrammeStatus = (typeof PROGRAMME_STATUSES)[number];

export const PROGRAMME_STATUS_LABELS: Record<ProgrammeStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

/** Transitions the database accepts for a programme. Archiving is terminal. */
export const ALLOWED_PROGRAMME_TRANSITIONS: Record<ProgrammeStatus, ProgrammeStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: [],
};

export const PROGRAMME_ENROLLMENT_STATUSES = [
  "enrolled",
  "active",
  "completed",
  "withdrawn",
  "archived",
] as const;

export type ProgrammeEnrollmentStatus = (typeof PROGRAMME_ENROLLMENT_STATUSES)[number];

export const PROGRAMME_ENROLLMENT_STATUS_LABELS: Record<ProgrammeEnrollmentStatus, string> = {
  enrolled: "Enrolled",
  active: "Active",
  completed: "Completed",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

/**
 * Mirrors app_private.enforce_programme_enrollment_lifecycle. The database
 * remains authoritative; this only decides which buttons are worth rendering.
 */
export const ALLOWED_PROGRAMME_ENROLLMENT_TRANSITIONS: Record<
  ProgrammeEnrollmentStatus,
  ProgrammeEnrollmentStatus[]
> = {
  enrolled: ["active", "withdrawn"],
  active: ["completed", "withdrawn"],
  completed: ["archived"],
  withdrawn: ["archived"],
  archived: [],
};

/** An enrollment that still occupies a place against capacity. */
export const OCCUPYING_ENROLLMENT_STATUSES: ProgrammeEnrollmentStatus[] = ["enrolled", "active"];

export const PROGRAMME_INSTRUCTOR_STATUSES = ["active", "ended"] as const;
export type ProgrammeInstructorStatus = (typeof PROGRAMME_INSTRUCTOR_STATUSES)[number];

export function programmePlacesRemaining(
  capacity: number | null,
  occupied: number,
): number | null {
  if (capacity === null) return null;
  return Math.max(capacity - occupied, 0);
}

export function programmeIsFull(capacity: number | null, occupied: number): boolean {
  if (capacity === null) return false;
  return occupied >= capacity;
}

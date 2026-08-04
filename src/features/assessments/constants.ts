/** Shared, client-safe vocabulary for the Assessments & Examinations module. */

export const ASSESSMENT_STATUSES = [
  "draft",
  "review",
  "scheduled",
  "published",
  "open",
  "in_progress",
  "submitted",
  "grading",
  "reviewed",
  "completed",
  "archived",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: "Draft",
  review: "In review",
  scheduled: "Scheduled",
  published: "Published",
  open: "Open",
  in_progress: "In progress",
  submitted: "Submitted",
  grading: "Grading",
  reviewed: "Reviewed",
  completed: "Completed",
  archived: "Archived",
};

/** Statuses a learner may work on. */
export const LEARNER_VISIBLE_STATUSES: AssessmentStatus[] = [
  "published",
  "open",
  "in_progress",
  "submitted",
  "grading",
  "reviewed",
  "completed",
];

/** Allowed lifecycle transitions — the single source of truth for the UI. */
export const ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  draft: ["review", "scheduled", "published", "archived"],
  review: ["draft", "scheduled", "published", "archived"],
  scheduled: ["published", "open", "draft", "archived"],
  published: ["open", "scheduled", "archived"],
  open: ["in_progress", "submitted", "grading", "archived"],
  in_progress: ["submitted", "grading", "open", "archived"],
  submitted: ["grading", "open", "archived"],
  grading: ["reviewed", "completed", "archived"],
  reviewed: ["completed", "grading", "archived"],
  completed: ["archived", "reviewed"],
  archived: ["draft"],
};

export const SUBMISSION_STATUSES = [
  "in_progress",
  "submitted",
  "grading",
  "graded",
  "reviewed",
  "returned",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  in_progress: "In progress",
  submitted: "Submitted",
  grading: "Grading",
  graded: "Graded",
  reviewed: "Reviewed",
  returned: "Returned",
};

export const QUESTION_TYPES = [
  "multiple_choice",
  "multiple_response",
  "true_false",
  "short_answer",
  "long_answer",
  "essay",
  "fill_blank",
  "matching",
  "ordering",
  "numeric",
  "file_upload",
  "drawing",
  "audio_response",
  "video_response",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  multiple_response: "Multiple response",
  true_false: "True / False",
  short_answer: "Short answer",
  long_answer: "Long answer",
  essay: "Essay",
  fill_blank: "Fill in the blank",
  matching: "Matching",
  ordering: "Ordering",
  numeric: "Numeric",
  file_upload: "File upload",
  drawing: "Drawing (placeholder)",
  audio_response: "Audio response (placeholder)",
  video_response: "Video response (placeholder)",
};

/** Types the engine can score without a teacher. */
export const AUTO_GRADABLE_TYPES: QuestionType[] = [
  "multiple_choice",
  "multiple_response",
  "true_false",
  "short_answer",
  "fill_blank",
  "numeric",
  "ordering",
];

/** Types whose editor collects a list of options. */
export const OPTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "multiple_response",
  "true_false",
  "ordering",
];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_STATUSES = ["draft", "review", "published", "archived"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const MASTERY_FROM_PERCENTAGE = (percentage: number) =>
  percentage >= 85
    ? "mastered"
    : percentage >= 70
      ? "proficient"
      : percentage >= 50
        ? "developing"
        : "emerging";

export function gradeLabelFor(percentage: number) {
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B";
  if (percentage >= 60) return "C";
  if (percentage >= 50) return "D";
  return "E";
}
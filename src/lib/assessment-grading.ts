/**
 * Pure auto-grading helpers shared by the delivery server functions and the
 * question preview UI. No Supabase access lives here.
 */
import { AUTO_GRADABLE_TYPES, type QuestionType } from "@/features/assessments/constants";

export interface GradableQuestion {
  id: string;
  question_type: string;
  points: number;
  answer_key: unknown;
}

type AnswerKey = {
  choices?: string[];
  text?: string;
  value?: number;
  tolerance?: number;
  order?: string[];
};

type StudentAnswer = {
  choices?: string[];
  text?: string;
  value?: number | string;
  order?: string[];
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export function isAutoGradable(type: string) {
  return AUTO_GRADABLE_TYPES.includes(type as QuestionType);
}

/**
 * Returns `null` when the question needs a human (essay, upload, …), otherwise
 * the correctness flag and awarded points.
 */
export function gradeAnswer(
  question: GradableQuestion,
  rawAnswer: unknown,
  maxPoints: number,
): { isCorrect: boolean; points: number } | null {
  if (!isAutoGradable(question.question_type)) return null;
  const key = (question.answer_key ?? {}) as AnswerKey;
  const answer = (rawAnswer ?? {}) as StudentAnswer;

  let correct = false;
  switch (question.question_type) {
    case "multiple_choice":
    case "true_false":
      correct = Boolean(key.choices?.length) && answer.choices?.[0] === key.choices?.[0];
      break;
    case "multiple_response":
      correct = Boolean(key.choices?.length) && sameSet(answer.choices ?? [], key.choices ?? []);
      break;
    case "short_answer":
    case "fill_blank":
      correct =
        typeof key.text === "string" &&
        typeof answer.text === "string" &&
        normalize(answer.text) === normalize(key.text);
      break;
    case "numeric": {
      const expected = Number(key.value);
      const given = Number(answer.value);
      const tolerance = Number(key.tolerance ?? 0);
      correct =
        Number.isFinite(expected) && Number.isFinite(given) && Math.abs(given - expected) <= tolerance;
      break;
    }
    case "ordering":
      correct =
        Boolean(key.order?.length) &&
        (answer.order ?? []).join("|") === (key.order ?? []).join("|");
      break;
    default:
      return null;
  }

  return { isCorrect: correct, points: correct ? maxPoints : 0 };
}

export function percentageOf(score: number, maxScore: number) {
  if (!maxScore || maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 1000) / 10;
}
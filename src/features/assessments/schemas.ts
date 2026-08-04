import { z } from "zod";
import {
  ASSESSMENT_STATUSES,
  DIFFICULTIES,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  SUBMISSION_STATUSES,
} from "./constants";

const uuid = z.string().uuid();
const optionalUuid = uuid.nullable().optional();

export const assessmentInputSchema = z.object({
  assessmentId: optionalUuid,
  organizationId: uuid,
  assessmentTypeId: optionalUuid,
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  instructions: z.string().trim().max(4000).nullable().optional(),
  studentInstructions: z.string().trim().max(4000).nullable().optional(),
  teacherNotes: z.string().trim().max(4000).nullable().optional(),
  curriculumId: optionalUuid,
  curriculumVersionId: optionalUuid,
  gradeId: optionalUuid,
  subjectId: optionalUuid,
  strandId: optionalUuid,
  subStrandId: optionalUuid,
  lessonId: optionalUuid,
  rubricId: optionalUuid,
  status: z.enum(ASSESSMENT_STATUSES).default("draft"),
  maxScore: z.number().min(1).max(1000).default(100),
  passingScore: z.number().min(0).max(1000).nullable().optional(),
  weighting: z.number().min(0).max(100).default(1),
  estimatedMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  dueAt: z.string().nullable().optional(),
  availableFrom: z.string().nullable().optional(),
  availableUntil: z.string().nullable().optional(),
  timeLimitMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  attemptsAllowed: z.number().int().min(1).max(20).default(1),
  randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false),
  lateSubmissionAllowed: z.boolean().default(true),
  latePenaltyPercent: z.number().min(0).max(100).default(0),
  parentVisible: z.boolean().default(true),
  allowReview: z.boolean().default(true),
  autoGrade: z.boolean().default(true),
  isTemplate: z.boolean().default(false),
  competencyIds: z.array(uuid).default([]),
  learningOutcomeIds: z.array(uuid).default([]),
});
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

export const questionInputSchema = z.object({
  questionId: optionalUuid,
  organizationId: uuid,
  questionType: z.enum(QUESTION_TYPES),
  prompt: z.string().trim().min(1, "Prompt is required").max(4000),
  body: z
    .object({
      options: z
        .array(z.object({ id: z.string().min(1), text: z.string().trim().max(500) }))
        .default([]),
      allowedResources: z.string().trim().max(1000).optional(),
    })
    .default({ options: [] }),
  answerKey: z
    .object({
      choices: z.array(z.string()).optional(),
      text: z.string().trim().max(1000).optional(),
      value: z.number().optional(),
      tolerance: z.number().min(0).optional(),
      order: z.array(z.string()).optional(),
    })
    .nullable()
    .default(null),
  explanation: z.string().trim().max(2000).nullable().optional(),
  points: z.number().min(0).max(100).default(1),
  difficulty: z.enum(DIFFICULTIES).default("medium"),
  status: z.enum(QUESTION_STATUSES).default("draft"),
  category: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).default([]),
  subjectId: optionalUuid,
  gradeId: optionalUuid,
  strandId: optionalUuid,
  subStrandId: optionalUuid,
  learningOutcomeId: optionalUuid,
  competencyId: optionalUuid,
  createVersion: z.boolean().default(false),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const rubricInputSchema = z.object({
  rubricId: optionalUuid,
  organizationId: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  subjectId: optionalUuid,
  isTemplate: z.boolean().default(false),
  status: z.enum(QUESTION_STATUSES).default("draft"),
  criteria: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).nullable().optional(),
        competencyId: optionalUuid,
        learningOutcomeId: optionalUuid,
        maxPoints: z.number().min(0).max(100).default(4),
        levels: z
          .array(
            z.object({
              label: z.string().trim().min(1).max(80),
              descriptor: z.string().trim().max(500).nullable().optional(),
              points: z.number().min(0).max(100).default(0),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});
export type RubricInput = z.infer<typeof rubricInputSchema>;

export const gradeSubmissionSchema = z.object({
  submissionId: uuid,
  status: z.enum(SUBMISSION_STATUSES).default("graded"),
  feedback: z.string().trim().max(4000).nullable().optional(),
  answers: z
    .array(
      z.object({
        questionId: uuid,
        awardedPoints: z.number().min(0).max(1000),
        feedback: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .default([]),
  rubricScores: z
    .array(
      z.object({
        criterionId: uuid,
        levelId: optionalUuid,
        points: z.number().min(0).max(1000),
        comment: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .default([]),
  competencyIds: z.array(uuid).default([]),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
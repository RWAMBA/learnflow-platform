export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      assessment_competencies: {
        Row: {
          assessment_id: string
          competency_id: string
          created_at: string
          id: string
          weight: number
        }
        Insert: {
          assessment_id: string
          competency_id: string
          created_at?: string
          id?: string
          weight?: number
        }
        Update: {
          assessment_id?: string
          competency_id?: string
          created_at?: string
          id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_competencies_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_competencies_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_definitions: {
        Row: {
          allow_review: boolean
          assessment_type_id: string | null
          attempts_allowed: number
          auto_grade: boolean
          available_from: string | null
          available_until: string | null
          cloned_from_id: string | null
          created_at: string
          created_by: string | null
          curriculum_id: string | null
          curriculum_version_id: string | null
          description: string | null
          due_at: string | null
          estimated_minutes: number | null
          grade_id: string | null
          id: string
          instructions: string | null
          is_template: boolean
          late_penalty_percent: number
          late_submission_allowed: boolean
          lesson_id: string | null
          max_score: number
          organization_id: string
          parent_visible: boolean
          passing_score: number | null
          published_at: string | null
          randomize_options: boolean
          randomize_questions: boolean
          rubric_id: string | null
          status: string
          strand_id: string | null
          student_instructions: string | null
          sub_strand_id: string | null
          subject_id: string | null
          teacher_notes: string | null
          time_limit_minutes: number | null
          title: string
          updated_at: string
          weighting: number
        }
        Insert: {
          allow_review?: boolean
          assessment_type_id?: string | null
          attempts_allowed?: number
          auto_grade?: boolean
          available_from?: string | null
          available_until?: string | null
          cloned_from_id?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_id?: string | null
          curriculum_version_id?: string | null
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          grade_id?: string | null
          id?: string
          instructions?: string | null
          is_template?: boolean
          late_penalty_percent?: number
          late_submission_allowed?: boolean
          lesson_id?: string | null
          max_score?: number
          organization_id: string
          parent_visible?: boolean
          passing_score?: number | null
          published_at?: string | null
          randomize_options?: boolean
          randomize_questions?: boolean
          rubric_id?: string | null
          status?: string
          strand_id?: string | null
          student_instructions?: string | null
          sub_strand_id?: string | null
          subject_id?: string | null
          teacher_notes?: string | null
          time_limit_minutes?: number | null
          title: string
          updated_at?: string
          weighting?: number
        }
        Update: {
          allow_review?: boolean
          assessment_type_id?: string | null
          attempts_allowed?: number
          auto_grade?: boolean
          available_from?: string | null
          available_until?: string | null
          cloned_from_id?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_id?: string | null
          curriculum_version_id?: string | null
          description?: string | null
          due_at?: string | null
          estimated_minutes?: number | null
          grade_id?: string | null
          id?: string
          instructions?: string | null
          is_template?: boolean
          late_penalty_percent?: number
          late_submission_allowed?: boolean
          lesson_id?: string | null
          max_score?: number
          organization_id?: string
          parent_visible?: boolean
          passing_score?: number | null
          published_at?: string | null
          randomize_options?: boolean
          randomize_questions?: boolean
          rubric_id?: string | null
          status?: string
          strand_id?: string | null
          student_instructions?: string | null
          sub_strand_id?: string | null
          subject_id?: string | null
          teacher_notes?: string | null
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string
          weighting?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_definitions_assessment_type_id_fkey"
            columns: ["assessment_type_id"]
            isOneToOne: false
            referencedRelation: "assessment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_cloned_from_id_fkey"
            columns: ["cloned_from_id"]
            isOneToOne: false
            referencedRelation: "assessment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_curriculum_version_id_fkey"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_rubric_fk"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_strand_id_fkey"
            columns: ["strand_id"]
            isOneToOne: false
            referencedRelation: "strands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_sub_strand_id_fkey"
            columns: ["sub_strand_id"]
            isOneToOne: false
            referencedRelation: "sub_strands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_definitions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_learning_outcomes: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          learning_outcome_id: string
          weight: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          learning_outcome_id: string
          weight?: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          learning_outcome_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_learning_outcomes_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_learning_outcomes_learning_outcome_id_fkey"
            columns: ["learning_outcome_id"]
            isOneToOne: false
            referencedRelation: "learning_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          points_override: number | null
          question_id: string
          required: boolean
          sequence_order: number
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          points_override?: number | null
          question_id: string
          required?: boolean
          sequence_order?: number
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          points_override?: number | null
          question_id?: string
          required?: boolean
          sequence_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank_items"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_submissions: {
        Row: {
          assessment_id: string
          attempt_number: number
          autosave: Json
          created_at: string
          feedback: string | null
          grade_label: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_late: boolean
          last_saved_at: string
          organization_id: string
          percentage: number | null
          reviewed_at: string | null
          score: number | null
          started_at: string
          status: string
          student_id: string
          submitted_at: string | null
          time_spent_seconds: number
          updated_at: string
        }
        Insert: {
          assessment_id: string
          attempt_number?: number
          autosave?: Json
          created_at?: string
          feedback?: string | null
          grade_label?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean
          last_saved_at?: string
          organization_id: string
          percentage?: number | null
          reviewed_at?: string | null
          score?: number | null
          started_at?: string
          status?: string
          student_id: string
          submitted_at?: string | null
          time_spent_seconds?: number
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          attempt_number?: number
          autosave?: Json
          created_at?: string
          feedback?: string | null
          grade_label?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_late?: boolean
          last_saved_at?: string
          organization_id?: string
          percentage?: number | null
          reviewed_at?: string | null
          score?: number | null
          started_at?: string
          status?: string
          student_id?: string
          submitted_at?: string | null
          time_spent_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_submissions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessment_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_types: {
        Row: {
          category: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          organization_id: string | null
          sequence_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          organization_id?: string | null
          sequence_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          organization_id?: string | null
          sequence_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assignment_id: string
          created_at: string
          graded_at: string | null
          graded_by_user_role_id: string | null
          id: string
          result: Json
        }
        Insert: {
          assignment_id: string
          created_at?: string
          graded_at?: string | null
          graded_by_user_role_id?: string | null
          id?: string
          result?: Json
        }
        Update: {
          assignment_id?: string
          created_at?: string
          graded_at?: string | null
          graded_by_user_role_id?: string | null
          id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "assessments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_graded_by_user_role_id_fkey"
            columns: ["graded_by_user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          created_by_user_role_id: string
          due_at: string | null
          id: string
          instructions: string | null
          lesson_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_role_id: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          lesson_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_role_id?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          lesson_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_created_by_user_role_id_fkey"
            columns: ["created_by_user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      competencies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          subject_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competencies_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          user_role_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          user_role_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          user_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_role_id_fkey"
            columns: ["user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      curricula: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          provider_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          provider_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          provider_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curricula_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "curriculum_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_providers: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      curriculum_resources: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          organization_id: string | null
          resource_type: string
          storage_path: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          organization_id?: string | null
          resource_type: string
          storage_path?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string | null
          resource_type?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_resources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_versions: {
        Row: {
          created_at: string
          created_by: string | null
          curriculum_id: string
          id: string
          is_current: boolean
          label: string
          notes: string | null
          organization_id: string | null
          parent_version_id: string | null
          published_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          curriculum_id: string
          id?: string
          is_current?: boolean
          label: string
          notes?: string | null
          organization_id?: string | null
          parent_version_id?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          curriculum_id?: string
          id?: string
          is_current?: boolean
          label?: string
          notes?: string | null
          organization_id?: string | null
          parent_version_id?: string | null
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_versions_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      education_stages: {
        Row: {
          created_at: string
          curriculum_version_id: string
          id: string
          name: string
          published_at: string | null
          sequence_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          curriculum_version_id: string
          id?: string
          name: string
          published_at?: string | null
          sequence_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          curriculum_version_id?: string
          id?: string
          name?: string
          published_at?: string | null
          sequence_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "education_stages_curriculum_version_id_fkey"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          curriculum_id: string
          education_stage_id: string | null
          id: string
          name: string
          pathway_required: boolean
          published_at: string | null
          sequence_order: number
          status: string
        }
        Insert: {
          created_at?: string
          curriculum_id: string
          education_stage_id?: string | null
          id?: string
          name: string
          pathway_required?: boolean
          published_at?: string | null
          sequence_order: number
          status?: string
        }
        Update: {
          created_at?: string
          curriculum_id?: string
          education_stage_id?: string | null
          id?: string
          name?: string
          pathway_required?: boolean
          published_at?: string | null
          sequence_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_curriculum_id_fkey"
            columns: ["curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_education_stage_id_fkey"
            columns: ["education_stage_id"]
            isOneToOne: false
            referencedRelation: "education_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_objectives: {
        Row: {
          competency_id: string | null
          created_at: string
          description: string
          id: string
          lesson_id: string
          sequence_order: number
          updated_at: string
        }
        Insert: {
          competency_id?: string | null
          created_at?: string
          description: string
          id?: string
          lesson_id: string
          sequence_order?: number
          updated_at?: string
        }
        Update: {
          competency_id?: string | null
          created_at?: string
          description?: string
          id?: string
          lesson_id?: string
          sequence_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_objectives_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_objectives_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_outcomes: {
        Row: {
          authoring_organization_id: string | null
          competency_id: string | null
          created_at: string
          description: string
          id: string
          sequence_order: number
          status: string
          sub_strand_id: string
          updated_at: string
        }
        Insert: {
          authoring_organization_id?: string | null
          competency_id?: string | null
          created_at?: string
          description: string
          id?: string
          sequence_order?: number
          status?: string
          sub_strand_id: string
          updated_at?: string
        }
        Update: {
          authoring_organization_id?: string | null
          competency_id?: string | null
          created_at?: string
          description?: string
          id?: string
          sequence_order?: number
          status?: string
          sub_strand_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_outcomes_authoring_organization_id_fkey"
            columns: ["authoring_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_outcomes_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_outcomes_sub_strand_id_fkey"
            columns: ["sub_strand_id"]
            isOneToOne: false
            referencedRelation: "sub_strands"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_prerequisites: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          prerequisite_lesson_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          prerequisite_lesson_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          prerequisite_lesson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_prerequisites_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_prerequisites_prerequisite_lesson_id_fkey"
            columns: ["prerequisite_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          author_type: string
          authoring_organization_id: string | null
          content_body: Json | null
          content_type: string
          created_at: string
          curriculum_version_id: string | null
          estimated_minutes: number | null
          id: string
          learning_outcome_id: string | null
          published_at: string | null
          search_vector: unknown
          sequence_order: number
          status: string
          storage_path: string | null
          sub_strand_id: string | null
          subject_id: string
          summary: string | null
          title: string
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          author_type?: string
          authoring_organization_id?: string | null
          content_body?: Json | null
          content_type: string
          created_at?: string
          curriculum_version_id?: string | null
          estimated_minutes?: number | null
          id?: string
          learning_outcome_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          sequence_order: number
          status?: string
          storage_path?: string | null
          sub_strand_id?: string | null
          subject_id: string
          summary?: string | null
          title: string
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          author_type?: string
          authoring_organization_id?: string | null
          content_body?: Json | null
          content_type?: string
          created_at?: string
          curriculum_version_id?: string | null
          estimated_minutes?: number | null
          id?: string
          learning_outcome_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          sequence_order?: number
          status?: string
          storage_path?: string | null
          sub_strand_id?: string | null
          subject_id?: string
          summary?: string | null
          title?: string
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_authoring_organization_id_fkey"
            columns: ["authoring_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_curriculum_version_id_fkey"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_learning_outcome_id_fkey"
            columns: ["learning_outcome_id"]
            isOneToOne: false
            referencedRelation: "learning_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_sub_strand_id_fkey"
            columns: ["sub_strand_id"]
            isOneToOne: false
            referencedRelation: "sub_strands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          id: string
          read_at: string | null
          sender_user_role_id: string
          sent_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          id?: string
          read_at?: string | null
          sender_user_role_id: string
          sent_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          id?: string
          read_at?: string | null
          sender_user_role_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_role_id_fkey"
            columns: ["sender_user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          recipient_user_role_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_user_role_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_user_role_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_user_role_id_fkey"
            columns: ["recipient_user_role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_security_settings: {
        Row: {
          created_at: string
          organization_id: string
          teacher_mfa_required: boolean
          tutor_mfa_required: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          teacher_mfa_required?: boolean
          tutor_mfa_required?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          teacher_mfa_required?: boolean
          tutor_mfa_required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_security_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          assigned_by: string | null
          created_at: string
          ended_at: string | null
          id: string
          organization_id: string
          plan_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          organization_id: string
          plan_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding: Json
          created_at: string
          default_currency: string
          default_curriculum_id: string | null
          default_locale: string
          id: string
          name: string
          open_enrollment: boolean
          tenant_type: string
          timezone: string
          updated_at: string
          younger_student_independent_login: boolean
        }
        Insert: {
          branding?: Json
          created_at?: string
          default_currency?: string
          default_curriculum_id?: string | null
          default_locale?: string
          id?: string
          name: string
          open_enrollment?: boolean
          tenant_type: string
          timezone?: string
          updated_at?: string
          younger_student_independent_login?: boolean
        }
        Update: {
          branding?: Json
          created_at?: string
          default_currency?: string
          default_curriculum_id?: string | null
          default_locale?: string
          id?: string
          name?: string
          open_enrollment?: boolean
          tenant_type?: string
          timezone?: string
          updated_at?: string
          younger_student_independent_login?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "organizations_default_curriculum_fk"
            columns: ["default_curriculum_id"]
            isOneToOne: false
            referencedRelation: "curricula"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_student_relationships: {
        Row: {
          audit_reference: string | null
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          invitation_status: string
          notes: string | null
          organization_id: string
          parent_id: string
          permission_level: string
          role_subtype: string
          status: string
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audit_reference?: string | null
          created_at?: string
          created_by: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          invitation_status?: string
          notes?: string | null
          organization_id: string
          parent_id: string
          permission_level: string
          role_subtype: string
          status?: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audit_reference?: string | null
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          invitation_status?: string
          notes?: string | null
          organization_id?: string
          parent_id?: string
          permission_level?: string
          role_subtype?: string
          status?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_relationships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_relationships_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_relationships_parent_id_organization_id_fkey"
            columns: ["parent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["user_id", "organization_id"]
          },
          {
            foreignKeyName: "parent_student_relationships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_student_relationships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      password_change_attempts: {
        Row: {
          created_at: string
          failed_attempts: number
          last_failed_at: string | null
          locked_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pathways: {
        Row: {
          authoring_organization_id: string | null
          created_at: string
          description: string | null
          grade_id: string
          id: string
          name: string
          published_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          authoring_organization_id?: string | null
          created_at?: string
          description?: string | null
          grade_id: string
          id?: string
          name: string
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          authoring_organization_id?: string | null
          created_at?: string
          description?: string | null
          grade_id?: string
          id?: string
          name?: string
          published_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pathways_authoring_organization_id_fkey"
            columns: ["authoring_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pathways_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          eligible_tenant_types: string[]
          entitlements: Json
          id: string
          is_active: boolean
          name: string
          price_amount: number | null
          price_currency: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          eligible_tenant_types: string[]
          entitlements?: Json
          id?: string
          is_active?: boolean
          name: string
          price_amount?: number | null
          price_currency?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          eligible_tenant_types?: string[]
          entitlements?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_amount?: number | null
          price_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          locale: string
          theme_preference: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          locale?: string
          theme_preference?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          locale?: string
          theme_preference?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      progress_records: {
        Row: {
          assessment_id: string | null
          competency_id: string | null
          id: string
          learning_objective_id: string | null
          lesson_id: string | null
          mastery_level: string
          notes: string | null
          recorded_at: string
          recorded_by: string | null
          student_id: string
        }
        Insert: {
          assessment_id?: string | null
          competency_id?: string | null
          id?: string
          learning_objective_id?: string | null
          lesson_id?: string | null
          mastery_level: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          student_id: string
        }
        Update: {
          assessment_id?: string | null
          competency_id?: string | null
          id?: string
          learning_objective_id?: string | null
          lesson_id?: string | null
          mastery_level?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_records_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_records_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_records_learning_objective_id_fkey"
            columns: ["learning_objective_id"]
            isOneToOne: false
            referencedRelation: "learning_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_records_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank_items: {
        Row: {
          answer_key: Json | null
          body: Json
          category: string | null
          competency_id: string | null
          created_at: string
          created_by: string | null
          difficulty: string
          explanation: string | null
          grade_id: string | null
          id: string
          learning_outcome_id: string | null
          organization_id: string
          parent_question_id: string | null
          points: number
          prompt: string
          question_type: string
          status: string
          strand_id: string | null
          sub_strand_id: string | null
          subject_id: string | null
          tags: string[]
          updated_at: string
          version: number
        }
        Insert: {
          answer_key?: Json | null
          body?: Json
          category?: string | null
          competency_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          explanation?: string | null
          grade_id?: string | null
          id?: string
          learning_outcome_id?: string | null
          organization_id: string
          parent_question_id?: string | null
          points?: number
          prompt: string
          question_type: string
          status?: string
          strand_id?: string | null
          sub_strand_id?: string | null
          subject_id?: string | null
          tags?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          answer_key?: Json | null
          body?: Json
          category?: string | null
          competency_id?: string | null
          created_at?: string
          created_by?: string | null
          difficulty?: string
          explanation?: string | null
          grade_id?: string | null
          id?: string
          learning_outcome_id?: string | null
          organization_id?: string
          parent_question_id?: string | null
          points?: number
          prompt?: string
          question_type?: string
          status?: string
          strand_id?: string | null
          sub_strand_id?: string | null
          subject_id?: string | null
          tags?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_items_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_learning_outcome_id_fkey"
            columns: ["learning_outcome_id"]
            isOneToOne: false
            referencedRelation: "learning_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "question_bank_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_strand_id_fkey"
            columns: ["strand_id"]
            isOneToOne: false
            referencedRelation: "strands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_sub_strand_id_fkey"
            columns: ["sub_strand_id"]
            isOneToOne: false
            referencedRelation: "sub_strands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_items_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      rubric_criteria: {
        Row: {
          competency_id: string | null
          created_at: string
          description: string | null
          id: string
          learning_outcome_id: string | null
          max_points: number
          rubric_id: string
          sequence_order: number
          title: string
          updated_at: string
        }
        Insert: {
          competency_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          learning_outcome_id?: string | null
          max_points?: number
          rubric_id: string
          sequence_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          competency_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          learning_outcome_id?: string | null
          max_points?: number
          rubric_id?: string
          sequence_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_criteria_learning_outcome_id_fkey"
            columns: ["learning_outcome_id"]
            isOneToOne: false
            referencedRelation: "learning_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_criteria_rubric_id_fkey"
            columns: ["rubric_id"]
            isOneToOne: false
            referencedRelation: "rubrics"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_levels: {
        Row: {
          created_at: string
          criterion_id: string
          descriptor: string | null
          id: string
          label: string
          points: number
          sequence_order: number
        }
        Insert: {
          created_at?: string
          criterion_id: string
          descriptor?: string | null
          id?: string
          label: string
          points?: number
          sequence_order?: number
        }
        Update: {
          created_at?: string
          criterion_id?: string
          descriptor?: string | null
          id?: string
          label?: string
          points?: number
          sequence_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubric_levels_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rubric_criteria"
            referencedColumns: ["id"]
          },
        ]
      }
      rubrics: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_template: boolean
          organization_id: string
          status: string
          subject_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_template?: boolean
          organization_id: string
          status?: string
          subject_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_template?: boolean
          organization_id?: string
          status?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rubrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubrics_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          ip_address: unknown
          organization_id: string | null
          severity: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          ip_address?: unknown
          organization_id?: string | null
          severity?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          ip_address?: unknown
          organization_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      strands: {
        Row: {
          authoring_organization_id: string | null
          created_at: string
          curriculum_version_id: string | null
          description: string | null
          id: string
          published_at: string | null
          sequence_order: number
          status: string
          subject_id: string
          title: string
          updated_at: string
        }
        Insert: {
          authoring_organization_id?: string | null
          created_at?: string
          curriculum_version_id?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          sequence_order?: number
          status?: string
          subject_id: string
          title: string
          updated_at?: string
        }
        Update: {
          authoring_organization_id?: string | null
          created_at?: string
          curriculum_version_id?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          sequence_order?: number
          status?: string
          subject_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strands_authoring_organization_id_fkey"
            columns: ["authoring_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strands_curriculum_version_id_fkey"
            columns: ["curriculum_version_id"]
            isOneToOne: false
            referencedRelation: "curriculum_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strands_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      student_curriculum_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          status: string
          student_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          status?: string
          student_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
          student_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_curriculum_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_curriculum_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_curriculum_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_curriculum_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          created_by: string
          date_of_birth: string | null
          first_name: string
          grade_id: string | null
          id: string
          last_name: string
          organization_id: string
          pathway_id: string | null
          updated_at: string
          user_role_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          date_of_birth?: string | null
          first_name: string
          grade_id?: string | null
          id?: string
          last_name: string
          organization_id: string
          pathway_id?: string | null
          updated_at?: string
          user_role_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          first_name?: string
          grade_id?: string | null
          id?: string
          last_name?: string
          organization_id?: string
          pathway_id?: string | null
          updated_at?: string
          user_role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_role_id_fkey"
            columns: ["user_role_id"]
            isOneToOne: true
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_strands: {
        Row: {
          authoring_organization_id: string | null
          created_at: string
          description: string | null
          id: string
          published_at: string | null
          sequence_order: number
          status: string
          strand_id: string
          title: string
          updated_at: string
        }
        Insert: {
          authoring_organization_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          published_at?: string | null
          sequence_order?: number
          status?: string
          strand_id: string
          title: string
          updated_at?: string
        }
        Update: {
          authoring_organization_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          published_at?: string | null
          sequence_order?: number
          status?: string
          strand_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_strands_authoring_organization_id_fkey"
            columns: ["authoring_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_strands_strand_id_fkey"
            columns: ["strand_id"]
            isOneToOne: false
            referencedRelation: "strands"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          academic_level_id: string | null
          authoring_organization_id: string | null
          code: string | null
          created_at: string
          description: string | null
          grade_id: string
          id: string
          name: string
          pathway_id: string | null
          published_at: string | null
          search_vector: unknown
          status: string
          subject_group_id: string | null
          track_id: string | null
          updated_at: string
        }
        Insert: {
          academic_level_id?: string | null
          authoring_organization_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          grade_id: string
          id?: string
          name: string
          pathway_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          status?: string
          subject_group_id?: string | null
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_level_id?: string | null
          authoring_organization_id?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          grade_id?: string
          id?: string
          name?: string
          pathway_id?: string | null
          published_at?: string | null
          search_vector?: unknown
          status?: string
          subject_group_id?: string | null
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_academic_level_id_fkey"
            columns: ["academic_level_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_authoring_organization_id_fkey"
            columns: ["authoring_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_pathway_id_fkey"
            columns: ["pathway_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_subject_group_id_fkey"
            columns: ["subject_group_id"]
            isOneToOne: false
            referencedRelation: "subject_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "pathways"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_answers: {
        Row: {
          answer: Json
          awarded_points: number | null
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          is_correct: boolean | null
          question_id: string
          storage_path: string | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          answer?: Json
          awarded_points?: number | null
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          question_id: string
          storage_path?: string | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          answer?: Json
          awarded_points?: number | null
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string
          storage_path?: string | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_answers_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_rubric_scores: {
        Row: {
          comment: string | null
          created_at: string
          criterion_id: string
          id: string
          level_id: string | null
          points: number
          submission_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          criterion_id: string
          id?: string
          level_id?: string | null
          points?: number
          submission_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          criterion_id?: string
          id?: string
          level_id?: string | null
          points?: number
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_rubric_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rubric_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_rubric_scores_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "rubric_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_rubric_scores_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_student_relationships: {
        Row: {
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          invitation_status: string
          notes: string | null
          organization_id: string
          status: string
          student_id: string
          subject_id: string | null
          teacher_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          invitation_status?: string
          notes?: string | null
          organization_id: string
          status?: string
          student_id: string
          subject_id?: string | null
          teacher_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          invitation_status?: string
          notes?: string | null
          organization_id?: string
          status?: string
          student_id?: string
          subject_id?: string | null
          teacher_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_student_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_teacher_id_organization_id_fkey"
            columns: ["teacher_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["user_id", "organization_id"]
          },
          {
            foreignKeyName: "teacher_student_relationships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          authoring_organization_id: string | null
          created_at: string
          description: string | null
          id: string
          published_at: string | null
          search_vector: unknown
          sequence_order: number
          status: string
          subject_id: string
          title: string
          updated_at: string
        }
        Insert: {
          authoring_organization_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          published_at?: string | null
          search_vector?: unknown
          sequence_order?: number
          status?: string
          subject_id: string
          title: string
          updated_at?: string
        }
        Update: {
          authoring_organization_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          published_at?: string | null
          search_vector?: unknown
          sequence_order?: number
          status?: string
          subject_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_authoring_organization_id_fkey"
            columns: ["authoring_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_student_relationships: {
        Row: {
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          invitation_status: string
          notes: string | null
          organization_id: string
          status: string
          student_id: string
          subject_id: string | null
          tutor_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          invitation_status?: string
          notes?: string | null
          organization_id: string
          status?: string
          student_id: string
          subject_id?: string | null
          tutor_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          invitation_status?: string
          notes?: string | null
          organization_id?: string
          status?: string
          student_id?: string
          subject_id?: string | null
          tutor_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tutor_student_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_student_relationships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_student_relationships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_student_relationships_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_student_relationships_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_student_relationships_tutor_id_organization_id_fkey"
            columns: ["tutor_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["user_id", "organization_id"]
          },
          {
            foreignKeyName: "tutor_student_relationships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          role_id: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          role_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          role_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_organization_id_fkey"
            columns: ["user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["user_id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_curriculum: {
        Args: {
          p_content_type?: string
          p_grade_id?: string
          p_kinds?: string[]
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_term?: string
        }
        Returns: {
          content_type: string
          grade_id: string
          grade_name: string
          id: string
          kind: string
          status: string
          subject_id: string
          subtitle: string
          title: string
          total_count: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Tipos do banco, conferidos com a saída do `supabase gen types typescript` do projeto real.
// Versão enxuta: sem os metadados de Relationships (o app não usa selects embutidos).
// `pnpm db:types` sobrescreve este arquivo com a saída completa do gerador.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attendance_reminders: {
        Row: {
          id: string
          profile_id: string
          schedule_id: string | null
          remind_at: string
          last_sent_on: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id?: string
          schedule_id?: string | null
          remind_at: string
          last_sent_on?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          schedule_id?: string | null
          remind_at?: string
          last_sent_on?: string | null
          created_at?: string
        }
        Relationships: []
      }
      student_class_reminders: {
        Row: {
          profile_id: string
          enabled: boolean
          lead_minutes: number
          last_sent_on: string | null
          created_at: string
        }
        Insert: {
          profile_id?: string
          enabled?: boolean
          lead_minutes?: number
          last_sent_on?: string | null
          created_at?: string
        }
        Update: {
          profile_id?: string
          enabled?: boolean
          lead_minutes?: number
          last_sent_on?: string | null
          created_at?: string
        }
        Relationships: []
      }
      lesson_plan_reminders: {
        Row: {
          profile_id: string
          remind_at: string
          last_sent_on: string | null
          created_at: string
        }
        Insert: {
          profile_id?: string
          remind_at?: string
          last_sent_on?: string | null
          created_at?: string
        }
        Update: {
          profile_id?: string
          remind_at?: string
          last_sent_on?: string | null
          created_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          id: string
          class_id: string | null
          student_id: string
          gym_id: string
          date: string
          status: Database["public"]["Enums"]["attendance_status"]
          source: Database["public"]["Enums"]["attendance_source"]
          location_label: string | null
          marked_by: string
          marked_at: string
          credits: number
          walk_in_period: string
        }
        Insert: {
          id?: string
          class_id?: string | null
          student_id: string
          gym_id?: string
          date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          source?: Database["public"]["Enums"]["attendance_source"]
          location_label?: string | null
          marked_by?: string
          marked_at?: string
          credits?: number
          walk_in_period?: string
        }
        Update: {
          id?: string
          class_id?: string | null
          student_id?: string
          gym_id?: string
          date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          source?: Database["public"]["Enums"]["attendance_source"]
          location_label?: string | null
          marked_by?: string
          marked_at?: string
          credits?: number
          walk_in_period?: string
        }
        Relationships: []
      }
      class_photos: {
        Row: {
          id: string
          class_id: string
          storage_path: string
          taken_at: string
          uploaded_by: string
        }
        Insert: {
          id?: string
          class_id: string
          storage_path: string
          taken_at?: string
          uploaded_by?: string
        }
        Update: {
          id?: string
          class_id?: string
          storage_path?: string
          taken_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      class_schedules: {
        Row: {
          id: string
          gym_id: string
          instructor_id: string
          weekday: number
          start_time: string
          title: string
          starts_on: string
          ends_on: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          gym_id: string
          instructor_id?: string
          weekday: number
          start_time: string
          title?: string
          starts_on?: string
          ends_on?: string | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          gym_id?: string
          instructor_id?: string
          weekday?: number
          start_time?: string
          title?: string
          starts_on?: string
          ends_on?: string | null
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          id: string
          gym_id: string
          instructor_id: string
          schedule_id: string | null
          date: string
          start_time: string | null
          title: string
          status: Database["public"]["Enums"]["class_status"]
          created_at: string
        }
        Insert: {
          id?: string
          gym_id: string
          instructor_id?: string
          schedule_id?: string | null
          date: string
          start_time?: string | null
          title?: string
          status?: Database["public"]["Enums"]["class_status"]
          created_at?: string
        }
        Update: {
          id?: string
          gym_id?: string
          instructor_id?: string
          schedule_id?: string | null
          date?: string
          start_time?: string | null
          title?: string
          status?: Database["public"]["Enums"]["class_status"]
          created_at?: string
        }
        Relationships: []
      }
      face_embeddings: {
        Row: {
          id: string
          student_id: string
          /** pgvector como texto: "[0.1,0.2,…]" */
          embedding: string
          model: string
          source_photo_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          embedding: string
          model?: string
          source_photo_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          embedding?: string
          model?: string
          source_photo_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      face_detections: {
        Row: {
          id: string
          photo_id: string
          face_index: number
          bbox: Json
          suggested_student_id: string | null
          score: number | null
          student_id: string | null
          decision: Database["public"]["Enums"]["face_decision"]
          embedding_id: string | null
          decided_by: string | null
          decided_at: string
        }
        Insert: {
          id?: string
          photo_id: string
          face_index: number
          bbox: Json
          suggested_student_id?: string | null
          score?: number | null
          student_id?: string | null
          decision: Database["public"]["Enums"]["face_decision"]
          embedding_id?: string | null
          decided_by?: string | null
          decided_at?: string
        }
        Update: {
          id?: string
          photo_id?: string
          face_index?: number
          bbox?: Json
          suggested_student_id?: string | null
          score?: number | null
          student_id?: string | null
          decision?: Database["public"]["Enums"]["face_decision"]
          embedding_id?: string | null
          decided_by?: string | null
          decided_at?: string
        }
        Relationships: []
      }
      gym_instructors: {
        Row: {
          gym_id: string
          profile_id: string
          role: Database["public"]["Enums"]["gym_role"]
          created_at: string
        }
        Insert: {
          gym_id: string
          profile_id: string
          role?: Database["public"]["Enums"]["gym_role"]
          created_at?: string
        }
        Update: {
          gym_id?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["gym_role"]
          created_at?: string
        }
        Relationships: []
      }
      gyms: {
        Row: {
          id: string
          name: string
          address: string | null
          created_by: string
          created_at: string
          next_graduation_on: string | null
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          created_by?: string
          created_at?: string
          next_graduation_on?: string | null
        }
        Update: {
          id?: string
          name?: string
          address?: string | null
          created_by?: string
          created_at?: string
          next_graduation_on?: string | null
        }
        Relationships: []
      }
      graduation_schedule: {
        Row: {
          track: string
          next_on: string | null
          updated_at: string
        }
        Insert: {
          track: string
          next_on?: string | null
          updated_at?: string
        }
        Update: {
          track?: string
          next_on?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lesson_plans: {
        Row: {
          id: string
          class_id: string
          content: Json
          template_id: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          class_id: string
          content?: Json
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          class_id?: string
          content?: Json
          template_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lesson_templates: {
        Row: {
          id: string
          owner_id: string
          title: string
          content: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string
          title: string
          content?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          title?: string
          content?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          name: string
          role: Database["public"]["Enums"]["profile_role"]
          avatar_url: string | null
          absence_alert_threshold: number
          face_auto_approve_min: number | null
          created_at: string
        }
        Insert: {
          id: string
          name?: string
          role?: Database["public"]["Enums"]["profile_role"]
          avatar_url?: string | null
          absence_alert_threshold?: number
          face_auto_approve_min?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["profile_role"]
          avatar_url?: string | null
          absence_alert_threshold?: number
          face_auto_approve_min?: number | null
          created_at?: string
        }
        Relationships: []
      }
      ranks: {
        Row: {
          id: string
          grade: number
          name: string
          level: string
          colors: string[]
          min_months: number | null
          required_classes: number | null
          min_percent: number | null
          track: string
          min_age: number | null
        }
        Insert: {
          id?: string
          grade: number
          name: string
          level: string
          colors?: string[]
          min_months?: number | null
          required_classes?: number | null
          min_percent?: number | null
          track?: string
          min_age?: number | null
        }
        Update: {
          id?: string
          grade?: number
          name?: string
          level?: string
          colors?: string[]
          min_months?: number | null
          required_classes?: number | null
          min_percent?: number | null
          track?: string
          min_age?: number | null
        }
        Relationships: []
      }
      student_graduations: {
        Row: {
          id: string
          student_id: string
          rank_id: string
          graduated_at: string
          notes: string | null
          recorded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          rank_id: string
          graduated_at: string
          notes?: string | null
          recorded_by?: string
          created_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          rank_id?: string
          graduated_at?: string
          notes?: string | null
          recorded_by?: string
          created_at?: string
        }
        Relationships: []
      }
      lesson_plan_shares: {
        Row: {
          class_id: string
          token: string
          created_by: string
          created_at: string
          last_seen_at: string | null
          review_status: string | null
          review_note: string | null
          reviewer_name: string | null
          reviewed_at: string | null
        }
        Insert: {
          class_id: string
          token?: string
          created_by?: string
          created_at?: string
          last_seen_at?: string | null
          review_status?: string | null
          review_note?: string | null
          reviewer_name?: string | null
          reviewed_at?: string | null
        }
        Update: {
          class_id?: string
          token?: string
          created_by?: string
          created_at?: string
          last_seen_at?: string | null
          review_status?: string | null
          review_note?: string | null
          reviewer_name?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      instructor_invites: {
        Row: {
          token: string
          created_by: string
          created_at: string
          expires_at: string
          used_by: string | null
          used_at: string | null
        }
        Insert: {
          token?: string
          created_by?: string
          created_at?: string
          expires_at?: string
          used_by?: string | null
          used_at?: string | null
        }
        Update: {
          token?: string
          created_by?: string
          created_at?: string
          expires_at?: string
          used_by?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      student_access: {
        Row: {
          student_id: string
          token: string
          created_by: string
          created_at: string
          last_seen_at: string | null
          expires_at: string
        }
        Insert: {
          student_id: string
          token?: string
          created_by?: string
          created_at?: string
          last_seen_at?: string | null
          expires_at?: string
        }
        Update: {
          student_id?: string
          token?: string
          created_by?: string
          created_at?: string
          last_seen_at?: string | null
          expires_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          id: string
          gym_id: string
          name: string
          phone: string | null
          birth_date: string | null
          active: boolean
          profile_id: string | null
          image_consent_at: string | null
          account_consent_at: string | null
          notes: string | null
          created_at: string
          opening_present: number
          opening_absent: number
          opening_until: string | null
          started_on: string
          opening_from: string | null
          opening_after_grad: number | null
          track: string
        }
        Insert: {
          id?: string
          gym_id: string
          name: string
          phone?: string | null
          birth_date?: string | null
          active?: boolean
          profile_id?: string | null
          image_consent_at?: string | null
          account_consent_at?: string | null
          notes?: string | null
          created_at?: string
          opening_present?: number
          opening_absent?: number
          opening_until?: string | null
          started_on?: string
          opening_from?: string | null
          opening_after_grad?: number | null
          track?: string
        }
        Update: {
          id?: string
          gym_id?: string
          name?: string
          phone?: string | null
          birth_date?: string | null
          active?: boolean
          profile_id?: string | null
          image_consent_at?: string | null
          account_consent_at?: string | null
          notes?: string | null
          created_at?: string
          opening_present?: number
          opening_absent?: number
          opening_until?: string | null
          started_on?: string
          opening_from?: string | null
          opening_after_grad?: number | null
          track?: string
        }
        Relationships: []
      }
    }
    Views: {
      student_absence_streaks: {
        Row: {
          student_id: string | null
          gym_id: string | null
          last_present_on: string | null
          absences_in_row: number | null
        }
        Relationships: []
      }
      class_turnout: {
        Row: {
          class_id: string | null
          gym_id: string | null
          date: string | null
          start_time: string | null
          present: number | null
        }
        Relationships: []
      }
      student_progress: {
        Row: {
          student_id: string | null
          gym_id: string | null
          current_rank_id: string | null
          last_graduated_at: string | null
          attendance_since: number | null
          attendance_total: number | null
          last_attendance_on: string | null
          classes_since: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      today_sp: { Args: never; Returns: string }
      ensure_classes: { Args: { p_until?: string }; Returns: number }
      mark_attendance_batch: { Args: { p_items: Json }; Returns: number }
      save_face_decisions: { Args: { p_items: Json; p_max_refs?: number }; Returns: number }
      face_references: {
        Args: { p_gym_id: string }
        Returns: { id: string; student_id: string; embedding: string; model: string; created_at: string }[]
      }
      add_walk_ins: {
        Args: {
          p_student_ids: string[]
          p_date: string
          p_location: string
          p_source?: Database["public"]["Enums"]["attendance_source"]
        }
        Returns: number
      }
      conclude_class: { Args: { p_class_id: string }; Returns: undefined }
      walk_in_locations: {
        Args: never
        Returns: { location_label: string; uses: number }[]
      }
      is_gym_member: { Args: { p_gym_id: string }; Returns: boolean }
      is_gym_owner: { Args: { p_gym_id: string }; Returns: boolean }
      is_instructor: { Args: never; Returns: boolean }
      is_own_student: { Args: { p_student_id: string }; Returns: boolean }
      can_manage_student: { Args: { p_student_id: string }; Returns: boolean }
      storage_path_gym: { Args: { p_name: string }; Returns: string }
      can_manage_class: { Args: { p_class_id: string }; Returns: boolean }
      register_walk_ins: {
        Args: {
          p_student_ids: string[]
          p_date: string
          p_location: string
          p_credits?: number
          p_source?: Database["public"]["Enums"]["attendance_source"]
          p_period?: string
        }
        Returns: number
      }
      rotate_student_access: { Args: { p_student_id: string; p_hours?: number }; Returns: string }
      claim_student_account: { Args: { p_token: string }; Returns: undefined }
      my_student_account: { Args: never; Returns: Json }
      accept_image_consent: { Args: never; Returns: undefined }
      my_student_portal: { Args: never; Returns: Json }
      create_instructor_invite: { Args: never; Returns: string }
      instructor_invite_info: { Args: { p_token: string }; Returns: Json }
      accept_instructor_invite: { Args: { p_token: string }; Returns: undefined }
      signup_directory: { Args: never; Returns: Json }
      signup_ranks: { Args: never; Returns: Json }
      request_student_access: { Args: { p_gym_id: string; p_name: string; p_phone?: string; p_rank_id?: string; p_graduated_at?: string }; Returns: undefined }
      my_signup_request: { Args: never; Returns: Json }
      set_signup_photo: { Args: { p_path: string }; Returns: undefined }
      list_student_requests: { Args: never; Returns: Json }
      approve_student_request: { Args: { p_request_id: string; p_student_id?: string }; Returns: string }
      reject_student_request: { Args: { p_request_id: string }; Returns: undefined }
      student_portal: { Args: { p_token: string }; Returns: Json }
      rotate_lesson_plan_share: { Args: { p_class_id: string }; Returns: string }
      shared_lesson_plan: { Args: { p_token: string }; Returns: Json }
      review_shared_lesson_plan: {
        Args: { p_token: string; p_status: string; p_note?: string; p_reviewer_name?: string }
        Returns: boolean
      }
      save_push_subscription: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string }
        Returns: undefined
      }
    }
    Enums: {
      profile_role: "instructor" | "student"
      gym_role: "owner" | "instructor"
      class_status: "scheduled" | "done" | "cancelled"
      attendance_status: "present" | "absent" | "late" | "justified"
      attendance_source: "manual" | "walk_in" | "import" | "face" | "student_checkin"
      face_decision: "confirmed" | "corrected" | "ignored" | "auto"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

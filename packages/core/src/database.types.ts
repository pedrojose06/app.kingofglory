
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "academy_invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"cancelled_at": string | null,"created_at": string,"created_by": string,"email": string,"expires_at": string,"gym_id": string,"id": string,"role": string,"token_sha256": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"created_by": string,"email": string,"expires_at"?: string,"gym_id": string,"id"?: string,"role": string,"token_sha256": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"cancelled_at"?: string | null,"created_at"?: string,"created_by"?: string,"email"?: string,"expires_at"?: string,"gym_id"?: string,"id"?: string,"role"?: string,"token_sha256"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "academy_invites_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "academy_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "academy_invites_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    }
                  ]
                },"academy_members": {
                  Row: {
                    "created_at": string,"created_by": string | null,"gym_id": string,"profile_id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"gym_id": string,"profile_id": string,"role": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"gym_id"?: string,"profile_id"?: string,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "academy_members_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "academy_members_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "academy_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance": {
                  Row: {
                    "class_id": string | null,"credits": number,"date": string,"gym_id": string,"id": string,"location_label": string | null,"marked_at": string,"marked_by": string,"source": Database["public"]['Enums']["attendance_source"],"status": Database["public"]['Enums']["attendance_status"],"student_id": string,"walk_in_period": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id"?: string | null,"credits"?: number,"date": string,"gym_id": string,"id"?: string,"location_label"?: string | null,"marked_at"?: string,"marked_by"?: string,"source"?: Database["public"]['Enums']["attendance_source"],"status"?: Database["public"]['Enums']["attendance_status"],"student_id": string,"walk_in_period"?: string
                  }
                  Update: {
                    "class_id"?: string | null,"credits"?: number,"date"?: string,"gym_id"?: string,"id"?: string,"location_label"?: string | null,"marked_at"?: string,"marked_by"?: string,"source"?: Database["public"]['Enums']["attendance_source"],"status"?: Database["public"]['Enums']["attendance_status"],"student_id"?: string,"walk_in_period"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "class_turnout"
      referencedColumns: ["class_id"]
    },{
      foreignKeyName: "attendance_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_marked_by_fkey"
      columns: ["marked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance_reminders": {
                  Row: {
                    "created_at": string,"id": string,"last_sent_on": string | null,"profile_id": string,"remind_at": string,"schedule_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"last_sent_on"?: string | null,"profile_id"?: string,"remind_at": string,"schedule_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"last_sent_on"?: string | null,"profile_id"?: string,"remind_at"?: string,"schedule_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_reminders_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_reminders_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "class_schedules"
      referencedColumns: ["id"]
    }
                  ]
                },"belt_ranks": {
                  Row: {
                    "belt_system": string,"colors": (string)[],"id": string,"max_degrees": number,"name": string,"position": number,"track": string
                  }
                  ComputedFields: never
                  Insert: {
                    "belt_system": string,"colors"?: (string)[],"id"?: string,"max_degrees"?: number,"name": string,"position": number,"track": string
                  }
                  Update: {
                    "belt_system"?: string,"colors"?: (string)[],"id"?: string,"max_degrees"?: number,"name"?: string,"position"?: number,"track"?: string
                  }
                  Relationships: [
                    
                  ]
                },"charge_students": {
                  Row: {
                    "charge_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "charge_id": string,"student_id": string
                  }
                  Update: {
                    "charge_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "charge_students_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charge_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_students_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charge_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "charge_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "charge_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"charges": {
                  Row: {
                    "amount_cents": number,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"competence": string | null,"contract_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"due_on": string,"external_ref": string | null,"gateway": string | null,"gateway_charge_id": string | null,"gym_id": string,"id": string,"installment": number | null,"installments_total": number | null,"kind": string,"payer_id": string,"payment_url": string | null,"source": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"competence"?: string | null,"contract_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_on": string,"external_ref"?: string | null,"gateway"?: string | null,"gateway_charge_id"?: string | null,"gym_id": string,"id"?: string,"installment"?: number | null,"installments_total"?: number | null,"kind": string,"payer_id": string,"payment_url"?: string | null,"source"?: string,"status"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"competence"?: string | null,"contract_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"due_on"?: string,"external_ref"?: string | null,"gateway"?: string | null,"gateway_charge_id"?: string | null,"gym_id"?: string,"id"?: string,"installment"?: number | null,"installments_total"?: number | null,"kind"?: string,"payer_id"?: string,"payment_url"?: string | null,"source"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "payers"
      referencedColumns: ["id"]
    }
                  ]
                },"class_group_members": {
                  Row: {
                    "created_at": string,"group_id": string,"gym_id": string,"joined_on": string,"left_on": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"group_id": string,"gym_id": string,"joined_on"?: string,"left_on"?: string | null,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"group_id"?: string,"gym_id"?: string,"joined_on"?: string,"left_on"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "class_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_group_members_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_group_members_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "class_group_members_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "class_group_members_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"class_groups": {
                  Row: {
                    "active": boolean,"capacity": number | null,"color": string | null,"created_at": string,"gym_id": string,"id": string,"max_age": number | null,"min_age": number | null,"modality_id": string,"name": string,"notes": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"capacity"?: number | null,"color"?: string | null,"created_at"?: string,"gym_id": string,"id"?: string,"max_age"?: number | null,"min_age"?: number | null,"modality_id": string,"name": string,"notes"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"capacity"?: number | null,"color"?: string | null,"created_at"?: string,"gym_id"?: string,"id"?: string,"max_age"?: number | null,"min_age"?: number | null,"modality_id"?: string,"name"?: string,"notes"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_groups_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_groups_modality_id_fkey"
      columns: ["modality_id"]
isOneToOne: false
      referencedRelation: "modalities"
      referencedColumns: ["id"]
    }
                  ]
                },"class_photos": {
                  Row: {
                    "class_id": string,"id": string,"storage_path": string,"taken_at": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"id"?: string,"storage_path": string,"taken_at"?: string,"uploaded_by"?: string
                  }
                  Update: {
                    "class_id"?: string,"id"?: string,"storage_path"?: string,"taken_at"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_photos_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "class_turnout"
      referencedColumns: ["class_id"]
    },{
      foreignKeyName: "class_photos_class_id_fkey"
      columns: ["class_id"]
isOneToOne: false
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_photos_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"class_schedules": {
                  Row: {
                    "active": boolean,"created_at": string,"ends_on": string | null,"group_id": string | null,"gym_id": string,"id": string,"instructor_id": string,"start_time": string,"starts_on": string,"title": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"ends_on"?: string | null,"group_id"?: string | null,"gym_id": string,"id"?: string,"instructor_id"?: string,"start_time": string,"starts_on"?: string,"title"?: string,"weekday": number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"ends_on"?: string | null,"group_id"?: string | null,"gym_id"?: string,"id"?: string,"instructor_id"?: string,"start_time"?: string,"starts_on"?: string,"title"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "class_schedules_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "class_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_schedules_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "class_schedules_instructor_id_fkey"
      columns: ["instructor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"classes": {
                  Row: {
                    "created_at": string,"date": string,"group_id": string | null,"gym_id": string,"id": string,"instructor_id": string,"schedule_id": string | null,"start_time": string | null,"status": Database["public"]['Enums']["class_status"],"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"group_id"?: string | null,"gym_id": string,"id"?: string,"instructor_id"?: string,"schedule_id"?: string | null,"start_time"?: string | null,"status"?: Database["public"]['Enums']["class_status"],"title"?: string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"group_id"?: string | null,"gym_id"?: string,"id"?: string,"instructor_id"?: string,"schedule_id"?: string | null,"start_time"?: string | null,"status"?: Database["public"]['Enums']["class_status"],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "classes_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "class_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classes_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classes_instructor_id_fkey"
      columns: ["instructor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "classes_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "class_schedules"
      referencedColumns: ["id"]
    }
                  ]
                },"contract_students": {
                  Row: {
                    "contract_id": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contract_id": string,"student_id": string
                  }
                  Update: {
                    "contract_id"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contract_students_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contract_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "contract_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "contract_students_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"contracts": {
                  Row: {
                    "amount_cents": number,"billing": string,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"created_by": string | null,"discount_cents": number,"due_day": number,"ends_on": string,"enrollment_fee_cents": number,"external_ref": string | null,"gym_id": string,"id": string,"notes": string | null,"payer_id": string,"plan_id": string | null,"review_needed": boolean,"source": string,"starts_on": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"billing"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"discount_cents"?: number,"due_day": number,"ends_on": string,"enrollment_fee_cents"?: number,"external_ref"?: string | null,"gym_id": string,"id"?: string,"notes"?: string | null,"payer_id": string,"plan_id"?: string | null,"review_needed"?: boolean,"source"?: string,"starts_on": string,"status"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"billing"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"discount_cents"?: number,"due_day"?: number,"ends_on"?: string,"enrollment_fee_cents"?: number,"external_ref"?: string | null,"gym_id"?: string,"id"?: string,"notes"?: string | null,"payer_id"?: string,"plan_id"?: string | null,"review_needed"?: boolean,"source"?: string,"starts_on"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contracts_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contracts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contracts_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contracts_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "payers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contracts_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"face_detections": {
                  Row: {
                    "bbox": NonNullable<Json>,"decided_at": string,"decided_by": string | null,"decision": Database["public"]['Enums']["face_decision"],"embedding_id": string | null,"face_index": number,"id": string,"photo_id": string,"score": number | null,"student_id": string | null,"suggested_student_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bbox": NonNullable<Json>,"decided_at"?: string,"decided_by"?: string | null,"decision": Database["public"]['Enums']["face_decision"],"embedding_id"?: string | null,"face_index": number,"id"?: string,"photo_id": string,"score"?: number | null,"student_id"?: string | null,"suggested_student_id"?: string | null
                  }
                  Update: {
                    "bbox"?: NonNullable<Json>,"decided_at"?: string,"decided_by"?: string | null,"decision"?: Database["public"]['Enums']["face_decision"],"embedding_id"?: string | null,"face_index"?: number,"id"?: string,"photo_id"?: string,"score"?: number | null,"student_id"?: string | null,"suggested_student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "face_detections_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "face_detections_embedding_id_fkey"
      columns: ["embedding_id"]
isOneToOne: false
      referencedRelation: "face_embeddings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "face_detections_photo_id_fkey"
      columns: ["photo_id"]
isOneToOne: false
      referencedRelation: "class_photos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "face_detections_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "face_detections_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "face_detections_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "face_detections_suggested_student_id_fkey"
      columns: ["suggested_student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "face_detections_suggested_student_id_fkey"
      columns: ["suggested_student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "face_detections_suggested_student_id_fkey"
      columns: ["suggested_student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"graduation_events": {
                  Row: {
                    "created_at": string,"created_by": string | null,"gym_id": string,"held_on": string,"id": string,"notes": string | null,"title": string | null,"track": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"gym_id": string,"held_on": string,"id"?: string,"notes"?: string | null,"title"?: string | null,"track"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"gym_id"?: string,"held_on"?: string,"id"?: string,"notes"?: string | null,"title"?: string | null,"track"?: string
                  }
                  Relationships: []
                },"graduation_event_photos": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: []
                },"graduation_candidates": {
                  Row: {
                    "bbox": Json | null,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decided_via": string | null,"event_id": string,"from_rank_id": string | null,"graduation_id": string | null,"id": string,"notify_pending": boolean,"photo_id": string | null,"score": number | null,"source": string,"status": string,"student_id": string,"to_rank_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bbox"?: Json | null,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decided_via"?: string | null,"event_id": string,"from_rank_id"?: string | null,"graduation_id"?: string | null,"id"?: string,"notify_pending"?: boolean,"photo_id"?: string | null,"score"?: number | null,"source": string,"status"?: string,"student_id": string,"to_rank_id": string
                  }
                  Update: {
                    "bbox"?: Json | null,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decided_via"?: string | null,"event_id"?: string,"from_rank_id"?: string | null,"graduation_id"?: string | null,"id"?: string,"notify_pending"?: boolean,"photo_id"?: string | null,"score"?: number | null,"source"?: string,"status"?: string,"student_id"?: string,"to_rank_id"?: string
                  }
                  Relationships: []
                },"face_embeddings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"embedding": string,"id": string,"model": string,"source": string,"source_photo_id": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"embedding": string,"id"?: string,"model"?: string,"source"?: string,"source_photo_id"?: string | null,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"embedding"?: string,"id"?: string,"model"?: string,"source"?: string,"source_photo_id"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "face_embeddings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "face_embeddings_source_photo_id_fkey"
      columns: ["source_photo_id"]
isOneToOne: false
      referencedRelation: "class_photos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "face_embeddings_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "face_embeddings_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "face_embeddings_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"graduation_schedule": {
                  Row: {
                    "next_on": string | null,"track": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "next_on"?: string | null,"track": string,"updated_at"?: string
                  }
                  Update: {
                    "next_on"?: string | null,"track"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"gym_instructors": {
                  Row: {
                    "created_at": string,"gym_id": string,"profile_id": string,"role": Database["public"]['Enums']["gym_role"],"started_on": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"gym_id": string,"profile_id": string,"role"?: Database["public"]['Enums']["gym_role"],"started_on"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"gym_id"?: string,"profile_id"?: string,"role"?: Database["public"]['Enums']["gym_role"],"started_on"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "gym_instructors_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gym_instructors_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"gyms": {
                  Row: {
                    "address": string | null,"created_at": string,"created_by": string,"id": string,"management_enabled": boolean,"name": string,"next_graduation_on": string | null,"signup_contact_id": string | null,"signup_label": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"management_enabled"?: boolean,"name": string,"next_graduation_on"?: string | null,"signup_contact_id"?: string | null,"signup_label"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"management_enabled"?: boolean,"name"?: string,"next_graduation_on"?: string | null,"signup_contact_id"?: string | null,"signup_label"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "gyms_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"instructor_invites": {
                  Row: {
                    "created_at": string,"created_by": string,"expires_at": string,"token": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string,"token"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string,"token"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instructor_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instructor_invites_used_by_fkey"
      columns: ["used_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_plan_reminders": {
                  Row: {
                    "created_at": string,"last_sent_on": string | null,"profile_id": string,"remind_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"last_sent_on"?: string | null,"profile_id"?: string,"remind_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"last_sent_on"?: string | null,"profile_id"?: string,"remind_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_plan_reminders_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_plan_shares": {
                  Row: {
                    "class_id": string,"created_at": string,"created_by": string,"last_seen_at": string | null,"review_note": string | null,"review_notify_pending": boolean,"review_status": string | null,"reviewed_at": string | null,"reviewer_name": string | null,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"created_at"?: string,"created_by"?: string,"last_seen_at"?: string | null,"review_note"?: string | null,"review_notify_pending"?: boolean,"review_status"?: string | null,"reviewed_at"?: string | null,"reviewer_name"?: string | null,"token"?: string
                  }
                  Update: {
                    "class_id"?: string,"created_at"?: string,"created_by"?: string,"last_seen_at"?: string | null,"review_note"?: string | null,"review_notify_pending"?: boolean,"review_status"?: string | null,"reviewed_at"?: string | null,"reviewer_name"?: string | null,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_plan_shares_class_id_fkey"
      columns: ["class_id"]
isOneToOne: true
      referencedRelation: "class_turnout"
      referencedColumns: ["class_id"]
    },{
      foreignKeyName: "lesson_plan_shares_class_id_fkey"
      columns: ["class_id"]
isOneToOne: true
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_plan_shares_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_plans": {
                  Row: {
                    "class_id": string,"content": NonNullable<Json>,"id": string,"template_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "class_id": string,"content"?: NonNullable<Json>,"id"?: string,"template_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "class_id"?: string,"content"?: NonNullable<Json>,"id"?: string,"template_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_plans_class_id_fkey"
      columns: ["class_id"]
isOneToOne: true
      referencedRelation: "class_turnout"
      referencedColumns: ["class_id"]
    },{
      foreignKeyName: "lesson_plans_class_id_fkey"
      columns: ["class_id"]
isOneToOne: true
      referencedRelation: "classes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lesson_plans_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "lesson_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_templates": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"id": string,"owner_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"owner_id"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"owner_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_templates_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"message_templates": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"defaults": Json,"gym_id": string,"id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"defaults"?: Json,"gym_id": string,"id"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"defaults"?: Json,"gym_id"?: string,"id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_templates_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    }
                  ]
                },"modalities": {
                  Row: {
                    "active": boolean,"belt_system": string | null,"color": string | null,"created_at": string,"gym_id": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"belt_system"?: string | null,"color"?: string | null,"created_at"?: string,"gym_id": string,"id"?: string,"name": string
                  }
                  Update: {
                    "active"?: boolean,"belt_system"?: string | null,"color"?: string | null,"created_at"?: string,"gym_id"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "modalities_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    }
                  ]
                },"payers": {
                  Row: {
                    "cpf": string | null,"created_at": string,"email": string | null,"external_ref": string | null,"gym_id": string,"id": string,"name": string,"notes": string | null,"phone": string | null,"profile_id": string | null,"student_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cpf"?: string | null,"created_at"?: string,"email"?: string | null,"external_ref"?: string | null,"gym_id": string,"id"?: string,"name": string,"notes"?: string | null,"phone"?: string | null,"profile_id"?: string | null,"student_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cpf"?: string | null,"created_at"?: string,"email"?: string | null,"external_ref"?: string | null,"gym_id"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"profile_id"?: string | null,"student_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payers_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payers_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payers_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "payers_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "payers_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"charge_id": string,"created_at": string,"external_ref": string | null,"gateway_payment_id": string | null,"gym_id": string,"id": string,"method": string,"notes": string | null,"paid_on": string,"received_by": string | null,"reverse_reason": string | null,"reversed_at": string | null,"reversed_by": string | null,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"charge_id": string,"created_at"?: string,"external_ref"?: string | null,"gateway_payment_id"?: string | null,"gym_id": string,"id"?: string,"method": string,"notes"?: string | null,"paid_on": string,"received_by"?: string | null,"reverse_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"source"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"charge_id"?: string,"created_at"?: string,"external_ref"?: string | null,"gateway_payment_id"?: string | null,"gym_id"?: string,"id"?: string,"method"?: string,"notes"?: string | null,"paid_on"?: string,"received_by"?: string | null,"reverse_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charge_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_received_by_fkey"
      columns: ["received_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_reversed_by_fkey"
      columns: ["reversed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"duration_months": number,"enrollment_fee_cents": number,"gym_id": string,"id": string,"name": string,"price_cents": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"duration_months"?: number,"enrollment_fee_cents"?: number,"gym_id": string,"id"?: string,"name": string,"price_cents": number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"duration_months"?: number,"enrollment_fee_cents"?: number,"gym_id"?: string,"id"?: string,"name"?: string,"price_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plans_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "absence_alert_threshold": number,"avatar_url": string | null,"created_at": string,"face_auto_approve_min": number | null,"id": string,"name": string,"role": Database["public"]['Enums']["profile_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "absence_alert_threshold"?: number,"avatar_url"?: string | null,"created_at"?: string,"face_auto_approve_min"?: number | null,"id": string,"name"?: string,"role"?: Database["public"]['Enums']["profile_role"]
                  }
                  Update: {
                    "absence_alert_threshold"?: number,"avatar_url"?: string | null,"created_at"?: string,"face_auto_approve_min"?: number | null,"id"?: string,"name"?: string,"role"?: Database["public"]['Enums']["profile_role"]
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"profile_id": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"profile_id": string,"user_agent"?: string | null
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"profile_id"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ranks": {
                  Row: {
                    "colors": (string)[],"grade": number,"id": string,"level": string,"min_age": number | null,"min_months": number | null,"min_percent": number | null,"name": string,"required_classes": number | null,"track": string
                  }
                  ComputedFields: never
                  Insert: {
                    "colors"?: (string)[],"grade": number,"id"?: string,"level": string,"min_age"?: number | null,"min_months"?: number | null,"min_percent"?: number | null,"name": string,"required_classes"?: number | null,"track"?: string
                  }
                  Update: {
                    "colors"?: (string)[],"grade"?: number,"id"?: string,"level"?: string,"min_age"?: number | null,"min_months"?: number | null,"min_percent"?: number | null,"name"?: string,"required_classes"?: number | null,"track"?: string
                  }
                  Relationships: [
                    
                  ]
                },"student_access": {
                  Row: {
                    "created_at": string,"created_by": string,"expires_at": string,"last_seen_at": string | null,"student_id": string,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string,"last_seen_at"?: string | null,"student_id": string,"token"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string,"last_seen_at"?: string | null,"student_id"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_access_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_access_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_access_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_access_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"student_belts": {
                  Row: {
                    "belt_rank_id": string,"created_at": string,"date_unknown": boolean,"degrees": number,"graduated_at": string,"id": string,"notes": string | null,"recorded_by": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "belt_rank_id": string,"created_at"?: string,"date_unknown"?: boolean,"degrees"?: number,"graduated_at": string,"id"?: string,"notes"?: string | null,"recorded_by"?: string | null,"student_id": string
                  }
                  Update: {
                    "belt_rank_id"?: string,"created_at"?: string,"date_unknown"?: boolean,"degrees"?: number,"graduated_at"?: string,"id"?: string,"notes"?: string | null,"recorded_by"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_belts_belt_rank_id_fkey"
      columns: ["belt_rank_id"]
isOneToOne: false
      referencedRelation: "belt_ranks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_belts_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_belts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_belts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_belts_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"student_class_reminders": {
                  Row: {
                    "created_at": string,"enabled": boolean,"last_sent_on": string | null,"lead_minutes": number,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"last_sent_on"?: string | null,"lead_minutes"?: number,"profile_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"last_sent_on"?: string | null,"lead_minutes"?: number,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_class_reminders_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"student_details": {
                  Row: {
                    "cep": string | null,"city": string | null,"complement": string | null,"cpf": string | null,"district": string | null,"email": string | null,"external_ref": string | null,"gym_id": string,"number": string | null,"phone_home": string | null,"registered_on": string | null,"rg": string | null,"state": string | null,"street": string | null,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cep"?: string | null,"city"?: string | null,"complement"?: string | null,"cpf"?: string | null,"district"?: string | null,"email"?: string | null,"external_ref"?: string | null,"gym_id": string,"number"?: string | null,"phone_home"?: string | null,"registered_on"?: string | null,"rg"?: string | null,"state"?: string | null,"street"?: string | null,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cep"?: string | null,"city"?: string | null,"complement"?: string | null,"cpf"?: string | null,"district"?: string | null,"email"?: string | null,"external_ref"?: string | null,"gym_id"?: string,"number"?: string | null,"phone_home"?: string | null,"registered_on"?: string | null,"rg"?: string | null,"state"?: string | null,"street"?: string | null,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_details_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_details_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_details_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_details_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"student_graduations": {
                  Row: {
                    "created_at": string,"graduated_at": string,"id": string,"notes": string | null,"rank_id": string,"recorded_by": string,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"graduated_at": string,"id"?: string,"notes"?: string | null,"rank_id": string,"recorded_by"?: string,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"graduated_at"?: string,"id"?: string,"notes"?: string | null,"rank_id"?: string,"recorded_by"?: string,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_graduations_rank_id_fkey"
      columns: ["rank_id"]
isOneToOne: false
      referencedRelation: "ranks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_graduations_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_graduations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_graduations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_graduations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"student_guardian_consents": {
                  Row: {
                    "created_at": string,"document_sha256": string | null,"face_authorized": boolean | null,"file_path": string | null,"guardian_cpf": string | null,"guardian_name": string | null,"guardian_relationship": string | null,"id": string,"image_authorized": boolean | null,"rejected_at": string | null,"rejected_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"sign_token": string | null,"sign_token_created_by": string | null,"sign_token_expires_at": string | null,"signature_png": string | null,"signed_at": string | null,"signed_ip": string | null,"signed_place": string | null,"signed_user_agent": string | null,"status": string,"student_id": string,"term_version": string | null,"updated_at": string,"uploaded_at": string | null,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"document_sha256"?: string | null,"face_authorized"?: boolean | null,"file_path"?: string | null,"guardian_cpf"?: string | null,"guardian_name"?: string | null,"guardian_relationship"?: string | null,"id"?: string,"image_authorized"?: boolean | null,"rejected_at"?: string | null,"rejected_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sign_token"?: string | null,"sign_token_created_by"?: string | null,"sign_token_expires_at"?: string | null,"signature_png"?: string | null,"signed_at"?: string | null,"signed_ip"?: string | null,"signed_place"?: string | null,"signed_user_agent"?: string | null,"status"?: string,"student_id": string,"term_version"?: string | null,"updated_at"?: string,"uploaded_at"?: string | null,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"document_sha256"?: string | null,"face_authorized"?: boolean | null,"file_path"?: string | null,"guardian_cpf"?: string | null,"guardian_name"?: string | null,"guardian_relationship"?: string | null,"id"?: string,"image_authorized"?: boolean | null,"rejected_at"?: string | null,"rejected_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sign_token"?: string | null,"sign_token_created_by"?: string | null,"sign_token_expires_at"?: string | null,"signature_png"?: string | null,"signed_at"?: string | null,"signed_ip"?: string | null,"signed_place"?: string | null,"signed_user_agent"?: string | null,"status"?: string,"student_id"?: string,"term_version"?: string | null,"updated_at"?: string,"uploaded_at"?: string | null,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_guardian_consents_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_guardian_consents_sign_token_created_by_fkey"
      columns: ["sign_token_created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_guardian_consents_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_guardian_consents_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_guardian_consents_student_id_fkey"
      columns: ["student_id"]
isOneToOne: true
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_guardian_consents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"student_guardians": {
                  Row: {
                    "created_at": string,"legal_guardian": boolean,"payer_id": string,"relationship": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"legal_guardian"?: boolean,"payer_id": string,"relationship"?: string | null,"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"legal_guardian"?: boolean,"payer_id"?: string,"relationship"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_guardians_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "payers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_guardians_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_guardians_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_guardians_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"student_signup_requests": {
                  Row: {
                    "approval_notify_pending": boolean,"birth_date": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"graduated_at": string | null,"guardian_esign": Json | null,"guardian_file_path": string | null,"guardian_upload_token": string | null,"gym_id": string,"id": string,"image_consent_at": string | null,"name": string,"phone": string | null,"photo_path": string | null,"photo_upload_token": string | null,"profile_id": string,"rank_id": string | null,"status": string,"student_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval_notify_pending"?: boolean,"birth_date"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"graduated_at"?: string | null,"guardian_esign"?: Json | null,"guardian_file_path"?: string | null,"guardian_upload_token"?: string | null,"gym_id": string,"id"?: string,"image_consent_at"?: string | null,"name": string,"phone"?: string | null,"photo_path"?: string | null,"photo_upload_token"?: string | null,"profile_id": string,"rank_id"?: string | null,"status"?: string,"student_id"?: string | null
                  }
                  Update: {
                    "approval_notify_pending"?: boolean,"birth_date"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"graduated_at"?: string | null,"guardian_esign"?: Json | null,"guardian_file_path"?: string | null,"guardian_upload_token"?: string | null,"gym_id"?: string,"id"?: string,"image_consent_at"?: string | null,"name"?: string,"phone"?: string | null,"photo_path"?: string | null,"photo_upload_token"?: string | null,"profile_id"?: string,"rank_id"?: string | null,"status"?: string,"student_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "student_signup_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_signup_requests_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_signup_requests_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_signup_requests_rank_id_fkey"
      columns: ["rank_id"]
isOneToOne: false
      referencedRelation: "ranks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "student_signup_requests_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_absence_streaks"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_signup_requests_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_progress"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "student_signup_requests_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"students": {
                  Row: {
                    "account_consent_at": string | null,"active": boolean,"birth_date": string | null,"created_at": string,"face_opt_out_at": string | null,"gym_id": string,"id": string,"image_consent_at": string | null,"name": string,"notes": string | null,"opening_absent": number,"opening_after_grad": number | null,"opening_from": string | null,"opening_present": number,"opening_until": string | null,"phone": string | null,"photo_path": string | null,"profile_id": string | null,"started_on": string,"track": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_consent_at"?: string | null,"active"?: boolean,"birth_date"?: string | null,"created_at"?: string,"face_opt_out_at"?: string | null,"gym_id": string,"id"?: string,"image_consent_at"?: string | null,"name": string,"notes"?: string | null,"opening_absent"?: number,"opening_after_grad"?: number | null,"opening_from"?: string | null,"opening_present"?: number,"opening_until"?: string | null,"phone"?: string | null,"photo_path"?: string | null,"profile_id"?: string | null,"started_on"?: string,"track"?: string
                  }
                  Update: {
                    "account_consent_at"?: string | null,"active"?: boolean,"birth_date"?: string | null,"created_at"?: string,"face_opt_out_at"?: string | null,"gym_id"?: string,"id"?: string,"image_consent_at"?: string | null,"name"?: string,"notes"?: string | null,"opening_absent"?: number,"opening_after_grad"?: number | null,"opening_from"?: string | null,"opening_present"?: number,"opening_until"?: string | null,"phone"?: string | null,"photo_path"?: string | null,"profile_id"?: string | null,"started_on"?: string,"track"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "students_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "charge_overview": {
                  Row: {
                    "amount_cents": number,"cancel_reason": string | null,"cancelled_at": string | null,"competence": string | null,"contract_id": string | null,"created_at": string,"days_late": number | null,"description": string | null,"due_on": string,"gym_id": string,"id": string,"installment": number | null,"installments_total": number | null,"kind": string,"paid_cents": number | null,"paid_on": string | null,"payer_id": string,"payer_name": string,"payment_id": string | null,"payment_method": string | null,"payment_notes": string | null,"source": string,"state": string | null,"status": string,"student_ids": (string)[] | null,"student_names": (string)[] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "charges_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_payer_id_fkey"
      columns: ["payer_id"]
isOneToOne: false
      referencedRelation: "payers"
      referencedColumns: ["id"]
    }
                  ]
                },"class_turnout": {
                  Row: {
                    "class_id": string,"date": string,"gym_id": string,"present": number | null,"start_time": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "classes_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    }
                  ]
                },"student_absence_streaks": {
                  Row: {
                    "absences_in_row": number | null,"gym_id": string,"last_present_on": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "students_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    }
                  ]
                },"student_progress": {
                  Row: {
                    "attendance_since": number | null,"attendance_total": number | null,"classes_since": number | null,"current_rank_id": string | null,"gym_id": string,"last_attendance_on": string | null,"last_graduated_at": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "student_graduations_rank_id_fkey"
      columns: ["current_rank_id"]
isOneToOne: false
      referencedRelation: "ranks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "students_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "gyms"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "academy_invite_hash":
{ Args: { "p_token": string }; Returns: string
                           },
"academy_approve_signup_request":
{ Args: { "p_request_id": string,"p_student_id"?: string }; Returns: string
                           },
"academy_reject_signup_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"academy_signup_requests":
{ Args: { "p_gym_id": string }; Returns: Json
                           },
"academy_signup_settings":
{ Args: { "p_gym_id": string }; Returns: {
              "signup_contact_id": string,"signup_label": string
            }[]
                           },
"academy_invite_info":
{ Args: { "p_token": string }; Returns: {
              "academy": string,"email": string,"role": string,"status": string
            }[]
                           },
"academy_role":
{ Args: { "p_gym_id": string }; Returns: string
                           },
"accept_academy_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"accept_image_consent":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"accept_instructor_invite":
{ Args: { "p_token": string }; Returns: undefined
                           },
"add_signup_face_reference":
{ Args: { "p_embedding": Json,"p_id": string,"p_student_id": string }; Returns: boolean
                           },
"add_walk_ins":
{ Args: { "p_date": string,"p_location": string,"p_source"?: Database["public"]['Enums']["attendance_source"],"p_student_ids": (string)[] }; Returns: number
                           },
"approve_student_request":
{ Args: { "p_request_id": string,"p_student_id"?: string }; Returns: string
                           },
"attendance_reminder_is_due":
{ Args: { "p_last_sent_on": string,"p_remind_at": string }; Returns: boolean
                           },
"can_admin_charge":
{ Args: { "p_charge_id": string }; Returns: boolean
                           },
"can_admin_contract":
{ Args: { "p_contract_id": string }; Returns: boolean
                           },
"can_admin_student":
{ Args: { "p_student_id": string }; Returns: boolean
                           },
"can_delete_own_guardian_file":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_manage_class":
{ Args: { "p_class_id": string }; Returns: boolean
                           },
"can_manage_guardian_file":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_manage_photo":
{ Args: { "p_photo_id": string }; Returns: boolean
                           },
"can_manage_student":
{ Args: { "p_student_id": string }; Returns: boolean
                           },
"can_staff_class":
{ Args: { "p_class_id": string }; Returns: boolean
                           },
"can_staff_photo":
{ Args: { "p_photo_id": string }; Returns: boolean
                           },
"can_staff_student":
{ Args: { "p_student_id": string }; Returns: boolean
                           },
"can_upload_own_signup_term":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_upload_pending_signup_face":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_upload_pending_signup_term":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can_view_charge":
{ Args: { "p_charge_id": string }; Returns: boolean
                           },
"can_view_contract":
{ Args: { "p_contract_id": string }; Returns: boolean
                           },
"can_view_signup_face":
{ Args: { "p_owner": string }; Returns: boolean
                           },
"cancel_academy_invite":
{ Args: { "p_invite_id": string }; Returns: undefined
                           },
"cancel_contract":
{ Args: { "p_contract_id": string,"p_from"?: string,"p_reason": string }; Returns: number
                           },
"claim_attendance_reminders":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"claim_lesson_plan_reminders":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"claim_plan_review_notifications":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"claim_student_account":
{ Args: { "p_token": string }; Returns: undefined
                           },
"claim_student_approval_notifications":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"claim_student_class_reminders":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"set_student_photo":
{ Args: { "p_student_id": string; "p_path": string | null; "p_embedding"?: Json | null }; Returns: string | null
                           },
"delete_academy_class":
{ Args: { "p_class_id": string }; Returns: string[]
                           },
"conclude_academy_class":
{ Args: { "p_class_id": string }; Returns: undefined
                           },
"conclude_class":
{ Args: { "p_class_id": string }; Returns: undefined
                           },
"create_academy":
{ Args: { "p_address"?: string,"p_name": string }; Returns: string
                           },
"create_academy_invite":
{ Args: { "p_email": string,"p_gym_id": string,"p_role": string }; Returns: string
                           },
"create_contract":
{ Args: { "p_charges": Json,"p_contract": Json,"p_student_ids": (string)[] }; Returns: string
                           },
"create_guardian_sign_link":
{ Args: { "p_renew"?: boolean,"p_student_id": string }; Returns: Json
                           },
"create_instructor_invite":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"cron_secret_matches":
{ Args: { "p_secret": string }; Returns: boolean
                           },
"dispatch_attendance_reminders":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"email_verified":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"extend_contract":
{ Args: { "p_charges": Json,"p_contract_id": string,"p_ends_on": string }; Returns: number
                           },
"ensure_academy_classes":
{ Args: { "p_from": string,"p_gym_id": string,"p_to": string }; Returns: number
                           },
"ensure_classes":
{ Args: { "p_until"?: string }; Returns: number
                           },
"graduation_face_match":
{ Args: { "p_event_id": string,"p_faces": Json }; Returns: Json
                           },
"graduation_student_search":
{ Args: { "p_event_id": string,"p_query": string }; Returns: {
              "current_rank_id": string | null,"gym_id": string,"gym_name": string,"name": string,"next_rank_id": string | null,"student_id": string
            }[]
                           },
"propose_graduation_candidates":
{ Args: { "p_event_id": string,"p_items": Json }; Returns: {
              "bbox": Json | null,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decided_via": string | null,"event_id": string,"from_rank_id": string | null,"graduation_id": string | null,"id": string,"notify_pending": boolean,"photo_id": string | null,"score": number | null,"source": string,"status": string,"student_id": string,"to_rank_id": string
            }[]
                           },
"decide_graduation_candidate":
{ Args: { "p_candidate_id": string,"p_approve": boolean,"p_to_rank_id"?: string }; Returns: {
              "bbox": Json | null,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decided_via": string | null,"event_id": string,"from_rank_id": string | null,"graduation_id": string | null,"id": string,"notify_pending": boolean,"photo_id": string | null,"score": number | null,"source": string,"status": string,"student_id": string,"to_rank_id": string
            }
                           },
"dismiss_graduation_candidate":
{ Args: { "p_candidate_id": string }; Returns: boolean
                           },
"graduation_event_candidates":
{ Args: { "p_event_id": string }; Returns: {
              "bbox": Json | null,"created_at": string,"decided_at": string | null,"decided_via": string | null,"from_rank_id": string | null,"gym_id": string,"gym_name": string,"has_instructor": boolean,"id": string,"photo_id": string | null,"score": number | null,"source": string,"status": string,"storage_path": string | null,"student_id": string,"student_name": string,"to_rank_id": string
            }[]
                           },
"my_graduation_candidates":
{ Args: Record<PropertyKey, never>; Returns: {
              "bbox": Json | null,"created_at": string,"decided_at": string | null,"decided_via": string | null,"event_id": string,"from_rank_id": string | null,"gym_id": string,"held_on": string,"host_gym_name": string,"id": string,"score": number | null,"source": string,"status": string,"storage_path": string | null,"student_id": string,"student_name": string,"to_rank_id": string
            }[]
                           },
"face_references":
{ Args: { "p_gym_id": string }; Returns: {
              "created_at": string,"embedding": string,"id": string,"model": string,"student_id": string
            }[]
                           },
"face_signup_photos":
{ Args: { "p_gym_id": string }; Returns: {
              "photo_path": string,"student_id": string
            }[]
                           },
"guardian_consent_by_token":
{ Args: { "p_token": string }; Returns: {
              "created_at": string,
"document_sha256": string | null,
"face_authorized": boolean | null,
"file_path": string | null,
"guardian_cpf": string | null,
"guardian_name": string | null,
"guardian_relationship": string | null,
"id": string,
"image_authorized": boolean | null,
"rejected_at": string | null,
"rejected_reason": string | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"sign_token": string | null,
"sign_token_created_by": string | null,
"sign_token_expires_at": string | null,
"signature_png": string | null,
"signed_at": string | null,
"signed_ip": string | null,
"signed_place": string | null,
"signed_user_agent": string | null,
"status": string,
"student_id": string,
"term_version": string | null,
"updated_at": string,
"uploaded_at": string | null,
"uploaded_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "student_guardian_consents"
        isOneToOne: true
        isSetofReturn: false
      } },
"guardian_esign_record":
{ Args: { "p_birth_date": string,"p_face": boolean,"p_guardian_cpf": string,"p_guardian_name": string,"p_image": boolean,"p_place": string,"p_ref": string,"p_relationship": string,"p_signature": string,"p_student_name": string,"p_term_version": string }; Returns: Json
                           },
"guardian_sign_info":
{ Args: { "p_token": string }; Returns: Json
                           },
"guardian_term_signature":
{ Args: { "p_student_id"?: string,"p_token"?: string }; Returns: Json
                           },
"has_guardian_consent":
{ Args: { "p_student_id": string }; Returns: boolean
                           },
"has_image_consent":
{ Args: { "p_student_id": string }; Returns: boolean
                           },
"instructor_invite_info":
{ Args: { "p_token": string }; Returns: Json
                           },
"is_academy_admin":
{ Args: { "p_gym_id": string }; Returns: boolean
                           },
"is_academy_staff":
{ Args: { "p_gym_id": string }; Returns: boolean
                           },
"is_gym_member":
{ Args: { "p_gym_id": string }; Returns: boolean
                           },
"is_gym_owner":
{ Args: { "p_gym_id": string }; Returns: boolean
                           },
"is_instructor":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_minor":
{ Args: { "p_birth": string,"p_today": string }; Returns: boolean
                           },
"is_own_payer":
{ Args: { "p_payer_id": string }; Returns: boolean
                           },
"is_own_student":
{ Args: { "p_student_id": string }; Returns: boolean
                           },
"is_student_account":
{ Args: { "p_student_id": string }; Returns: boolean
                           },
"is_valid_cpf":
{ Args: { "p_cpf": string }; Returns: boolean
                           },
"lesson_plan_has_content":
{ Args: { "p_content": Json }; Returns: boolean
                           },
"list_student_requests":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"mark_attendance_batch":
{ Args: { "p_items": Json }; Returns: number
                           },
"my_academies":
{ Args: Record<PropertyKey, never>; Returns: {
              "address": string,"gym_id": string,"name": string,"role": string
            }[]
                           },
"my_face_photo":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_signup_request":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_student_account":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_student_portal":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"pay_charge":
{ Args: { "p_amount_cents": number,"p_charge_id": string,"p_method": string,"p_notes"?: string,"p_paid_on": string }; Returns: string
                           },
"pay_charges":
{ Args: { "p_charge_ids": string[],"p_method": string,"p_notes"?: string,"p_paid_on": string }; Returns: number
                           },
"portal_payload":
{ Args: { "p_student_id": string }; Returns: Json
                           },
"register_walk_ins":
{ Args: { "p_credits"?: number,"p_date": string,"p_location": string,"p_period"?: string,"p_source"?: Database["public"]['Enums']["attendance_source"],"p_student_ids": (string)[] }; Returns: number
                           },
"reject_student_request":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"request_app":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_student_access":
{ Args: { "p_birth_date"?: string,"p_graduated_at"?: string,"p_gym_id": string,"p_name": string,"p_phone"?: string,"p_rank_id"?: string }; Returns: undefined
                           },
"reverse_payment":
{ Args: { "p_charge_id": string,"p_reason": string }; Returns: undefined
                           },
"review_guardian_consent":
{ Args: { "p_approve": boolean,"p_image_consent"?: boolean,"p_reason"?: string,"p_student_id": string }; Returns: string
                           },
"review_shared_lesson_plan":
{ Args: { "p_note"?: string,"p_reviewer_name"?: string,"p_status": string,"p_token": string }; Returns: boolean
                           },
"rotate_lesson_plan_share":
{ Args: { "p_class_id": string }; Returns: string
                           },
"rotate_student_access":
{ Args: { "p_hours"?: number,"p_student_id": string }; Returns: string
                           },
"save_face_decisions":
{ Args: { "p_items": Json,"p_max_refs"?: number }; Returns: number
                           },
"save_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent"?: string }; Returns: undefined
                           },
"set_academy_member_role":
{ Args: { "p_gym_id": string,"p_profile_id": string,"p_role": string }; Returns: undefined
                           },
"set_guardian_consent_file":
{ Args: { "p_path": string,"p_student_id": string }; Returns: string
                           },
"set_my_gym_start":
{ Args: { "p_gym_id": string,"p_started_on": string }; Returns: undefined
                           },
"set_my_signup_image_consent":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"set_my_signup_term":
{ Args: { "p_path": string }; Returns: undefined
                           },
"set_pending_signup_photo":
{ Args: { "p_profile_id": string,"p_token": string }; Returns: undefined
                           },
"set_pending_signup_term":
{ Args: { "p_ext": string,"p_profile_id": string,"p_token": string }; Returns: undefined
                           },
"set_schedule_start":
{ Args: { "p_schedule_id": string,"p_starts_on": string }; Returns: number
                           },
"set_signup_photo":
{ Args: { "p_path": string }; Returns: undefined
                           },
"shared_lesson_plan":
{ Args: { "p_token": string }; Returns: Json
                           },
"sign_guardian_term":
{ Args: { "p_face": boolean,"p_guardian_cpf": string,"p_guardian_name": string,"p_image": boolean,"p_place": string,"p_relationship": string,"p_signature": string,"p_term_version": string,"p_token": string }; Returns: Json
                           },
"sign_signup_guardian_term":
{ Args: { "p_face": boolean,"p_guardian_cpf": string,"p_guardian_name": string,"p_image": boolean,"p_place": string,"p_profile_id": string,"p_relationship": string,"p_signature": string,"p_term_version": string,"p_token": string }; Returns: undefined
                           },
"signup_directory":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"signup_guardian_signature":
{ Args: { "p_request_id": string }; Returns: Json
                           },
"signup_ranks":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"storage_path_gym":
{ Args: { "p_name": string }; Returns: string
                           },
"storage_path_owner":
{ Args: { "p_name": string }; Returns: string
                           },
"student_class_reminder_due_profiles":
{ Args: Record<PropertyKey, never>; Returns: {
              "profile_id": string
            }[]
                           },
"student_face_photos":
{ Args: Record<PropertyKey, never>; Returns: {
              "photo_path": string,"student_id": string
            }[]
                           },
"student_portal":
{ Args: { "p_token": string }; Returns: Json
                           },
"student_reminder_classes":
{ Args: Record<PropertyKey, never>; Returns: {
              "gym": string,"lead_minutes": number,"profile_id": string,"start_at": string,"title": string
            }[]
                           },
"submit_guardian_consent_file":
{ Args: { "p_path": string }; Returns: string
                           },
"today_sp":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"set_academy_signup":
{ Args: { "p_contact_id": string | null,"p_gym_id": string,"p_label": string }; Returns: undefined
                           },
"update_academy":
{ Args: { "p_address"?: string,"p_gym_id": string,"p_name": string }; Returns: undefined
                           },
"wake_push_reminders":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"walk_in_locations":
{ Args: Record<PropertyKey, never>; Returns: {
              "location_label": string,"uses": number
            }[]
                           }
          }
          Enums: {
            "attendance_source": "manual"|"walk_in"|"import"|"face"|"student_checkin","attendance_status": "present"|"absent"|"late"|"justified","class_status": "scheduled"|"done"|"cancelled","face_decision": "confirmed"|"corrected"|"ignored"|"auto","gym_role": "owner"|"instructor","profile_role": "instructor"|"student"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "attendance_source": ["manual", "walk_in", "import", "face", "student_checkin"],"attendance_status": ["present", "absent", "late", "justified"],"class_status": ["scheduled", "done", "cancelled"],"face_decision": ["confirmed", "corrected", "ignored", "auto"],"gym_role": ["owner", "instructor"],"profile_role": ["instructor", "student"]
          }
        }
} as const

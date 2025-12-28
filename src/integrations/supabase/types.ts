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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_group: boolean | null
          title: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          facility_id: string | null
          id: string
          is_template: boolean | null
          min_staffing: number | null
          name: string
          parent_department_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          facility_id?: string | null
          id?: string
          is_template?: boolean | null
          min_staffing?: number | null
          name: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          facility_id?: string | null
          id?: string
          is_template?: boolean | null
          min_staffing?: number | null
          name?: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_facility_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_facility_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_facility_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilities_parent_facility_id_fkey"
            columns: ["parent_facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facilities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jitsi_server_config: {
        Row: {
          app_id: string | null
          app_secret: string | null
          created_at: string
          id: string
          is_active: boolean | null
          organization_id: string | null
          server_url: string
          updated_at: string
        }
        Insert: {
          app_id?: string | null
          app_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          server_url: string
          updated_at?: string
        }
        Update: {
          app_id?: string | null
          app_secret?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          server_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jitsi_server_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_edited: boolean | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_edited?: boolean | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      module_definitions: {
        Row: {
          created_at: string | null
          depends_on: string[] | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          key: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          depends_on?: string[] | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          depends_on?: string[] | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          read_at: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          read_at?: string | null
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          read_at?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_facilities: number | null
          max_users: number | null
          max_workspaces: number | null
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_facilities?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_facilities?: number | null
          max_users?: number | null
          max_workspaces?: number | null
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          force_password_change: boolean | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          force_password_change?: boolean | null
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          force_password_change?: boolean | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_module_access: {
        Row: {
          can_admin: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          id: string
          module_id: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_admin?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_admin?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          id?: string
          module_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_module_access_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "module_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_display_tokens: {
        Row: {
          created_at: string | null
          created_by: string | null
          department_id: string | null
          expires_at: string | null
          facility_id: string | null
          id: string
          is_active: boolean | null
          last_accessed_at: string | null
          name: string
          refresh_interval_seconds: number | null
          show_staff_names: boolean | null
          token: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          expires_at?: string | null
          facility_id?: string | null
          id?: string
          is_active?: boolean | null
          last_accessed_at?: string | null
          name: string
          refresh_interval_seconds?: number | null
          show_staff_names?: boolean | null
          token?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          expires_at?: string | null
          facility_id?: string | null
          id?: string
          is_active?: boolean | null
          last_accessed_at?: string | null
          name?: string
          refresh_interval_seconds?: number | null
          show_staff_names?: boolean | null
          token?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_display_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_display_tokens_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_display_tokens_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_display_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          created_by: string
          department_id: string
          end_date: string
          facility_id: string | null
          id: string
          name: string
          shift_count: number
          start_date: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          department_id: string
          end_date: string
          facility_id?: string | null
          id?: string
          name: string
          shift_count?: number
          start_date: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          department_id?: string
          end_date?: string
          facility_id?: string | null
          id?: string
          name?: string
          shift_count?: number
          start_date?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          assigned_by: string
          assignment_date: string
          created_at: string
          id: string
          notes: string | null
          shift_id: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          assignment_date: string
          created_at?: string
          id?: string
          notes?: string | null
          shift_id: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          assignment_date?: string
          created_at?: string
          id?: string
          notes?: string | null
          shift_id?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          color: string | null
          created_at: string
          end_time: string
          id: string
          name: string
          required_staff: number
          schedule_id: string
          shift_order: number
          start_time: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          end_time: string
          id?: string
          name: string
          required_staff?: number
          schedule_id: string
          shift_order: number
          start_time: string
        }
        Update: {
          color?: string | null
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          required_staff?: number
          schedule_id?: string
          shift_order?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignments: {
        Row: {
          assigned_to: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          status: string
          task_id: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          due_date: string | null
          facility_id: string | null
          id: string
          priority: string | null
          scope_type: string
          status: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          facility_id?: string | null
          id?: string
          priority?: string | null
          scope_type: string
          status?: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          facility_id?: string | null
          id?: string
          priority?: string | null
          scope_type?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      training_attendance: {
        Row: {
          attendance_status: string | null
          check_in_method: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          duration_minutes: number | null
          event_id: string
          id: string
          ip_address: string | null
          joined_at: string
          left_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_status?: string | null
          check_in_method?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          duration_minutes?: number | null
          event_id: string
          id?: string
          ip_address?: string | null
          joined_at?: string
          left_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_status?: string | null
          check_in_method?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          duration_minutes?: number | null
          event_id?: string
          id?: string
          ip_address?: string | null
          joined_at?: string
          left_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_attendance_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "training_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_event_targets: {
        Row: {
          created_at: string
          department_id: string | null
          event_id: string
          id: string
          is_mandatory: boolean | null
          target_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          event_id: string
          id?: string
          is_mandatory?: boolean | null
          target_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          event_id?: string
          id?: string
          is_mandatory?: boolean | null
          target_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_event_targets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_event_targets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "training_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_event_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_events: {
        Row: {
          allow_recording: boolean | null
          created_at: string
          created_by: string
          description: string | null
          enable_video_conference: boolean | null
          end_datetime: string
          event_type: Database["public"]["Enums"]["training_event_type"]
          id: string
          jitsi_moderator_password: string | null
          jitsi_room_name: string | null
          location_address: string | null
          location_type: Database["public"]["Enums"]["training_location_type"]
          max_participants: number | null
          max_video_participants: number | null
          online_link: string | null
          organization_id: string | null
          registration_type: string
          require_lobby: boolean | null
          responsible_user_id: string | null
          start_datetime: string
          status: Database["public"]["Enums"]["training_event_status"]
          title: string
          updated_at: string
        }
        Insert: {
          allow_recording?: boolean | null
          created_at?: string
          created_by: string
          description?: string | null
          enable_video_conference?: boolean | null
          end_datetime: string
          event_type?: Database["public"]["Enums"]["training_event_type"]
          id?: string
          jitsi_moderator_password?: string | null
          jitsi_room_name?: string | null
          location_address?: string | null
          location_type?: Database["public"]["Enums"]["training_location_type"]
          max_participants?: number | null
          max_video_participants?: number | null
          online_link?: string | null
          organization_id?: string | null
          registration_type?: string
          require_lobby?: boolean | null
          responsible_user_id?: string | null
          start_datetime: string
          status?: Database["public"]["Enums"]["training_event_status"]
          title: string
          updated_at?: string
        }
        Update: {
          allow_recording?: boolean | null
          created_at?: string
          created_by?: string
          description?: string | null
          enable_video_conference?: boolean | null
          end_datetime?: string
          event_type?: Database["public"]["Enums"]["training_event_type"]
          id?: string
          jitsi_moderator_password?: string | null
          jitsi_room_name?: string | null
          location_address?: string | null
          location_type?: Database["public"]["Enums"]["training_location_type"]
          max_participants?: number | null
          max_video_participants?: number | null
          online_link?: string | null
          organization_id?: string | null
          registration_type?: string
          require_lobby?: boolean | null
          responsible_user_id?: string | null
          start_datetime?: string
          status?: Database["public"]["Enums"]["training_event_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_events_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_meeting_chat: {
        Row: {
          created_at: string
          event_id: string
          id: string
          message: string
          sent_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          message: string
          sent_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          message?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_meeting_chat_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "training_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_meeting_chat_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_registrations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          registered_at: string
          reminder_sent: boolean | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          registered_at?: string
          reminder_sent?: boolean | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          registered_at?: string
          reminder_sent?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "training_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_group_members: {
        Row: {
          added_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          facility_id: string | null
          id: string
          name: string
          organization_id: string | null
          scope_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          facility_id?: string | null
          id?: string
          name: string
          organization_id?: string | null
          scope_type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          facility_id?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          scope_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_groups_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          can_admin: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string | null
          created_by: string | null
          id: string
          is_override: boolean | null
          module_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_admin?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_override?: boolean | null
          module_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_admin?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_override?: boolean | null
          module_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_access_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "module_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_user_id_fkey"
            columns: ["user_id"]
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
          department_id: string | null
          facility_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          specialty_id: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          facility_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          specialty_id?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          facility_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          specialty_id?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_department"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_roles_facility"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_approvals: {
        Row: {
          approval_level: number
          approver_id: string
          comments: string | null
          conflict_reason: string | null
          conflicting_plans: Json | null
          created_at: string
          has_conflict: boolean | null
          id: string
          status: string
          updated_at: string
          vacation_plan_id: string
        }
        Insert: {
          approval_level: number
          approver_id: string
          comments?: string | null
          conflict_reason?: string | null
          conflicting_plans?: Json | null
          created_at?: string
          has_conflict?: boolean | null
          id?: string
          status: string
          updated_at?: string
          vacation_plan_id: string
        }
        Update: {
          approval_level?: number
          approver_id?: string
          comments?: string | null
          conflict_reason?: string | null
          conflicting_plans?: Json | null
          created_at?: string
          has_conflict?: boolean | null
          id?: string
          status?: string
          updated_at?: string
          vacation_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_approvals_vacation_plan_id_fkey"
            columns: ["vacation_plan_id"]
            isOneToOne: false
            referencedRelation: "vacation_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_plans: {
        Row: {
          created_at: string
          created_by: string
          department_id: string
          id: string
          notes: string | null
          staff_id: string
          status: string
          submitted_at: string | null
          total_days: number
          updated_at: string
          vacation_type_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          department_id: string
          id?: string
          notes?: string | null
          staff_id: string
          status?: string
          submitted_at?: string | null
          total_days: number
          updated_at?: string
          vacation_type_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          department_id?: string
          id?: string
          notes?: string | null
          staff_id?: string
          status?: string
          submitted_at?: string | null
          total_days?: number
          updated_at?: string
          vacation_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_plans_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_plans_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_plans_vacation_type_id_fkey"
            columns: ["vacation_type_id"]
            isOneToOne: false
            referencedRelation: "vacation_types"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_splits: {
        Row: {
          conflict_data: Json | null
          created_at: string
          days: number
          end_date: string
          id: string
          start_date: string
          status: string | null
          vacation_plan_id: string
        }
        Insert: {
          conflict_data?: Json | null
          created_at?: string
          days: number
          end_date: string
          id?: string
          start_date: string
          status?: string | null
          vacation_plan_id: string
        }
        Update: {
          conflict_data?: Json | null
          created_at?: string
          days?: number
          end_date?: string
          id?: string
          start_date?: string
          status?: string | null
          vacation_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_splits_vacation_plan_id_fkey"
            columns: ["vacation_plan_id"]
            isOneToOne: false
            referencedRelation: "vacation_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_types: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_days: number | null
          name: string
          requires_documentation: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_days?: number | null
          name: string
          requires_documentation?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_days?: number | null
          name?: string
          requires_documentation?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      workspace_categories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          workspace_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          workspace_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_departments: {
        Row: {
          created_at: string | null
          department_template_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          department_template_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          department_template_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_departments_department_template_id_fkey"
            columns: ["department_template_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_departments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_module_access: {
        Row: {
          created_at: string | null
          id: string
          is_enabled: boolean | null
          module_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          module_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          module_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_module_access_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "module_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_module_access_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          max_concurrent_vacations: number | null
          max_vacation_splits: number
          min_vacation_notice_days: number | null
          name: string
          organization_id: string | null
          updated_at: string
          vacation_year_start_month: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_concurrent_vacations?: number | null
          max_vacation_splits?: number
          min_vacation_notice_days?: number | null
          name: string
          organization_id?: string | null
          updated_at?: string
          vacation_year_start_month?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_concurrent_vacations?: number | null
          max_vacation_splits?: number
          min_vacation_notice_days?: number | null
          name?: string
          organization_id?: string | null
          updated_at?: string
          vacation_year_start_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      check_user_vacation_overlap: {
        Args: { _splits: Json; _staff_id: string }
        Returns: Json
      }
      check_vacation_conflicts: {
        Args: { _department_id: string; _vacation_plan_id: string }
        Returns: Json
      }
      get_public_schedule: { Args: { p_token: string }; Returns: Json }
      get_user_modules: {
        Args: { _user_id: string }
        Returns: {
          can_admin: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          module_id: string
          module_key: string
          module_name: string
        }[]
      }
      get_user_workspaces: { Args: { _user_id: string }; Returns: string[] }
      has_module_access: {
        Args: { _module_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_workspace: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      user_has_conversation_access: {
        Args: { conversation_uuid: string; user_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "organization_admin"
        | "general_admin"
        | "workplace_supervisor"
        | "facility_supervisor"
        | "department_head"
        | "staff"
      training_event_status: "draft" | "published" | "cancelled" | "completed"
      training_event_type:
        | "training"
        | "workshop"
        | "seminar"
        | "webinar"
        | "meeting"
        | "conference"
        | "other"
      training_location_type: "online" | "physical" | "hybrid"
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
    Enums: {
      app_role: [
        "super_admin",
        "organization_admin",
        "general_admin",
        "workplace_supervisor",
        "facility_supervisor",
        "department_head",
        "staff",
      ],
      training_event_status: ["draft", "published", "cancelled", "completed"],
      training_event_type: [
        "training",
        "workshop",
        "seminar",
        "webinar",
        "meeting",
        "conference",
        "other",
      ],
      training_location_type: ["online", "physical", "hybrid"],
    },
  },
} as const

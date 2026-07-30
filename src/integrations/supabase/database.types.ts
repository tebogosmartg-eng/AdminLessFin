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
      accounting_dimension_values: {
        Row: {
          code: string
          company_id: string
          created_at: string
          dimension_type: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          dimension_type: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          dimension_type?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_dimension_values_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      accounting_periods: {
        Row: {
          company_id: string
          created_at: string
          end_date: string
          financial_year_id: string
          id: string
          period_number: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date: string
          financial_year_id: string
          id?: string
          period_number: number
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string
          financial_year_id?: string
          id?: string
          period_number?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_periods_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_acquisitions: {
        Row: {
          accumulated_depreciation_account_id: string | null
          asset_account_id: string | null
          asset_code: string | null
          capitalisation_approved: boolean
          capitalisation_approved_at: string | null
          capitalisation_approved_by: string | null
          capitalisation_approved_by_name: string | null
          capitalisation_date: string | null
          category_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          custodian_name: string | null
          department: string | null
          depreciation_expense_account_id: string | null
          depreciation_method: string | null
          description: string
          generated_asset_id: string | null
          id: string
          invoice_number: string | null
          journal_entry_id: string | null
          location: string | null
          notes: string | null
          payment_account_id: string | null
          purchase_cost: number
          purchase_date: string | null
          purchase_order_ref: string | null
          receipt_date: string | null
          residual_value: number | null
          serial_number: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          useful_life_years: number | null
        }
        Insert: {
          accumulated_depreciation_account_id?: string | null
          asset_account_id?: string | null
          asset_code?: string | null
          capitalisation_approved?: boolean
          capitalisation_approved_at?: string | null
          capitalisation_approved_by?: string | null
          capitalisation_approved_by_name?: string | null
          capitalisation_date?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          custodian_name?: string | null
          department?: string | null
          depreciation_expense_account_id?: string | null
          depreciation_method?: string | null
          description: string
          generated_asset_id?: string | null
          id?: string
          invoice_number?: string | null
          journal_entry_id?: string | null
          location?: string | null
          notes?: string | null
          payment_account_id?: string | null
          purchase_cost?: number
          purchase_date?: string | null
          purchase_order_ref?: string | null
          receipt_date?: string | null
          residual_value?: number | null
          serial_number?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          useful_life_years?: number | null
        }
        Update: {
          accumulated_depreciation_account_id?: string | null
          asset_account_id?: string | null
          asset_code?: string | null
          capitalisation_approved?: boolean
          capitalisation_approved_at?: string | null
          capitalisation_approved_by?: string | null
          capitalisation_approved_by_name?: string | null
          capitalisation_date?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          custodian_name?: string | null
          department?: string | null
          depreciation_expense_account_id?: string | null
          depreciation_method?: string | null
          description?: string
          generated_asset_id?: string | null
          id?: string
          invoice_number?: string | null
          journal_entry_id?: string | null
          location?: string | null
          notes?: string | null
          payment_account_id?: string | null
          purchase_cost?: number
          purchase_date?: string | null
          purchase_order_ref?: string | null
          receipt_date?: string | null
          residual_value?: number | null
          serial_number?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          useful_life_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_acquisitions_accumulated_depreciation_account_id_fkey"
            columns: ["accumulated_depreciation_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_acquisitions_asset_account_id_fkey"
            columns: ["asset_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_acquisitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_acquisitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_acquisitions_depreciation_expense_account_id_fkey"
            columns: ["depreciation_expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_acquisitions_generated_asset_id_fkey"
            columns: ["generated_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_acquisitions_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_acquisitions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_bulk_operations: {
        Row: {
          asset_ids: string[]
          company_id: string
          created_at: string
          id: string
          operation_type: string
          payload: Json
          performed_by: string | null
          performed_by_name: string | null
          result_summary: Json
          status: string
          validation_errors: Json
        }
        Insert: {
          asset_ids?: string[]
          company_id: string
          created_at?: string
          id?: string
          operation_type: string
          payload?: Json
          performed_by?: string | null
          performed_by_name?: string | null
          result_summary?: Json
          status?: string
          validation_errors?: Json
        }
        Update: {
          asset_ids?: string[]
          company_id?: string
          created_at?: string
          id?: string
          operation_type?: string
          payload?: Json
          performed_by?: string | null
          performed_by_name?: string | null
          result_summary?: Json
          status?: string
          validation_errors?: Json
        }
        Relationships: [
          {
            foreignKeyName: "asset_bulk_operations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_categories: {
        Row: {
          accumulated_depreciation_account_id: string | null
          capitalisation_threshold: number | null
          company_id: string
          component_accounting_enabled: boolean
          created_at: string | null
          default_verification_frequency_months: number
          depreciation_expense_account_id: string | null
          depreciation_method: string | null
          disposal_account_id: string | null
          gl_asset_account_id: string | null
          id: string
          impairment_account_id: string | null
          name: string
          residual_value_pct: number | null
          revaluation_reserve_account_id: string | null
          updated_at: string
          useful_life_years: number | null
        }
        Insert: {
          accumulated_depreciation_account_id?: string | null
          capitalisation_threshold?: number | null
          company_id: string
          component_accounting_enabled?: boolean
          created_at?: string | null
          default_verification_frequency_months?: number
          depreciation_expense_account_id?: string | null
          depreciation_method?: string | null
          disposal_account_id?: string | null
          gl_asset_account_id?: string | null
          id?: string
          impairment_account_id?: string | null
          name: string
          residual_value_pct?: number | null
          revaluation_reserve_account_id?: string | null
          updated_at?: string
          useful_life_years?: number | null
        }
        Update: {
          accumulated_depreciation_account_id?: string | null
          capitalisation_threshold?: number | null
          company_id?: string
          component_accounting_enabled?: boolean
          created_at?: string | null
          default_verification_frequency_months?: number
          depreciation_expense_account_id?: string | null
          depreciation_method?: string | null
          disposal_account_id?: string | null
          gl_asset_account_id?: string | null
          id?: string
          impairment_account_id?: string | null
          name?: string
          residual_value_pct?: number | null
          revaluation_reserve_account_id?: string | null
          updated_at?: string
          useful_life_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_categories_accumulated_depreciation_account_id_fkey"
            columns: ["accumulated_depreciation_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_depreciation_expense_account_id_fkey"
            columns: ["depreciation_expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_disposal_account_id_fkey"
            columns: ["disposal_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_gl_asset_account_id_fkey"
            columns: ["gl_asset_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_impairment_account_id_fkey"
            columns: ["impairment_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_categories_revaluation_reserve_account_id_fkey"
            columns: ["revaluation_reserve_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_code_sequences: {
        Row: {
          company_id: string
          last_number: number
          seq_year: number
          updated_at: string
        }
        Insert: {
          company_id: string
          last_number?: number
          seq_year: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          last_number?: number
          seq_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_code_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_components: {
        Row: {
          accumulated_depreciation: number
          company_id: string
          component_code: string
          cost: number
          created_at: string
          depreciation_method: string | null
          description: string
          id: string
          last_depreciation_date: string | null
          linked_asset_id: string | null
          parent_asset_id: string
          replaced_by_component_id: string | null
          replacement_date: string | null
          replacement_notes: string | null
          residual_value: number
          status: string
          updated_at: string
          useful_life_years: number | null
        }
        Insert: {
          accumulated_depreciation?: number
          company_id: string
          component_code: string
          cost?: number
          created_at?: string
          depreciation_method?: string | null
          description: string
          id?: string
          last_depreciation_date?: string | null
          linked_asset_id?: string | null
          parent_asset_id: string
          replaced_by_component_id?: string | null
          replacement_date?: string | null
          replacement_notes?: string | null
          residual_value?: number
          status?: string
          updated_at?: string
          useful_life_years?: number | null
        }
        Update: {
          accumulated_depreciation?: number
          company_id?: string
          component_code?: string
          cost?: number
          created_at?: string
          depreciation_method?: string | null
          description?: string
          id?: string
          last_depreciation_date?: string | null
          linked_asset_id?: string | null
          parent_asset_id?: string
          replaced_by_component_id?: string | null
          replacement_date?: string | null
          replacement_notes?: string | null
          residual_value?: number
          status?: string
          updated_at?: string
          useful_life_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_components_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_components_linked_asset_id_fkey"
            columns: ["linked_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_components_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_components_replaced_by_component_id_fkey"
            columns: ["replaced_by_component_id"]
            isOneToOne: false
            referencedRelation: "asset_components"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_documents: {
        Row: {
          asset_id: string
          company_id: string
          created_at: string
          document_type: string
          file_name: string
          file_size_bytes: number | null
          file_url: string | null
          id: string
          mime_type: string | null
          notes: string | null
          uploaded_by: string | null
        }
        Insert: {
          asset_id: string
          company_id: string
          created_at?: string
          document_type: string
          file_name: string
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Update: {
          asset_id?: string
          company_id?: string
          created_at?: string
          document_type?: string
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_documents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_lifecycle_events: {
        Row: {
          asset_id: string
          attachment_url: string | null
          company_id: string
          created_at: string
          event_date: string
          event_type: string
          id: string
          metadata: Json
          reason: string | null
          reference: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          asset_id: string
          attachment_url?: string | null
          company_id: string
          created_at?: string
          event_date?: string
          event_type: string
          id?: string
          metadata?: Json
          reason?: string | null
          reference?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          asset_id?: string
          attachment_url?: string | null
          company_id?: string
          created_at?: string
          event_date?: string
          event_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
          reference?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_lifecycle_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_lifecycle_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance_records: {
        Row: {
          asset_id: string
          company_id: string
          cost: number
          created_at: string
          description: string
          downtime_hours: number
          id: string
          notes: string | null
          performed_by: string | null
          record_type: string
          schedule_id: string | null
          service_date: string
          vendor_name: string | null
        }
        Insert: {
          asset_id: string
          company_id: string
          cost?: number
          created_at?: string
          description: string
          downtime_hours?: number
          id?: string
          notes?: string | null
          performed_by?: string | null
          record_type?: string
          schedule_id?: string | null
          service_date: string
          vendor_name?: string | null
        }
        Update: {
          asset_id?: string
          company_id?: string
          cost?: number
          created_at?: string
          description?: string
          downtime_hours?: number
          id?: string
          notes?: string | null
          performed_by?: string | null
          record_type?: string
          schedule_id?: string | null
          service_date?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_records_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "asset_maintenance_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance_schedules: {
        Row: {
          asset_id: string
          company_id: string
          created_at: string
          frequency_months: number
          id: string
          last_service_date: string | null
          next_service_date: string | null
          notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          company_id: string
          created_at?: string
          frequency_months?: number
          id?: string
          last_service_date?: string | null
          next_service_date?: string | null
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          company_id?: string
          created_at?: string
          frequency_months?: number
          id?: string
          last_service_date?: string | null
          next_service_date?: string | null
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_relationships: {
        Row: {
          child_asset_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          parent_asset_id: string
          relationship_type: string
        }
        Insert: {
          child_asset_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          parent_asset_id: string
          relationship_type?: string
        }
        Update: {
          child_asset_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          parent_asset_id?: string
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_relationships_child_asset_id_fkey"
            columns: ["child_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relationships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relationships_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_verification_history: {
        Row: {
          asset_id: string
          company_id: string
          created_at: string
          id: string
          location_confirmed: string | null
          notes: string | null
          status: string
          verification_method: string
          verified_at: string
          verifier_name: string | null
          verifier_user_id: string | null
        }
        Insert: {
          asset_id: string
          company_id: string
          created_at?: string
          id?: string
          location_confirmed?: string | null
          notes?: string | null
          status?: string
          verification_method?: string
          verified_at?: string
          verifier_name?: string | null
          verifier_user_id?: string | null
        }
        Update: {
          asset_id?: string
          company_id?: string
          created_at?: string
          id?: string
          location_confirmed?: string | null
          notes?: string | null
          status?: string
          verification_method?: string
          verified_at?: string
          verifier_name?: string | null
          verifier_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_verification_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_verification_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          changed_by: string | null
          company_id: string | null
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          changed_by?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          changed_by?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string
          bank_name: string | null
          branch_code: string | null
          chart_of_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_default: boolean
          metadata: Json
          name: string
          opening_balance: number
          opening_balance_date: string | null
          opening_balance_posted: boolean
          status: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string
          bank_name?: string | null
          branch_code?: string | null
          chart_of_account_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_default?: boolean
          metadata?: Json
          name: string
          opening_balance?: number
          opening_balance_date?: string | null
          opening_balance_posted?: boolean
          status?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string
          bank_name?: string | null
          branch_code?: string | null
          chart_of_account_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_default?: boolean
          metadata?: Json
          name?: string
          opening_balance?: number
          opening_balance_date?: string | null
          opening_balance_posted?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_chart_of_account_id_fkey"
            columns: ["chart_of_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          bank_account_id: string
          closing_balance: number | null
          company_id: string
          file_name: string | null
          id: string
          imported_at: string
          imported_by: string | null
          opening_balance: number | null
          period_end: string | null
          period_start: string | null
          status: string
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number | null
          company_id: string
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number | null
          company_id?: string
          file_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          opening_balance?: number | null
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          amount: number
          bank_account_id: string
          company_id: string
          created_at: string
          description: string | null
          external_reference: string | null
          id: string
          line_date: string
          match_status: string
          matched_bank_transaction_id: string | null
          matched_journal_entry_item_id: string | null
          statement_import_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          company_id: string
          created_at?: string
          description?: string | null
          external_reference?: string | null
          id?: string
          line_date: string
          match_status?: string
          matched_bank_transaction_id?: string | null
          matched_journal_entry_item_id?: string | null
          statement_import_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          external_reference?: string | null
          id?: string
          line_date?: string
          match_status?: string
          matched_bank_transaction_id?: string | null
          matched_journal_entry_item_id?: string | null
          statement_import_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_journal_entry_item_id_fkey"
            columns: ["matched_journal_entry_item_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_txn_fkey"
            columns: ["matched_bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_statement_import_id_fkey"
            columns: ["statement_import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string
          company_id: string
          contra_account_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          journal_entry_id: string | null
          posting_request_id: string | null
          reference: string | null
          statement_line_id: string | null
          transaction_date: string
          transaction_type: string
          transfer_id: string | null
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          bank_account_id: string
          company_id: string
          contra_account_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          journal_entry_id?: string | null
          posting_request_id?: string | null
          reference?: string | null
          statement_line_id?: string | null
          transaction_date: string
          transaction_type: string
          transfer_id?: string | null
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string
          company_id?: string
          contra_account_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          journal_entry_id?: string | null
          posting_request_id?: string | null
          reference?: string | null
          statement_line_id?: string | null
          transaction_date?: string
          transaction_type?: string
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_contra_account_id_fkey"
            columns: ["contra_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_posting_request_id_fkey"
            columns: ["posting_request_id"]
            isOneToOne: false
            referencedRelation: "posting_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_line_id_fkey"
            columns: ["statement_line_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "bank_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transfers: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          from_bank_account_id: string
          id: string
          idempotency_key: string
          journal_entry_id: string | null
          posting_request_id: string | null
          to_bank_account_id: string
          transfer_date: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          from_bank_account_id: string
          id?: string
          idempotency_key: string
          journal_entry_id?: string | null
          posting_request_id?: string | null
          to_bank_account_id: string
          transfer_date: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          from_bank_account_id?: string
          id?: string
          idempotency_key?: string
          journal_entry_id?: string | null
          posting_request_id?: string | null
          to_bank_account_id?: string
          transfer_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_from_bank_account_id_fkey"
            columns: ["from_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_posting_request_id_fkey"
            columns: ["posting_request_id"]
            isOneToOne: false
            referencedRelation: "posting_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfers_to_bank_account_id_fkey"
            columns: ["to_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          attachment_url: string | null
          bill_date: string
          bill_number: string | null
          company_id: string
          created_at: string | null
          due_date: string
          id: string
          journal_entry_id: string | null
          status: string
          vendor_id: string
        }
        Insert: {
          attachment_url?: string | null
          bill_date?: string
          bill_number?: string | null
          company_id: string
          created_at?: string | null
          due_date: string
          id?: string
          journal_entry_id?: string | null
          status?: string
          vendor_id: string
        }
        Update: {
          attachment_url?: string | null
          bill_date?: string
          bill_number?: string | null
          company_id?: string
          created_at?: string | null
          due_date?: string
          id?: string
          journal_entry_id?: string | null
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_id: string
          amount: number
          company_id: string
          created_at: string | null
          id: string
          period: string
          start_date: string
        }
        Insert: {
          account_id: string
          amount: number
          company_id: string
          created_at?: string | null
          id?: string
          period: string
          start_date: string
        }
        Update: {
          account_id?: string
          amount?: number
          company_id?: string
          created_at?: string | null
          id?: string
          period?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string | null
          account_number: number
          account_role: string | null
          allow_manual_posting: boolean
          cash_flow_classification: string | null
          category: string | null
          company_id: string
          control_account: boolean
          created_at: string | null
          description: string | null
          financial_statement: string | null
          id: string
          is_active: boolean
          name: string
          normal_balance: string | null
          parent_account_id: string | null
          posting_blocked: boolean
          presentation_order: number | null
          requires_dimension: boolean
          source: string | null
          subcategory: string | null
          system_account: boolean
          tax_treatment: string | null
          template_key: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          account_code?: string | null
          account_number: number
          account_role?: string | null
          allow_manual_posting?: boolean
          cash_flow_classification?: string | null
          category?: string | null
          company_id: string
          control_account?: boolean
          created_at?: string | null
          description?: string | null
          financial_statement?: string | null
          id?: string
          is_active?: boolean
          name: string
          normal_balance?: string | null
          parent_account_id?: string | null
          posting_blocked?: boolean
          presentation_order?: number | null
          requires_dimension?: boolean
          source?: string | null
          subcategory?: string | null
          system_account?: boolean
          tax_treatment?: string | null
          template_key?: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          account_code?: string | null
          account_number?: number
          account_role?: string | null
          allow_manual_posting?: boolean
          cash_flow_classification?: string | null
          category?: string | null
          company_id?: string
          control_account?: boolean
          created_at?: string | null
          description?: string | null
          financial_statement?: string | null
          id?: string
          is_active?: boolean
          name?: string
          normal_balance?: string | null
          parent_account_id?: string | null
          posting_blocked?: boolean
          presentation_order?: number | null
          requires_dimension?: boolean
          source?: string | null
          subcategory?: string | null
          system_account?: boolean
          tax_treatment?: string | null
          template_key?: string | null
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      closed_financial_years: {
        Row: {
          closing_journal_entry_id: string | null
          company_id: string
          created_at: string | null
          end_date: string
          id: string
          start_date: string
        }
        Insert: {
          closing_journal_entry_id?: string | null
          company_id: string
          created_at?: string | null
          end_date: string
          id?: string
          start_date: string
        }
        Update: {
          closing_journal_entry_id?: string | null
          company_id?: string
          created_at?: string | null
          end_date?: string
          id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "closed_financial_years_closing_journal_entry_id_fkey"
            columns: ["closing_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closed_financial_years_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string | null
          default_invoice_notes: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          default_invoice_notes?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          default_invoice_notes?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          tax_id?: string | null
        }
        Relationships: []
      }
      company_employee_number_settings: {
        Row: {
          barcode_style: string
          branch_code: string | null
          company_code: string | null
          company_id: string
          display_format: string
          format_template: string
          next_sequence: number
          qr_style: string
          sequence_padding: number
          starting_number: number
          updated_at: string
        }
        Insert: {
          barcode_style?: string
          branch_code?: string | null
          company_code?: string | null
          company_id: string
          display_format?: string
          format_template?: string
          next_sequence?: number
          qr_style?: string
          sequence_padding?: number
          starting_number?: number
          updated_at?: string
        }
        Update: {
          barcode_style?: string
          branch_code?: string | null
          company_code?: string | null
          company_id?: string
          display_format?: string
          format_template?: string
          next_sequence?: number
          qr_style?: string
          sequence_padding?: number
          starting_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_employee_number_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_payroll_rule_settings: {
        Row: {
          company_id: string
          config: Json
          enabled: boolean
          id: string
          rule_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          config?: Json
          enabled?: boolean
          id?: string
          rule_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          config?: Json
          enabled?: boolean
          id?: string
          rule_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_payroll_rule_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_payroll_rule_settings_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "payroll_rule_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          company_id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_items: {
        Row: {
          account_id: string
          created_at: string | null
          credit_note_id: string
          description: string
          id: string
          product_id: string | null
          quantity: number
          tax_rate_id: string | null
          unit_price: number
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credit_note_id: string
          description: string
          id?: string
          product_id?: string | null
          quantity?: number
          tax_rate_id?: string | null
          unit_price?: number
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credit_note_id?: string
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          tax_rate_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          company_id: string
          created_at: string | null
          credit_note_date: string
          credit_note_number: string
          customer_id: string
          id: string
          journal_entry_id: string | null
          reason: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          credit_note_date?: string
          credit_note_number: string
          customer_id: string
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          credit_note_date?: string
          credit_note_number?: string
          customer_id?: string
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          company_id: string
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          payment_terms: number | null
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          payment_terms?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          payment_terms?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efcp_close_activity: {
        Row: {
          close_workspace_id: string
          company_id: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          message: string
        }
        Insert: {
          close_workspace_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          message: string
        }
        Update: {
          close_workspace_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "efcp_close_activity_close_workspace_id_fkey"
            columns: ["close_workspace_id"]
            isOneToOne: false
            referencedRelation: "efcp_close_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efcp_close_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efcp_close_approvals: {
        Row: {
          approval_role: string
          close_workspace_id: string
          company_id: string
          decided_at: string
          decided_by: string | null
          decided_by_name: string | null
          decision: string
          id: string
          note: string | null
        }
        Insert: {
          approval_role: string
          close_workspace_id: string
          company_id: string
          decided_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decision?: string
          id?: string
          note?: string | null
        }
        Update: {
          approval_role?: string
          close_workspace_id?: string
          company_id?: string
          decided_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decision?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efcp_close_approvals_close_workspace_id_fkey"
            columns: ["close_workspace_id"]
            isOneToOne: false
            referencedRelation: "efcp_close_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efcp_close_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efcp_close_items: {
        Row: {
          category: string
          close_workspace_id: string
          company_id: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          item_key: string
          mandatory: boolean
          outstanding_issues: string | null
          prepared_by: string | null
          reviewed_by: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          close_workspace_id: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          item_key: string
          mandatory?: boolean
          outstanding_issues?: string | null
          prepared_by?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          close_workspace_id?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          item_key?: string
          mandatory?: boolean
          outstanding_issues?: string | null
          prepared_by?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efcp_close_items_close_workspace_id_fkey"
            columns: ["close_workspace_id"]
            isOneToOne: false
            referencedRelation: "efcp_close_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efcp_close_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efcp_close_workspaces: {
        Row: {
          close_type: string
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          label: string
          period_status: string
          start_date: string
          updated_at: string
        }
        Insert: {
          close_type?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          label: string
          period_status?: string
          start_date: string
          updated_at?: string
        }
        Update: {
          close_type?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          label?: string
          period_status?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efcp_close_workspaces_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_accounting_policies: {
        Row: {
          body: string
          company_id: string
          created_at: string
          disclosure_template_id: string | null
          id: string
          policy_code: string
          policy_set_id: string
          sort_order: number
          status: string
          structure_node_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          disclosure_template_id?: string | null
          id?: string
          policy_code: string
          policy_set_id: string
          sort_order?: number
          status?: string
          structure_node_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          disclosure_template_id?: string | null
          id?: string
          policy_code?: string
          policy_set_id?: string
          sort_order?: number
          status?: string
          structure_node_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_accounting_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_accounting_policies_disclosure_template_id_fkey"
            columns: ["disclosure_template_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_accounting_policies_policy_set_id_fkey"
            columns: ["policy_set_id"]
            isOneToOne: false
            referencedRelation: "efs_accounting_policy_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_accounting_policies_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_accounting_policy_sets: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          framework_pack_id: string
          id: string
          prepared_at: string | null
          prepared_by: string | null
          status: string
          title: string
          updated_at: string
          version_no: number
          workspace_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          framework_pack_id: string
          id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          version_no?: number
          workspace_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          framework_pack_id?: string
          id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          status?: string
          title?: string
          updated_at?: string
          version_no?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_accounting_policy_sets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_accounting_policy_sets_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_accounting_policy_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_attachment_forbidden_targets: {
        Row: {
          rationale: string
          target_kind: string
        }
        Insert: {
          rationale: string
          target_kind: string
        }
        Update: {
          rationale?: string
          target_kind?: string
        }
        Relationships: []
      }
      efs_attachment_point_kinds: {
        Row: {
          capability_phase: string
          description: string
          kind_code: string
          label: string
        }
        Insert: {
          capability_phase: string
          description: string
          kind_code: string
          label: string
        }
        Update: {
          capability_phase?: string
          description?: string
          kind_code?: string
          label?: string
        }
        Relationships: []
      }
      efs_attachment_points: {
        Row: {
          created_at: string
          disclosure_node_id: string | null
          id: string
          kind_code: string
          reserved_artefact_ref: string | null
          status: string
          structure_node_id: string | null
        }
        Insert: {
          created_at?: string
          disclosure_node_id?: string | null
          id?: string
          kind_code: string
          reserved_artefact_ref?: string | null
          status?: string
          structure_node_id?: string | null
        }
        Update: {
          created_at?: string
          disclosure_node_id?: string | null
          id?: string
          kind_code?: string
          reserved_artefact_ref?: string | null
          status?: string
          structure_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_attachment_points_disclosure_node_id_fkey"
            columns: ["disclosure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_attachment_points_kind_code_fkey"
            columns: ["kind_code"]
            isOneToOne: false
            referencedRelation: "efs_attachment_point_kinds"
            referencedColumns: ["kind_code"]
          },
          {
            foreignKeyName: "efs_attachment_points_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_canonical_tb_lines: {
        Row: {
          account_code: string | null
          account_name: string
          account_type: string
          canonical_tb_id: string
          closing_balance: number
          company_id: string
          credit: number
          debit: number
          id: string
          line_key: string
          opening_balance: number
          period_activity: number
          sign_rule_applied: string
          sort_order: number
          source_ref: Json
          taxonomy_line_code: string | null
        }
        Insert: {
          account_code?: string | null
          account_name: string
          account_type: string
          canonical_tb_id: string
          closing_balance?: number
          company_id: string
          credit?: number
          debit?: number
          id?: string
          line_key: string
          opening_balance?: number
          period_activity?: number
          sign_rule_applied?: string
          sort_order?: number
          source_ref?: Json
          taxonomy_line_code?: string | null
        }
        Update: {
          account_code?: string | null
          account_name?: string
          account_type?: string
          canonical_tb_id?: string
          closing_balance?: number
          company_id?: string
          credit?: number
          debit?: number
          id?: string
          line_key?: string
          opening_balance?: number
          period_activity?: number
          sign_rule_applied?: string
          sort_order?: number
          source_ref?: Json
          taxonomy_line_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_canonical_tb_lines_canonical_tb_id_fkey"
            columns: ["canonical_tb_id"]
            isOneToOne: false
            referencedRelation: "efs_canonical_trial_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_canonical_tb_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_canonical_trial_balances: {
        Row: {
          company_id: string
          content_hash: string | null
          created_at: string
          id: string
          line_count: number
          period_end: string
          period_start: string
          prior_as_of: string | null
          provenance: Json
          reporting_period_id: string
          schema_version: string
          sealed_at: string | null
          sealed_by: string | null
          snapshot_version_id: string | null
          source_id: string
          source_kind: string
          status: string
          updated_at: string
          validation_summary: Json
          workspace_id: string
        }
        Insert: {
          company_id: string
          content_hash?: string | null
          created_at?: string
          id?: string
          line_count?: number
          period_end: string
          period_start: string
          prior_as_of?: string | null
          provenance?: Json
          reporting_period_id: string
          schema_version?: string
          sealed_at?: string | null
          sealed_by?: string | null
          snapshot_version_id?: string | null
          source_id: string
          source_kind: string
          status?: string
          updated_at?: string
          validation_summary?: Json
          workspace_id: string
        }
        Update: {
          company_id?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          line_count?: number
          period_end?: string
          period_start?: string
          prior_as_of?: string | null
          provenance?: Json
          reporting_period_id?: string
          schema_version?: string
          sealed_at?: string | null
          sealed_by?: string | null
          snapshot_version_id?: string | null
          source_id?: string
          source_kind?: string
          status?: string
          updated_at?: string
          validation_summary?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_canonical_trial_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_canonical_trial_balances_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_canonical_trial_balances_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_canonical_trial_balances_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "efs_ctb_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_canonical_trial_balances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_chart_mapping_sets: {
        Row: {
          company_id: string
          created_at: string
          framework_pack_id: string
          id: string
          reporting_entity_id: string
          status: string
          version_label: string
        }
        Insert: {
          company_id: string
          created_at?: string
          framework_pack_id: string
          id?: string
          reporting_entity_id: string
          status?: string
          version_label?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          framework_pack_id?: string
          id?: string
          reporting_entity_id?: string
          status?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_chart_mapping_sets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_chart_mapping_sets_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_chart_mapping_sets_reporting_entity_id_fkey"
            columns: ["reporting_entity_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_company_master_data: {
        Row: {
          addresses: Json
          company_id: string
          company_profile: Json
          created_at: string
          directors: Json
          governance: Json
          id: string
          legacy_migration_completed_at: string | null
          officers: Json
          principal_bankers: Json
          tax_registrations: Json
          updated_at: string
        }
        Insert: {
          addresses?: Json
          company_id: string
          company_profile?: Json
          created_at?: string
          directors?: Json
          governance?: Json
          id?: string
          legacy_migration_completed_at?: string | null
          officers?: Json
          principal_bankers?: Json
          tax_registrations?: Json
          updated_at?: string
        }
        Update: {
          addresses?: Json
          company_id?: string
          company_profile?: Json
          created_at?: string
          directors?: Json
          governance?: Json
          id?: string
          legacy_migration_completed_at?: string | null
          officers?: Json
          principal_bankers?: Json
          tax_registrations?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_company_master_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_comparative_bindings: {
        Row: {
          bound_at: string
          bound_by: string | null
          company_id: string
          id: string
          label: string
          prior_snapshot_version_id: string
          snapshot_version_id: string
        }
        Insert: {
          bound_at?: string
          bound_by?: string | null
          company_id: string
          id?: string
          label?: string
          prior_snapshot_version_id: string
          snapshot_version_id: string
        }
        Update: {
          bound_at?: string
          bound_by?: string | null
          company_id?: string
          id?: string
          label?: string
          prior_snapshot_version_id?: string
          snapshot_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_comparative_bindings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_comparative_bindings_prior_snapshot_version_id_fkey"
            columns: ["prior_snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_comparative_bindings_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_cross_references: {
        Row: {
          attachment_point_id: string | null
          bidirectional: boolean
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          source_id: string
          source_kind: string
          status: string
          target_id: string
          target_kind: string
          workspace_id: string
        }
        Insert: {
          attachment_point_id?: string | null
          bidirectional?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          source_id: string
          source_kind: string
          status?: string
          target_id: string
          target_kind: string
          workspace_id: string
        }
        Update: {
          attachment_point_id?: string | null
          bidirectional?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          source_id?: string
          source_kind?: string
          status?: string
          target_id?: string
          target_kind?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_cross_references_attachment_point_id_fkey"
            columns: ["attachment_point_id"]
            isOneToOne: false
            referencedRelation: "efs_attachment_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_cross_references_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_cross_references_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_ctb_sources: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          metadata: Json
          reporting_period_id: string
          snapshot_version_id: string | null
          source_kind: string
          source_system: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          metadata?: Json
          reporting_period_id: string
          snapshot_version_id?: string | null
          source_kind: string
          source_system?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          metadata?: Json
          reporting_period_id?: string
          snapshot_version_id?: string | null
          source_kind?: string
          source_system?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_ctb_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_ctb_sources_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_ctb_sources_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_ctb_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_default_type_maps: {
        Row: {
          account_type: string
          framework_pack_id: string
          id: string
          taxonomy_line_code: string
        }
        Insert: {
          account_type: string
          framework_pack_id: string
          id?: string
          taxonomy_line_code: string
        }
        Update: {
          account_type?: string
          framework_pack_id?: string
          id?: string
          taxonomy_line_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_default_type_maps_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_content_references: {
        Row: {
          company_id: string
          created_at: string
          disclosure_instance_id: string
          disclosure_node_id: string | null
          id: string
          reference_note: string | null
          reference_role: string
          structure_node_id: string | null
          working_paper_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          disclosure_instance_id: string
          disclosure_node_id?: string | null
          id?: string
          reference_note?: string | null
          reference_role?: string
          structure_node_id?: string | null
          working_paper_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          disclosure_instance_id?: string
          disclosure_node_id?: string | null
          id?: string
          reference_note?: string | null
          reference_role?: string
          structure_node_id?: string | null
          working_paper_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_content_references_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_content_references_disclosure_instance_id_fkey"
            columns: ["disclosure_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_content_references_disclosure_node_id_fkey"
            columns: ["disclosure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_content_references_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_content_references_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_instances: {
        Row: {
          accounting_policy_set_id: string | null
          attachment_point_id: string
          company_id: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          disclosure_code: string
          disclosure_kind: string
          disclosure_node_id: string | null
          framework_mapping_id: string | null
          framework_pack_id: string | null
          id: string
          note_number: string | null
          prepared_at: string | null
          prepared_by: string | null
          requirement_level: string
          sort_order: number
          status: string
          structure_node_id: string
          template_id: string | null
          title: string
          updated_at: string
          working_paper_id: string | null
          workspace_id: string
        }
        Insert: {
          accounting_policy_set_id?: string | null
          attachment_point_id: string
          company_id: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          disclosure_code: string
          disclosure_kind?: string
          disclosure_node_id?: string | null
          framework_mapping_id?: string | null
          framework_pack_id?: string | null
          id?: string
          note_number?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          requirement_level?: string
          sort_order?: number
          status?: string
          structure_node_id: string
          template_id?: string | null
          title: string
          updated_at?: string
          working_paper_id?: string | null
          workspace_id: string
        }
        Update: {
          accounting_policy_set_id?: string | null
          attachment_point_id?: string
          company_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          disclosure_code?: string
          disclosure_kind?: string
          disclosure_node_id?: string | null
          framework_mapping_id?: string | null
          framework_pack_id?: string | null
          id?: string
          note_number?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          requirement_level?: string
          sort_order?: number
          status?: string
          structure_node_id?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          working_paper_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_instances_accounting_policy_set_id_fkey"
            columns: ["accounting_policy_set_id"]
            isOneToOne: false
            referencedRelation: "efs_accounting_policy_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_attachment_point_id_fkey"
            columns: ["attachment_point_id"]
            isOneToOne: false
            referencedRelation: "efs_attachment_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_disclosure_node_id_fkey"
            columns: ["disclosure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_framework_mapping_id_fkey"
            columns: ["framework_mapping_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_disclosure_mappings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_nodes: {
        Row: {
          created_at: string
          disclosure_code: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          status: string
        }
        Insert: {
          created_at?: string
          disclosure_code: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          status?: string
        }
        Update: {
          created_at?: string
          disclosure_code?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_paragraphs: {
        Row: {
          body: string
          company_id: string
          disclosure_instance_id: string
          id: string
          paragraph_code: string
          section_id: string | null
          sort_order: number
        }
        Insert: {
          body?: string
          company_id: string
          disclosure_instance_id: string
          id?: string
          paragraph_code: string
          section_id?: string | null
          sort_order?: number
        }
        Update: {
          body?: string
          company_id?: string
          disclosure_instance_id?: string
          id?: string
          paragraph_code?: string
          section_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_paragraphs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_paragraphs_disclosure_instance_id_fkey"
            columns: ["disclosure_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_paragraphs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_placeholders: {
        Row: {
          created_at: string
          description: string
          disclosure_node_id: string
          id: string
          placeholder_code: string
          status: string
        }
        Insert: {
          created_at?: string
          description: string
          disclosure_node_id: string
          id?: string
          placeholder_code: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string
          disclosure_node_id?: string
          id?: string
          placeholder_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_placeholders_disclosure_node_id_fkey"
            columns: ["disclosure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_references: {
        Row: {
          created_at: string
          disclosure_node_id: string
          id: string
          reference_role: string
          structure_node_id: string
        }
        Insert: {
          created_at?: string
          disclosure_node_id: string
          id?: string
          reference_role?: string
          structure_node_id: string
        }
        Update: {
          created_at?: string
          disclosure_node_id?: string
          id?: string
          reference_role?: string
          structure_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_references_disclosure_node_id_fkey"
            columns: ["disclosure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_references_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_sections: {
        Row: {
          body: string
          company_id: string
          disclosure_instance_id: string
          id: string
          section_code: string
          sort_order: number
          title: string
        }
        Insert: {
          body?: string
          company_id: string
          disclosure_instance_id: string
          id?: string
          section_code: string
          sort_order?: number
          title: string
        }
        Update: {
          body?: string
          company_id?: string
          disclosure_instance_id?: string
          id?: string
          section_code?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_sections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_sections_disclosure_instance_id_fkey"
            columns: ["disclosure_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_tables: {
        Row: {
          columns_json: Json
          company_id: string
          disclosure_instance_id: string
          id: string
          rows_json: Json
          section_id: string | null
          snapshot_version_id: string | null
          sort_order: number
          table_code: string
          title: string
        }
        Insert: {
          columns_json?: Json
          company_id: string
          disclosure_instance_id: string
          id?: string
          rows_json?: Json
          section_id?: string | null
          snapshot_version_id?: string | null
          sort_order?: number
          table_code: string
          title: string
        }
        Update: {
          columns_json?: Json
          company_id?: string
          disclosure_instance_id?: string
          id?: string
          rows_json?: Json
          section_id?: string | null
          snapshot_version_id?: string | null
          sort_order?: number
          table_code?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_tables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_tables_disclosure_instance_id_fkey"
            columns: ["disclosure_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_tables_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_disclosure_tables_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_template_sections: {
        Row: {
          id: string
          required_flag: boolean
          section_code: string
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          id?: string
          required_flag?: boolean
          section_code: string
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          id?: string
          required_flag?: boolean
          section_code?: string
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_disclosure_templates: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          disclosure_kind: string
          id: string
          name: string
          status: string
          template_code: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          disclosure_kind?: string
          id?: string
          name: string
          status?: string
          template_code: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          disclosure_kind?: string
          id?: string
          name?: string
          status?: string
          template_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_disclosure_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_engagement_general_information: {
        Row: {
          accounting_officer: string | null
          approval_date: string | null
          approved_by: string | null
          auditor: string | null
          authorisation_date: string | null
          business_address: string | null
          company_id: string
          company_secretary: string | null
          comparative_period: string | null
          compilation_engagement: boolean | null
          contact_information: string | null
          country_of_incorporation: string | null
          created_at: string
          custom_tax_registrations: Json
          directors: Json
          email: string | null
          engagement_type: string | null
          entity_type: string | null
          financial_year_end: string | null
          functional_currency: string | null
          id: string
          income_tax_number: string | null
          independent_reviewer: string | null
          issue_date: string | null
          nature_of_business: string | null
          partner: string | null
          paye_number: string | null
          physical_address: string | null
          postal_address: string | null
          prepared_by: string | null
          principal_bankers: Json
          registered_name: string | null
          registered_office: string | null
          registration_number: string | null
          reporting_currency: string | null
          reporting_framework: string | null
          reviewed_by: string | null
          sdl_number: string | null
          share_information: Json
          telephone: string | null
          trading_name: string | null
          uif_number: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          accounting_officer?: string | null
          approval_date?: string | null
          approved_by?: string | null
          auditor?: string | null
          authorisation_date?: string | null
          business_address?: string | null
          company_id: string
          company_secretary?: string | null
          comparative_period?: string | null
          compilation_engagement?: boolean | null
          contact_information?: string | null
          country_of_incorporation?: string | null
          created_at?: string
          custom_tax_registrations?: Json
          directors?: Json
          email?: string | null
          engagement_type?: string | null
          entity_type?: string | null
          financial_year_end?: string | null
          functional_currency?: string | null
          id?: string
          income_tax_number?: string | null
          independent_reviewer?: string | null
          issue_date?: string | null
          nature_of_business?: string | null
          partner?: string | null
          paye_number?: string | null
          physical_address?: string | null
          postal_address?: string | null
          prepared_by?: string | null
          principal_bankers?: Json
          registered_name?: string | null
          registered_office?: string | null
          registration_number?: string | null
          reporting_currency?: string | null
          reporting_framework?: string | null
          reviewed_by?: string | null
          sdl_number?: string | null
          share_information?: Json
          telephone?: string | null
          trading_name?: string | null
          uif_number?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          accounting_officer?: string | null
          approval_date?: string | null
          approved_by?: string | null
          auditor?: string | null
          authorisation_date?: string | null
          business_address?: string | null
          company_id?: string
          company_secretary?: string | null
          comparative_period?: string | null
          compilation_engagement?: boolean | null
          contact_information?: string | null
          country_of_incorporation?: string | null
          created_at?: string
          custom_tax_registrations?: Json
          directors?: Json
          email?: string | null
          engagement_type?: string | null
          entity_type?: string | null
          financial_year_end?: string | null
          functional_currency?: string | null
          id?: string
          income_tax_number?: string | null
          independent_reviewer?: string | null
          issue_date?: string | null
          nature_of_business?: string | null
          partner?: string | null
          paye_number?: string | null
          physical_address?: string | null
          postal_address?: string | null
          prepared_by?: string | null
          principal_bankers?: Json
          registered_name?: string | null
          registered_office?: string | null
          registration_number?: string | null
          reporting_currency?: string | null
          reporting_framework?: string | null
          reviewed_by?: string | null
          sdl_number?: string | null
          share_information?: Json
          telephone?: string | null
          trading_name?: string | null
          uif_number?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_engagement_general_information_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_engagement_general_information_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_evidence_references: {
        Row: {
          company_id: string
          created_at: string
          evidence_id: string
          id: string
          lead_schedule_id: string | null
          reference_note: string | null
          working_paper_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          evidence_id: string
          id?: string
          lead_schedule_id?: string | null
          reference_note?: string | null
          working_paper_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          evidence_id?: string
          id?: string
          lead_schedule_id?: string | null
          reference_note?: string | null
          working_paper_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_evidence_references_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_evidence_references_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "efs_supporting_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_evidence_references_lead_schedule_id_fkey"
            columns: ["lead_schedule_id"]
            isOneToOne: false
            referencedRelation: "efs_lead_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_evidence_references_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_fact_snapshots: {
        Row: {
          canonical_tb_id: string | null
          company_id: string
          content_hash: string
          created_at: string
          dataset: Json
          id: string
          period_end: string
          period_start: string
          prior_as_of: string | null
          sealed_at: string
          sealed_by: string | null
          snapshot_version_id: string
          source_rpc_refs: Json
        }
        Insert: {
          canonical_tb_id?: string | null
          company_id: string
          content_hash: string
          created_at?: string
          dataset?: Json
          id?: string
          period_end: string
          period_start: string
          prior_as_of?: string | null
          sealed_at?: string
          sealed_by?: string | null
          snapshot_version_id: string
          source_rpc_refs?: Json
        }
        Update: {
          canonical_tb_id?: string | null
          company_id?: string
          content_hash?: string
          created_at?: string
          dataset?: Json
          id?: string
          period_end?: string
          period_start?: string
          prior_as_of?: string | null
          sealed_at?: string
          sealed_by?: string | null
          snapshot_version_id?: string
          source_rpc_refs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "efs_fact_snapshots_canonical_tb_id_fkey"
            columns: ["canonical_tb_id"]
            isOneToOne: false
            referencedRelation: "efs_canonical_trial_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_fact_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_fact_snapshots_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: true
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_framework_bindings: {
        Row: {
          bound_at: string
          bound_by: string | null
          company_id: string
          created_at: string
          framework_pack_id: string
          id: string
          period_from: string | null
          period_to: string | null
          reporting_entity_id: string
          reporting_period_id: string | null
          status: string
        }
        Insert: {
          bound_at?: string
          bound_by?: string | null
          company_id: string
          created_at?: string
          framework_pack_id: string
          id?: string
          period_from?: string | null
          period_to?: string | null
          reporting_entity_id: string
          reporting_period_id?: string | null
          status?: string
        }
        Update: {
          bound_at?: string
          bound_by?: string | null
          company_id?: string
          created_at?: string
          framework_pack_id?: string
          id?: string
          period_from?: string | null
          period_to?: string | null
          reporting_entity_id?: string
          reporting_period_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_framework_bindings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_framework_bindings_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_framework_bindings_reporting_entity_id_fkey"
            columns: ["reporting_entity_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_framework_bindings_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_framework_disclosure_mappings: {
        Row: {
          created_at: string
          disclosure_code: string
          disclosure_node_code: string | null
          framework_pack_id: string
          guidance_ref: string | null
          id: string
          requirement_level: string
          sort_order: number
          structure_node_code: string | null
          template_id: string
        }
        Insert: {
          created_at?: string
          disclosure_code: string
          disclosure_node_code?: string | null
          framework_pack_id: string
          guidance_ref?: string | null
          id?: string
          requirement_level?: string
          sort_order?: number
          structure_node_code?: string | null
          template_id: string
        }
        Update: {
          created_at?: string
          disclosure_code?: string
          disclosure_node_code?: string | null
          framework_pack_id?: string
          guidance_ref?: string | null
          id?: string
          requirement_level?: string
          sort_order?: number
          structure_node_code?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_framework_disclosure_mappings_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_framework_disclosure_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_framework_packs: {
        Row: {
          content_ref: string | null
          created_at: string
          effective_from: string | null
          effective_to: string | null
          framework_key: string
          id: string
          label: string
          status: string
          version_id: string
        }
        Insert: {
          content_ref?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          framework_key: string
          id?: string
          label: string
          status?: string
          version_id: string
        }
        Update: {
          content_ref?: string | null
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          framework_key?: string
          id?: string
          label?: string
          status?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_framework_packs_framework_key_fkey"
            columns: ["framework_key"]
            isOneToOne: false
            referencedRelation: "efs_frameworks"
            referencedColumns: ["framework_key"]
          },
        ]
      }
      efs_framework_validation_mappings: {
        Row: {
          created_at: string
          enabled: boolean
          framework_pack_id: string
          guidance_ref: string | null
          id: string
          rule_id: string
          severity_override: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          framework_pack_id: string
          guidance_ref?: string | null
          id?: string
          rule_id: string
          severity_override?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          framework_pack_id?: string
          guidance_ref?: string | null
          id?: string
          rule_id?: string
          severity_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_framework_validation_mappings_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_framework_validation_mappings_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "efs_validation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_frameworks: {
        Row: {
          created_at: string
          framework_key: string
          jurisdiction_scope: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          framework_key: string
          jurisdiction_scope?: string
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          framework_key?: string
          jurisdiction_scope?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      efs_frp_mapping_queue: {
        Row: {
          company_id: string
          created_at: string
          id: string
          import_id: string
          import_line_id: string
          note: string | null
          resolved_account_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_sign_rule: string | null
          resolved_taxonomy_line_code: string | null
          status: string
          suggested_account_type: string | null
          suggested_taxonomy_line_code: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          import_id: string
          import_line_id: string
          note?: string | null
          resolved_account_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_sign_rule?: string | null
          resolved_taxonomy_line_code?: string | null
          status?: string
          suggested_account_type?: string | null
          suggested_taxonomy_line_code?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          import_id?: string
          import_line_id?: string
          note?: string | null
          resolved_account_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_sign_rule?: string | null
          resolved_taxonomy_line_code?: string | null
          status?: string
          suggested_account_type?: string | null
          suggested_taxonomy_line_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_frp_mapping_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_frp_mapping_queue_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "efs_tb_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_frp_mapping_queue_import_line_id_fkey"
            columns: ["import_line_id"]
            isOneToOne: true
            referencedRelation: "efs_tb_import_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_frp_mapping_rules: {
        Row: {
          active: boolean
          canonical_account_type: string | null
          company_id: string
          created_at: string
          id: string
          mapping_set_id: string
          match_kind: string
          match_value: string
          priority: number
          sign_rule: string
          taxonomy_line_code: string | null
        }
        Insert: {
          active?: boolean
          canonical_account_type?: string | null
          company_id: string
          created_at?: string
          id?: string
          mapping_set_id: string
          match_kind: string
          match_value: string
          priority?: number
          sign_rule?: string
          taxonomy_line_code?: string | null
        }
        Update: {
          active?: boolean
          canonical_account_type?: string | null
          company_id?: string
          created_at?: string
          id?: string
          mapping_set_id?: string
          match_kind?: string
          match_value?: string
          priority?: number
          sign_rule?: string
          taxonomy_line_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_frp_mapping_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_frp_mapping_rules_mapping_set_id_fkey"
            columns: ["mapping_set_id"]
            isOneToOne: false
            referencedRelation: "efs_frp_mapping_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_frp_mapping_sets: {
        Row: {
          company_id: string
          created_at: string
          framework_pack_id: string
          id: string
          label: string
          source_system: string
          status: string
          version_label: string
        }
        Insert: {
          company_id: string
          created_at?: string
          framework_pack_id: string
          id?: string
          label?: string
          source_system?: string
          status?: string
          version_label?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          framework_pack_id?: string
          id?: string
          label?: string
          source_system?: string
          status?: string
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_frp_mapping_sets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_frp_mapping_sets_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_frp_sign_rules: {
        Row: {
          account_type: string
          id: string
          natural_balance: string
          reporting_sign: string
        }
        Insert: {
          account_type: string
          id?: string
          natural_balance: string
          reporting_sign?: string
        }
        Update: {
          account_type?: string
          id?: string
          natural_balance?: string
          reporting_sign?: string
        }
        Relationships: []
      }
      efs_lead_schedule_lines: {
        Row: {
          amount: number
          company_id: string
          description: string
          id: string
          lead_schedule_id: string
          line_no: number
          movement_type: string
          source_ref: string | null
          taxonomy_hint: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          description: string
          id?: string
          lead_schedule_id: string
          line_no: number
          movement_type?: string
          source_ref?: string | null
          taxonomy_hint?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          description?: string
          id?: string
          lead_schedule_id?: string
          line_no?: number
          movement_type?: string
          source_ref?: string | null
          taxonomy_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_lead_schedule_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_lead_schedule_lines_lead_schedule_id_fkey"
            columns: ["lead_schedule_id"]
            isOneToOne: false
            referencedRelation: "efs_lead_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_lead_schedules: {
        Row: {
          attachment_point_id: string
          closing_balance: number
          company_id: string
          content_hash: string | null
          control_account_ref: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          opening_balance: number
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schedule_type: string
          snapshot_version_id: string | null
          status: string
          structure_node_id: string
          title: string
          updated_at: string
          variance_to_gl: number
          workspace_id: string
        }
        Insert: {
          attachment_point_id: string
          closing_balance?: number
          company_id: string
          content_hash?: string | null
          control_account_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          opening_balance?: number
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_type?: string
          snapshot_version_id?: string | null
          status?: string
          structure_node_id: string
          title: string
          updated_at?: string
          variance_to_gl?: number
          workspace_id: string
        }
        Update: {
          attachment_point_id?: string
          closing_balance?: number
          company_id?: string
          content_hash?: string | null
          control_account_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          opening_balance?: number
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schedule_type?: string
          snapshot_version_id?: string | null
          status?: string
          structure_node_id?: string
          title?: string
          updated_at?: string
          variance_to_gl?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_lead_schedules_attachment_point_id_fkey"
            columns: ["attachment_point_id"]
            isOneToOne: false
            referencedRelation: "efs_attachment_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_lead_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_lead_schedules_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_lead_schedules_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_lead_schedules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_mapping_lines: {
        Row: {
          company_id: string
          id: string
          mapping_set_id: string
          source_account_id: string | null
          source_account_type: string | null
          taxonomy_line_code: string
        }
        Insert: {
          company_id: string
          id?: string
          mapping_set_id: string
          source_account_id?: string | null
          source_account_type?: string | null
          taxonomy_line_code: string
        }
        Update: {
          company_id?: string
          id?: string
          mapping_set_id?: string
          source_account_id?: string | null
          source_account_type?: string | null
          taxonomy_line_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_mapping_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_mapping_lines_mapping_set_id_fkey"
            columns: ["mapping_set_id"]
            isOneToOne: false
            referencedRelation: "efs_chart_mapping_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_review_assignments: {
        Row: {
          accepted_at: string | null
          assigned_at: string
          assigned_by: string | null
          company_id: string
          id: string
          pack_review_id: string
          reviewer_user_id: string
          role_code: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          company_id: string
          id?: string
          pack_review_id: string
          reviewer_user_id: string
          role_code: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          company_id?: string
          id?: string
          pack_review_id?: string
          reviewer_user_id?: string
          role_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_review_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_assignments_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_review_decisions: {
        Row: {
          actor_role: string
          actor_user_id: string
          company_id: string
          created_at: string
          decision_code: string
          decision_stage: string
          from_stage: string
          id: string
          pack_review_id: string
          rationale: string | null
          to_stage: string
        }
        Insert: {
          actor_role: string
          actor_user_id: string
          company_id: string
          created_at?: string
          decision_code: string
          decision_stage: string
          from_stage: string
          id?: string
          pack_review_id: string
          rationale?: string | null
          to_stage: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string
          company_id?: string
          created_at?: string
          decision_code?: string
          decision_stage?: string
          from_stage?: string
          id?: string
          pack_review_id?: string
          rationale?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_review_decisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_decisions_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_review_history: {
        Row: {
          actor_user_id: string | null
          company_id: string
          created_at: string
          decision_code: string | null
          event_type: string
          from_stage: string | null
          id: string
          message: string | null
          pack_review_id: string
          payload: Json
          to_stage: string | null
        }
        Insert: {
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          decision_code?: string | null
          event_type: string
          from_stage?: string | null
          id?: string
          message?: string | null
          pack_review_id: string
          payload?: Json
          to_stage?: string | null
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          decision_code?: string | null
          event_type?: string
          from_stage?: string | null
          id?: string
          message?: string | null
          pack_review_id?: string
          payload?: Json
          to_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_review_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_history_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_review_notes: {
        Row: {
          author_user_id: string | null
          body: string
          company_id: string
          created_at: string
          disclosure_instance_id: string | null
          id: string
          pack_review_id: string
          stage_at_create: string
          statement_instance_id: string | null
          status: string
          structure_node_id: string | null
          validation_issue_id: string | null
          working_paper_id: string | null
        }
        Insert: {
          author_user_id?: string | null
          body: string
          company_id: string
          created_at?: string
          disclosure_instance_id?: string | null
          id?: string
          pack_review_id: string
          stage_at_create: string
          statement_instance_id?: string | null
          status?: string
          structure_node_id?: string | null
          validation_issue_id?: string | null
          working_paper_id?: string | null
        }
        Update: {
          author_user_id?: string | null
          body?: string
          company_id?: string
          created_at?: string
          disclosure_instance_id?: string | null
          id?: string
          pack_review_id?: string
          stage_at_create?: string
          statement_instance_id?: string | null
          status?: string
          structure_node_id?: string | null
          validation_issue_id?: string | null
          working_paper_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_review_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_notes_disclosure_instance_id_fkey"
            columns: ["disclosure_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_notes_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_notes_statement_instance_id_fkey"
            columns: ["statement_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_statement_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_notes_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_notes_validation_issue_id_fkey"
            columns: ["validation_issue_id"]
            isOneToOne: false
            referencedRelation: "efs_validation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_notes_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_review_queries: {
        Row: {
          body: string
          closed_at: string | null
          company_id: string
          created_at: string
          disclosure_instance_id: string | null
          id: string
          pack_review_id: string
          priority: string
          raised_by: string
          raised_role: string
          statement_instance_id: string | null
          status: string
          structure_node_id: string | null
          subject: string
          validation_issue_id: string | null
          working_paper_id: string | null
        }
        Insert: {
          body: string
          closed_at?: string | null
          company_id: string
          created_at?: string
          disclosure_instance_id?: string | null
          id?: string
          pack_review_id: string
          priority?: string
          raised_by: string
          raised_role: string
          statement_instance_id?: string | null
          status?: string
          structure_node_id?: string | null
          subject: string
          validation_issue_id?: string | null
          working_paper_id?: string | null
        }
        Update: {
          body?: string
          closed_at?: string | null
          company_id?: string
          created_at?: string
          disclosure_instance_id?: string | null
          id?: string
          pack_review_id?: string
          priority?: string
          raised_by?: string
          raised_role?: string
          statement_instance_id?: string | null
          status?: string
          structure_node_id?: string | null
          subject?: string
          validation_issue_id?: string | null
          working_paper_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_review_queries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_queries_disclosure_instance_id_fkey"
            columns: ["disclosure_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_queries_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_queries_statement_instance_id_fkey"
            columns: ["statement_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_statement_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_queries_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_queries_validation_issue_id_fkey"
            columns: ["validation_issue_id"]
            isOneToOne: false
            referencedRelation: "efs_validation_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_queries_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_review_responses: {
        Row: {
          author_user_id: string
          body: string
          company_id: string
          created_at: string
          id: string
          query_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          company_id: string
          created_at?: string
          id?: string
          query_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          query_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_review_responses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_responses_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_review_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_review_signoffs: {
        Row: {
          company_id: string
          decision_id: string | null
          id: string
          meaning: string
          pack_review_id: string
          signature_hash: string
          signature_payload: Json
          signed_at: string
          signer_role: string
          signer_user_id: string
          stage: string
        }
        Insert: {
          company_id: string
          decision_id?: string | null
          id?: string
          meaning?: string
          pack_review_id: string
          signature_hash: string
          signature_payload?: Json
          signed_at?: string
          signer_role: string
          signer_user_id: string
          stage: string
        }
        Update: {
          company_id?: string
          decision_id?: string | null
          id?: string
          meaning?: string
          pack_review_id?: string
          signature_hash?: string
          signature_payload?: Json
          signed_at?: string
          signer_role?: string
          signer_user_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_review_signoffs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_signoffs_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_review_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_review_signoffs_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_pack_reviews: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          escalated: boolean
          framework_pack_id: string | null
          id: string
          mutates_accounting: boolean
          opened_at: string
          opened_by: string | null
          pack_fingerprint: string | null
          publication_executed: boolean
          return_to_stage: string | null
          snapshot_version_id: string | null
          stage: string
          status: string
          updated_at: string
          validation_run_id: string | null
          workspace_id: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          escalated?: boolean
          framework_pack_id?: string | null
          id?: string
          mutates_accounting?: boolean
          opened_at?: string
          opened_by?: string | null
          pack_fingerprint?: string | null
          publication_executed?: boolean
          return_to_stage?: string | null
          snapshot_version_id?: string | null
          stage?: string
          status?: string
          updated_at?: string
          validation_run_id?: string | null
          workspace_id: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          escalated?: boolean
          framework_pack_id?: string | null
          id?: string
          mutates_accounting?: boolean
          opened_at?: string
          opened_by?: string | null
          pack_fingerprint?: string | null
          publication_executed?: boolean
          return_to_stage?: string | null
          snapshot_version_id?: string | null
          stage?: string
          status?: string
          updated_at?: string
          validation_run_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_pack_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_reviews_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_reviews_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_reviews_validation_run_id_fkey"
            columns: ["validation_run_id"]
            isOneToOne: false
            referencedRelation: "efs_validation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_pack_reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_publication_artifacts: {
        Row: {
          byte_size: number
          company_id: string
          content_base64: string
          content_hash: string
          format: string
          generated_at: string
          id: string
          publication_pack_id: string
          publication_record_id: string
        }
        Insert: {
          byte_size?: number
          company_id: string
          content_base64: string
          content_hash: string
          format: string
          generated_at?: string
          id?: string
          publication_pack_id: string
          publication_record_id: string
        }
        Update: {
          byte_size?: number
          company_id?: string
          content_base64?: string
          content_hash?: string
          format?: string
          generated_at?: string
          id?: string
          publication_pack_id?: string
          publication_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_publication_artifacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_artifacts_publication_pack_id_fkey"
            columns: ["publication_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_publication_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_artifacts_publication_record_id_fkey"
            columns: ["publication_record_id"]
            isOneToOne: false
            referencedRelation: "efs_publication_records"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_publication_history: {
        Row: {
          actor_user_id: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          message: string
          payload: Json
          publication_pack_id: string | null
          publication_record_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          message: string
          payload?: Json
          publication_pack_id?: string | null
          publication_record_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          payload?: Json
          publication_pack_id?: string | null
          publication_record_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_publication_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_history_publication_pack_id_fkey"
            columns: ["publication_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_publication_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_history_publication_record_id_fkey"
            columns: ["publication_record_id"]
            isOneToOne: false
            referencedRelation: "efs_publication_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_publication_packs: {
        Row: {
          archived_at: string | null
          company_id: string
          content_hash: string
          created_at: string
          dataset: Json
          id: string
          metadata: Json
          mutates_accounting: boolean
          pack_fingerprint: string
          pack_review_id: string
          publication_fingerprint: string
          publication_seal_hash: string
          sealed_at: string
          sealed_by: string | null
          snapshot_version_id: string
          status: string
          validation_run_id: string | null
          version_no: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          content_hash: string
          created_at?: string
          dataset: Json
          id?: string
          metadata?: Json
          mutates_accounting?: boolean
          pack_fingerprint: string
          pack_review_id: string
          publication_fingerprint: string
          publication_seal_hash: string
          sealed_at?: string
          sealed_by?: string | null
          snapshot_version_id: string
          status?: string
          validation_run_id?: string | null
          version_no?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          content_hash?: string
          created_at?: string
          dataset?: Json
          id?: string
          metadata?: Json
          mutates_accounting?: boolean
          pack_fingerprint?: string
          pack_review_id?: string
          publication_fingerprint?: string
          publication_seal_hash?: string
          sealed_at?: string
          sealed_by?: string | null
          snapshot_version_id?: string
          status?: string
          validation_run_id?: string | null
          version_no?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_publication_packs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_packs_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_packs_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_packs_validation_run_id_fkey"
            columns: ["validation_run_id"]
            isOneToOne: false
            referencedRelation: "efs_validation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_packs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_publication_records: {
        Row: {
          archive_status: string
          archived_at: string | null
          company_id: string
          created_at: string
          executed_at: string
          executed_by: string | null
          id: string
          mutates_accounting: boolean
          pack_review_id: string
          publication_fingerprint: string
          publication_pack_id: string
          status: string
          workspace_id: string
        }
        Insert: {
          archive_status?: string
          archived_at?: string | null
          company_id: string
          created_at?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          mutates_accounting?: boolean
          pack_review_id: string
          publication_fingerprint: string
          publication_pack_id: string
          status?: string
          workspace_id: string
        }
        Update: {
          archive_status?: string
          archived_at?: string | null
          company_id?: string
          created_at?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          mutates_accounting?: boolean
          pack_review_id?: string
          publication_fingerprint?: string
          publication_pack_id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_publication_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_records_pack_review_id_fkey"
            columns: ["pack_review_id"]
            isOneToOne: false
            referencedRelation: "efs_pack_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_records_publication_pack_id_fkey"
            columns: ["publication_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_publication_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_publication_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_reporting_entities: {
        Row: {
          company_id: string
          created_at: string
          entity_type: string
          id: string
          is_default: boolean
          name: string
          parent_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_type?: string
          id?: string
          is_default?: boolean
          name: string
          parent_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_type?: string
          id?: string
          is_default?: boolean
          name?: string
          parent_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_reporting_entities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_reporting_periods: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          label: string
          opened_at: string | null
          opened_by: string | null
          period_key: string
          reporting_entity_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          label: string
          opened_at?: string | null
          opened_by?: string | null
          period_key: string
          reporting_entity_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          label?: string
          opened_at?: string | null
          opened_by?: string | null
          period_key?: string
          reporting_entity_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_reporting_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_periods_reporting_entity_id_fkey"
            columns: ["reporting_entity_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_reporting_snapshots: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          current_version_id: string | null
          id: string
          lineage_key: string
          reporting_entity_id: string
          reporting_period_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          lineage_key: string
          reporting_entity_id: string
          reporting_period_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          lineage_key?: string
          reporting_entity_id?: string
          reporting_period_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_reporting_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_snapshots_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_snapshots_reporting_entity_id_fkey"
            columns: ["reporting_entity_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_snapshots_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_reporting_workspaces: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          framework_binding_id: string | null
          id: string
          name: string
          opened_by: string | null
          progress_pct: number
          reporting_entity_id: string
          reporting_period_id: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          framework_binding_id?: string | null
          id?: string
          name: string
          opened_by?: string | null
          progress_pct?: number
          reporting_entity_id: string
          reporting_period_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          framework_binding_id?: string | null
          id?: string
          name?: string
          opened_by?: string | null
          progress_pct?: number
          reporting_entity_id?: string
          reporting_period_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_reporting_workspaces_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_workspaces_framework_binding_id_fkey"
            columns: ["framework_binding_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_workspaces_reporting_entity_id_fkey"
            columns: ["reporting_entity_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reporting_workspaces_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_review_history: {
        Row: {
          actor_user_id: string | null
          company_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          lead_schedule_id: string | null
          message: string | null
          payload: Json
          tick_code: string | null
          to_status: string | null
          working_paper_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          lead_schedule_id?: string | null
          message?: string | null
          payload?: Json
          tick_code?: string | null
          to_status?: string | null
          working_paper_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          lead_schedule_id?: string | null
          message?: string | null
          payload?: Json
          tick_code?: string | null
          to_status?: string | null
          working_paper_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_review_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_review_history_lead_schedule_id_fkey"
            columns: ["lead_schedule_id"]
            isOneToOne: false
            referencedRelation: "efs_lead_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_review_history_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_review_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_review_notes: {
        Row: {
          author_user_id: string | null
          body: string
          cleared_at: string | null
          cleared_by: string | null
          company_id: string
          created_at: string
          id: string
          lead_schedule_id: string | null
          status: string
          structure_node_id: string | null
          tick_code: string | null
          working_paper_id: string | null
          workspace_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          cleared_at?: string | null
          cleared_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          lead_schedule_id?: string | null
          status?: string
          structure_node_id?: string | null
          tick_code?: string | null
          working_paper_id?: string | null
          workspace_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          cleared_at?: string | null
          cleared_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lead_schedule_id?: string | null
          status?: string
          structure_node_id?: string | null
          tick_code?: string | null
          working_paper_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_review_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_review_notes_lead_schedule_id_fkey"
            columns: ["lead_schedule_id"]
            isOneToOne: false
            referencedRelation: "efs_lead_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_review_notes_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_review_notes_tick_code_fkey"
            columns: ["tick_code"]
            isOneToOne: false
            referencedRelation: "efs_tick_mark_catalogue"
            referencedColumns: ["tick_code"]
          },
          {
            foreignKeyName: "efs_review_notes_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_review_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_reviewer_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignee_user_id: string
          company_id: string
          id: string
          lead_schedule_id: string | null
          role_label: string
          status: string
          working_paper_id: string | null
          workspace_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id: string
          company_id: string
          id?: string
          lead_schedule_id?: string | null
          role_label?: string
          status?: string
          working_paper_id?: string | null
          workspace_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_user_id?: string
          company_id?: string
          id?: string
          lead_schedule_id?: string | null
          role_label?: string
          status?: string
          working_paper_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_reviewer_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reviewer_assignments_lead_schedule_id_fkey"
            columns: ["lead_schedule_id"]
            isOneToOne: false
            referencedRelation: "efs_lead_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reviewer_assignments_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_reviewer_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_snapshot_versions: {
        Row: {
          certified_at: string | null
          certified_by: string | null
          company_id: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          extract_summary: Json
          frozen_at: string | null
          frozen_by: string | null
          id: string
          predecessor_id: string | null
          snapshot_id: string
          source_rpc_refs: Json
          status: string
          supersession_rationale: string | null
          version_no: number
        }
        Insert: {
          certified_at?: string | null
          certified_by?: string | null
          company_id: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          extract_summary?: Json
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          predecessor_id?: string | null
          snapshot_id: string
          source_rpc_refs?: Json
          status?: string
          supersession_rationale?: string | null
          version_no: number
        }
        Update: {
          certified_at?: string | null
          certified_by?: string | null
          company_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          extract_summary?: Json
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          predecessor_id?: string | null
          snapshot_id?: string
          source_rpc_refs?: Json
          status?: string
          supersession_rationale?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "efs_snapshot_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_snapshot_versions_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_snapshot_versions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_statement_definitions: {
        Row: {
          framework_pack_id: string
          id: string
          required_flag: boolean
          sort_order: number
          statement_type: string
          title: string
        }
        Insert: {
          framework_pack_id: string
          id?: string
          required_flag?: boolean
          sort_order?: number
          statement_type: string
          title: string
        }
        Update: {
          framework_pack_id?: string
          id?: string
          required_flag?: boolean
          sort_order?: number
          statement_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_statement_definitions_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_statement_instances: {
        Row: {
          company_id: string
          content_hash: string
          fact_snapshot_id: string
          framework_pack_id: string
          generated_at: string
          generated_by: string | null
          id: string
          lines: Json
          provenance: Json
          snapshot_version_id: string
          statement_type: string
          title: string
          workspace_id: string
        }
        Insert: {
          company_id: string
          content_hash: string
          fact_snapshot_id: string
          framework_pack_id: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          lines?: Json
          provenance?: Json
          snapshot_version_id: string
          statement_type: string
          title: string
          workspace_id: string
        }
        Update: {
          company_id?: string
          content_hash?: string
          fact_snapshot_id?: string
          framework_pack_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          lines?: Json
          provenance?: Json
          snapshot_version_id?: string
          statement_type?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_statement_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_statement_instances_fact_snapshot_id_fkey"
            columns: ["fact_snapshot_id"]
            isOneToOne: false
            referencedRelation: "efs_fact_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_statement_instances_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_statement_instances_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_statement_instances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_structure_line_items: {
        Row: {
          amount_basis: string
          id: string
          is_total: boolean
          line_item_code: string
          name: string
          section_id: string | null
          sort_order: number
          status: string
          subsection_id: string | null
          taxonomy_line_code: string | null
        }
        Insert: {
          amount_basis?: string
          id?: string
          is_total?: boolean
          line_item_code: string
          name: string
          section_id?: string | null
          sort_order?: number
          status?: string
          subsection_id?: string | null
          taxonomy_line_code?: string | null
        }
        Update: {
          amount_basis?: string
          id?: string
          is_total?: boolean
          line_item_code?: string
          name?: string
          section_id?: string | null
          sort_order?: number
          status?: string
          subsection_id?: string | null
          taxonomy_line_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_structure_line_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_structure_line_items_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_structure_node_labels: {
        Row: {
          framework_pack_id: string
          id: string
          label: string
          structure_node_id: string
        }
        Insert: {
          framework_pack_id: string
          id?: string
          label: string
          structure_node_id: string
        }
        Update: {
          framework_pack_id?: string
          id?: string
          label?: string
          structure_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_structure_node_labels_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_structure_node_labels_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_structure_nodes: {
        Row: {
          created_at: string
          depth: number
          id: string
          line_item_id: string | null
          node_code: string
          node_kind: string
          parent_id: string | null
          path: string
          section_id: string | null
          sort_order: number
          statement_id: string | null
          status: string
          subsection_id: string | null
        }
        Insert: {
          created_at?: string
          depth?: number
          id?: string
          line_item_id?: string | null
          node_code: string
          node_kind: string
          parent_id?: string | null
          path: string
          section_id?: string | null
          sort_order?: number
          statement_id?: string | null
          status?: string
          subsection_id?: string | null
        }
        Update: {
          created_at?: string
          depth?: number
          id?: string
          line_item_id?: string | null
          node_code?: string
          node_kind?: string
          parent_id?: string | null
          path?: string
          section_id?: string | null
          sort_order?: number
          statement_id?: string | null
          status?: string
          subsection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_structure_nodes_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_structure_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_structure_nodes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_structure_nodes_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_structure_nodes_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_structure_sections: {
        Row: {
          id: string
          name: string
          section_code: string
          sort_order: number
          statement_id: string
          status: string
        }
        Insert: {
          id?: string
          name: string
          section_code: string
          sort_order?: number
          statement_id: string
          status?: string
        }
        Update: {
          id?: string
          name?: string
          section_code?: string
          sort_order?: number
          statement_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_structure_sections_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_structure_statements: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          statement_code: string
          statement_type: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          statement_code: string
          statement_type: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          statement_code?: string
          statement_type?: string
          status?: string
        }
        Relationships: []
      }
      efs_structure_subsections: {
        Row: {
          id: string
          name: string
          section_id: string
          sort_order: number
          status: string
          subsection_code: string
        }
        Insert: {
          id?: string
          name: string
          section_id: string
          sort_order?: number
          status?: string
          subsection_code: string
        }
        Update: {
          id?: string
          name?: string
          section_id?: string
          sort_order?: number
          status?: string
          subsection_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_structure_subsections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_supporting_evidence: {
        Row: {
          attachment_point_id: string
          company_id: string
          content_hash: string | null
          created_at: string
          disclosure_node_id: string | null
          evidence_type: string
          id: string
          prepared_by: string | null
          storage_ref: string | null
          structure_node_id: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          attachment_point_id: string
          company_id: string
          content_hash?: string | null
          created_at?: string
          disclosure_node_id?: string | null
          evidence_type?: string
          id?: string
          prepared_by?: string | null
          storage_ref?: string | null
          structure_node_id?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          attachment_point_id?: string
          company_id?: string
          content_hash?: string | null
          created_at?: string
          disclosure_node_id?: string | null
          evidence_type?: string
          id?: string
          prepared_by?: string | null
          storage_ref?: string | null
          structure_node_id?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_supporting_evidence_attachment_point_id_fkey"
            columns: ["attachment_point_id"]
            isOneToOne: false
            referencedRelation: "efs_attachment_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_supporting_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_supporting_evidence_disclosure_node_id_fkey"
            columns: ["disclosure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_supporting_evidence_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_supporting_evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_taxonomy_lines: {
        Row: {
          amount_basis: string
          framework_pack_id: string
          id: string
          is_total: boolean
          label: string
          line_code: string
          section: string
          sort_order: number
          statement_type: string
        }
        Insert: {
          amount_basis?: string
          framework_pack_id: string
          id?: string
          is_total?: boolean
          label: string
          line_code: string
          section: string
          sort_order?: number
          statement_type: string
        }
        Update: {
          amount_basis?: string
          framework_pack_id?: string
          id?: string
          is_total?: boolean
          label?: string
          line_code?: string
          section?: string
          sort_order?: number
          statement_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_taxonomy_lines_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_tb_import_lines: {
        Row: {
          balance: number | null
          canonical_account_type: string | null
          company_id: string
          created_at: string
          credit: number
          debit: number
          id: string
          import_id: string
          mapping_status: string
          opening_balance: number | null
          period_activity: number | null
          raw_row: Json
          row_number: number
          sign_rule_applied: string | null
          source_account_code: string | null
          source_account_name: string
          source_account_type: string | null
          taxonomy_line_code: string | null
        }
        Insert: {
          balance?: number | null
          canonical_account_type?: string | null
          company_id: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          import_id: string
          mapping_status?: string
          opening_balance?: number | null
          period_activity?: number | null
          raw_row?: Json
          row_number?: number
          sign_rule_applied?: string | null
          source_account_code?: string | null
          source_account_name: string
          source_account_type?: string | null
          taxonomy_line_code?: string | null
        }
        Update: {
          balance?: number | null
          canonical_account_type?: string | null
          company_id?: string
          created_at?: string
          credit?: number
          debit?: number
          id?: string
          import_id?: string
          mapping_status?: string
          opening_balance?: number | null
          period_activity?: number | null
          raw_row?: Json
          row_number?: number
          sign_rule_applied?: string | null
          source_account_code?: string | null
          source_account_name?: string
          source_account_type?: string | null
          taxonomy_line_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_tb_import_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_tb_import_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "efs_tb_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_tb_imports: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          file_name: string | null
          format: string
          id: string
          parse_summary: Json
          period_end: string | null
          period_start: string | null
          raw_text: string | null
          source_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          format?: string
          id?: string
          parse_summary?: Json
          period_end?: string | null
          period_start?: string | null
          raw_text?: string | null
          source_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          format?: string
          id?: string
          parse_summary?: Json
          period_end?: string | null
          period_start?: string | null
          raw_text?: string | null
          source_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_tb_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_tb_imports_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "efs_ctb_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_tick_mark_catalogue: {
        Row: {
          description: string | null
          label: string
          tick_code: string
        }
        Insert: {
          description?: string | null
          label: string
          tick_code: string
        }
        Update: {
          description?: string | null
          label?: string
          tick_code?: string
        }
        Relationships: []
      }
      efs_validation_issues: {
        Row: {
          attachment_point_id: string | null
          company_id: string
          created_at: string
          disclosure_instance_id: string | null
          id: string
          issue_code: string
          message: string
          payload: Json
          recommendation: string | null
          resolution_note: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          rule_code: string
          rule_id: string | null
          severity: string
          statement_instance_id: string | null
          structure_node_id: string | null
          title: string
          validation_run_id: string
          working_paper_id: string | null
        }
        Insert: {
          attachment_point_id?: string | null
          company_id: string
          created_at?: string
          disclosure_instance_id?: string | null
          id?: string
          issue_code: string
          message: string
          payload?: Json
          recommendation?: string | null
          resolution_note?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code: string
          rule_id?: string | null
          severity: string
          statement_instance_id?: string | null
          structure_node_id?: string | null
          title: string
          validation_run_id: string
          working_paper_id?: string | null
        }
        Update: {
          attachment_point_id?: string | null
          company_id?: string
          created_at?: string
          disclosure_instance_id?: string | null
          id?: string
          issue_code?: string
          message?: string
          payload?: Json
          recommendation?: string | null
          resolution_note?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          rule_code?: string
          rule_id?: string | null
          severity?: string
          statement_instance_id?: string | null
          structure_node_id?: string | null
          title?: string
          validation_run_id?: string
          working_paper_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "efs_validation_issues_attachment_point_id_fkey"
            columns: ["attachment_point_id"]
            isOneToOne: false
            referencedRelation: "efs_attachment_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_issues_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_issues_disclosure_instance_id_fkey"
            columns: ["disclosure_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_disclosure_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_issues_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "efs_validation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_issues_statement_instance_id_fkey"
            columns: ["statement_instance_id"]
            isOneToOne: false
            referencedRelation: "efs_statement_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_issues_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_issues_validation_run_id_fkey"
            columns: ["validation_run_id"]
            isOneToOne: false
            referencedRelation: "efs_validation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_issues_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_validation_rules: {
        Row: {
          category: string
          created_at: string
          default_severity: string
          description: string | null
          engine_scope: string
          id: string
          name: string
          recommendation_template: string | null
          rule_code: string
          status: string
        }
        Insert: {
          category: string
          created_at?: string
          default_severity?: string
          description?: string | null
          engine_scope: string
          id?: string
          name: string
          recommendation_template?: string | null
          rule_code: string
          status?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_severity?: string
          description?: string | null
          engine_scope?: string
          id?: string
          name?: string
          recommendation_template?: string | null
          rule_code?: string
          status?: string
        }
        Relationships: []
      }
      efs_validation_runs: {
        Row: {
          advisory_count: number
          blocking_count: number
          company_id: string
          completed_at: string | null
          created_at: string
          engine_version: string
          framework_pack_id: string | null
          id: string
          live_gl_read: boolean
          mutates_financial_data: boolean
          ready_for_review: boolean
          run_type: string
          significant_count: number
          snapshot_version_id: string | null
          started_at: string
          started_by: string | null
          status: string
          summary: Json
          total_issues: number
          workspace_id: string
        }
        Insert: {
          advisory_count?: number
          blocking_count?: number
          company_id: string
          completed_at?: string | null
          created_at?: string
          engine_version?: string
          framework_pack_id?: string | null
          id?: string
          live_gl_read?: boolean
          mutates_financial_data?: boolean
          ready_for_review?: boolean
          run_type?: string
          significant_count?: number
          snapshot_version_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          summary?: Json
          total_issues?: number
          workspace_id: string
        }
        Update: {
          advisory_count?: number
          blocking_count?: number
          company_id?: string
          completed_at?: string | null
          created_at?: string
          engine_version?: string
          framework_pack_id?: string | null
          id?: string
          live_gl_read?: boolean
          mutates_financial_data?: boolean
          ready_for_review?: boolean
          run_type?: string
          significant_count?: number
          snapshot_version_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          summary?: Json
          total_issues?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_validation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_runs_framework_pack_id_fkey"
            columns: ["framework_pack_id"]
            isOneToOne: false
            referencedRelation: "efs_framework_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_runs_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_validation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_working_paper_sections: {
        Row: {
          body: string
          company_id: string
          id: string
          section_code: string
          sort_order: number
          title: string
          working_paper_id: string
        }
        Insert: {
          body?: string
          company_id: string
          id?: string
          section_code: string
          sort_order?: number
          title: string
          working_paper_id: string
        }
        Update: {
          body?: string
          company_id?: string
          id?: string
          section_code?: string
          sort_order?: number
          title?: string
          working_paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_working_paper_sections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_working_paper_sections_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_working_paper_versions: {
        Row: {
          author_user_id: string | null
          company_id: string
          content_hash: string
          content_snapshot: Json
          created_at: string
          id: string
          status: string
          version_no: number
          working_paper_id: string
        }
        Insert: {
          author_user_id?: string | null
          company_id: string
          content_hash: string
          content_snapshot?: Json
          created_at?: string
          id?: string
          status: string
          version_no: number
          working_paper_id: string
        }
        Update: {
          author_user_id?: string | null
          company_id?: string
          content_hash?: string
          content_snapshot?: Json
          created_at?: string
          id?: string
          status?: string
          version_no?: number
          working_paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_working_paper_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_working_paper_versions_working_paper_id_fkey"
            columns: ["working_paper_id"]
            isOneToOne: false
            referencedRelation: "efs_working_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_working_papers: {
        Row: {
          assertion: string | null
          attachment_point_id: string
          company_id: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          current_version_no: number
          id: string
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot_version_id: string | null
          status: string
          structure_node_id: string
          template_id: string | null
          title: string
          updated_at: string
          workspace_id: string
          wp_type: string
        }
        Insert: {
          assertion?: string | null
          attachment_point_id: string
          company_id: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          current_version_no?: number
          id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_version_id?: string | null
          status?: string
          structure_node_id: string
          template_id?: string | null
          title: string
          updated_at?: string
          workspace_id: string
          wp_type?: string
        }
        Update: {
          assertion?: string | null
          attachment_point_id?: string
          company_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          current_version_no?: number
          id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot_version_id?: string | null
          status?: string
          structure_node_id?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
          wp_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_working_papers_attachment_point_id_fkey"
            columns: ["attachment_point_id"]
            isOneToOne: false
            referencedRelation: "efs_attachment_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_working_papers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_working_papers_snapshot_version_id_fkey"
            columns: ["snapshot_version_id"]
            isOneToOne: false
            referencedRelation: "efs_snapshot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_working_papers_structure_node_id_fkey"
            columns: ["structure_node_id"]
            isOneToOne: false
            referencedRelation: "efs_structure_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_working_papers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "efs_wp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_working_papers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_workspace_activity: {
        Row: {
          actor_user_id: string | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          message: string
          payload: Json
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          message: string
          payload?: Json
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          message?: string
          payload?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_workspace_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efs_workspace_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "efs_reporting_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_wp_template_sections: {
        Row: {
          id: string
          required_flag: boolean
          section_code: string
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          id?: string
          required_flag?: boolean
          section_code: string
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          id?: string
          required_flag?: boolean
          section_code?: string
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_wp_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "efs_wp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      efs_wp_templates: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          template_code: string
          wp_type: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          template_code: string
          wp_type?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          template_code?: string
          wp_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "efs_wp_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll_rule_settings: {
        Row: {
          company_id: string
          config: Json
          employee_id: string
          enabled: boolean
          id: string
          rule_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config?: Json
          employee_id: string
          enabled?: boolean
          id?: string
          rule_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config?: Json
          employee_id?: string
          enabled?: boolean
          id?: string
          rule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_rule_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_rule_settings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_rule_settings_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "payroll_rule_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_timeline_events: {
        Row: {
          changed_by: string | null
          command_id: string | null
          company_id: string
          correlation_id: string | null
          created_at: string
          employee_id: string
          employee_number: string
          event_data: Json
          event_label: string
          event_type: string
          id: string
        }
        Insert: {
          changed_by?: string | null
          command_id?: string | null
          company_id: string
          correlation_id?: string | null
          created_at?: string
          employee_id: string
          employee_number: string
          event_data?: Json
          event_label: string
          event_type: string
          id?: string
        }
        Update: {
          changed_by?: string | null
          command_id?: string | null
          company_id?: string
          correlation_id?: string | null
          created_at?: string
          employee_id?: string
          employee_number?: string
          event_data?: Json
          event_label?: string
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_timeline_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_timeline_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          bank_account_number: string | null
          bank_branch_code: string | null
          bank_name: string | null
          branch: string | null
          company_id: string
          created_at: string | null
          department: string | null
          email: string | null
          employee_number: string
          employment_status: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          end_date: string | null
          first_name: string
          id: string
          id_number: string | null
          last_name: string
          manager_id: string | null
          phone: string | null
          position: string | null
          salary_amount: number | null
          salary_period: Database["public"]["Enums"]["employment_period"] | null
          start_date: string
          tax_number: string | null
        }
        Insert: {
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          branch?: string | null
          company_id: string
          created_at?: string | null
          department?: string | null
          email?: string | null
          employee_number: string
          employment_status?: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          first_name: string
          id?: string
          id_number?: string | null
          last_name: string
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          salary_amount?: number | null
          salary_period?:
            | Database["public"]["Enums"]["employment_period"]
            | null
          start_date: string
          tax_number?: string | null
        }
        Update: {
          bank_account_number?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          branch?: string | null
          company_id?: string
          created_at?: string | null
          department?: string | null
          email?: string | null
          employee_number?: string
          employment_status?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          end_date?: string | null
          first_name?: string
          id?: string
          id_number?: string | null
          last_name?: string
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          salary_amount?: number | null
          salary_period?:
            | Database["public"]["Enums"]["employment_period"]
            | null
          start_date?: string
          tax_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_allocations: {
        Row: {
          allocation_type: string
          company_id: string
          created_at: string
          effort_hours: number | null
          effort_percent: number | null
          employee_id: string | null
          ewm_project_id: string
          id: string
          role_name: string | null
          status: string
          task_id: string | null
          updated_at: string
          window_end: string
          window_start: string
          work_resource_id: string | null
        }
        Insert: {
          allocation_type?: string
          company_id: string
          created_at?: string
          effort_hours?: number | null
          effort_percent?: number | null
          employee_id?: string | null
          ewm_project_id: string
          id?: string
          role_name?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          window_end: string
          window_start: string
          work_resource_id?: string | null
        }
        Update: {
          allocation_type?: string
          company_id?: string
          created_at?: string
          effort_hours?: number | null
          effort_percent?: number | null
          employee_id?: string | null
          ewm_project_id?: string
          id?: string
          role_name?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          window_end?: string
          window_start?: string
          work_resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_allocations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_allocations_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_allocations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ewm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_allocations_work_resource_id_fkey"
            columns: ["work_resource_id"]
            isOneToOne: false
            referencedRelation: "ewm_work_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_analytics_facts: {
        Row: {
          company_id: string
          grain: string
          grain_key: string
          id: string
          measures: Json
          period_start: string
          updated_at: string
        }
        Insert: {
          company_id: string
          grain: string
          grain_key: string
          id?: string
          measures?: Json
          period_start: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          grain?: string
          grain_key?: string
          id?: string
          measures?: Json
          period_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_analytics_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_budget_alerts: {
        Row: {
          acknowledged: boolean
          alert_type: string
          company_id: string
          created_at: string
          ewm_project_id: string
          id: string
          message: string
          severity: string
        }
        Insert: {
          acknowledged?: boolean
          alert_type: string
          company_id: string
          created_at?: string
          ewm_project_id: string
          id?: string
          message: string
          severity?: string
        }
        Update: {
          acknowledged?: boolean
          alert_type?: string
          company_id?: string
          created_at?: string
          ewm_project_id?: string
          id?: string
          message?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_budget_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_budget_alerts_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_capacity_snapshots: {
        Row: {
          actual_hours: number
          available_hours: number
          booked_hours: number
          company_id: string
          created_at: string
          employee_id: string | null
          id: string
          period_end: string
          period_start: string
          utilisation_pct: number
          work_resource_id: string | null
        }
        Insert: {
          actual_hours?: number
          available_hours?: number
          booked_hours?: number
          company_id: string
          created_at?: string
          employee_id?: string | null
          id?: string
          period_end: string
          period_start: string
          utilisation_pct?: number
          work_resource_id?: string | null
        }
        Update: {
          actual_hours?: number
          available_hours?: number
          booked_hours?: number
          company_id?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          period_end?: string
          period_start?: string
          utilisation_pct?: number
          work_resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_capacity_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_capacity_snapshots_work_resource_id_fkey"
            columns: ["work_resource_id"]
            isOneToOne: false
            referencedRelation: "ewm_work_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_clock_events: {
        Row: {
          company_id: string
          created_at: string
          event_at: string
          event_type: string
          id: string
          location_lat: number | null
          location_lng: number | null
          offline_captured: boolean
          photo_ref: string | null
          qr_ref: string | null
          session_id: string
          synced_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_at?: string
          event_type: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          offline_captured?: boolean
          photo_ref?: string | null
          qr_ref?: string | null
          session_id: string
          synced_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_at?: string
          event_type?: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          offline_captured?: boolean
          photo_ref?: string | null
          qr_ref?: string | null
          session_id?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_clock_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_clock_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ewm_clock_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_clock_sessions: {
        Row: {
          break_minutes: number
          clocked_in_at: string
          clocked_out_at: string | null
          company_id: string
          created_at: string
          employee_id: string | null
          ewm_project_id: string | null
          id: string
          location_lat: number | null
          location_lng: number | null
          photo_ref: string | null
          qr_ref: string | null
          status: string
          task_id: string | null
          time_entry_id: string | null
          updated_at: string
          work_resource_id: string | null
        }
        Insert: {
          break_minutes?: number
          clocked_in_at?: string
          clocked_out_at?: string | null
          company_id: string
          created_at?: string
          employee_id?: string | null
          ewm_project_id?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          photo_ref?: string | null
          qr_ref?: string | null
          status?: string
          task_id?: string | null
          time_entry_id?: string | null
          updated_at?: string
          work_resource_id?: string | null
        }
        Update: {
          break_minutes?: number
          clocked_in_at?: string
          clocked_out_at?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string | null
          ewm_project_id?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          photo_ref?: string | null
          qr_ref?: string | null
          status?: string
          task_id?: string | null
          time_entry_id?: string | null
          updated_at?: string
          work_resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_clock_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_clock_sessions_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_clock_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ewm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_clock_sessions_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "ewm_time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_clock_sessions_work_resource_id_fkey"
            columns: ["work_resource_id"]
            isOneToOne: false
            referencedRelation: "ewm_work_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_cost_facts: {
        Row: {
          amount: number
          company_id: string
          consumption_id: string | null
          cost_category: string
          created_at: string
          currency: string | null
          ewm_project_id: string
          fact_date: string
          id: string
          is_locked: boolean
          source: string
          time_entry_id: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          consumption_id?: string | null
          cost_category?: string
          created_at?: string
          currency?: string | null
          ewm_project_id: string
          fact_date: string
          id?: string
          is_locked?: boolean
          source?: string
          time_entry_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          consumption_id?: string | null
          cost_category?: string
          created_at?: string
          currency?: string | null
          ewm_project_id?: string
          fact_date?: string
          id?: string
          is_locked?: boolean
          source?: string
          time_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_cost_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_cost_facts_consumption_id_fkey"
            columns: ["consumption_id"]
            isOneToOne: false
            referencedRelation: "ewm_resource_consumptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_cost_facts_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_cost_facts_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "ewm_time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_cost_rollups: {
        Row: {
          amount: number
          company_id: string
          cost_category: string
          ewm_project_id: string
          id: string
          period_month: string
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id: string
          cost_category: string
          ewm_project_id: string
          id?: string
          period_month: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          cost_category?: string
          ewm_project_id?: string
          id?: string
          period_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_cost_rollups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_cost_rollups_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_milestones: {
        Row: {
          company_id: string
          created_at: string
          due_date: string | null
          ewm_project_id: string
          id: string
          legacy_milestone_id: string | null
          name: string
          phase_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          due_date?: string | null
          ewm_project_id: string
          id?: string
          legacy_milestone_id?: string | null
          name: string
          phase_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          due_date?: string | null
          ewm_project_id?: string
          id?: string
          legacy_milestone_id?: string | null
          name?: string
          phase_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_milestones_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_milestones_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "ewm_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_payroll_input_facts: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          entry_date: string
          ewm_project_id: string | null
          exclusion_reason: string | null
          hours: number
          id: string
          is_overtime: boolean
          payroll_period_id: string | null
          status: string
          time_entry_id: string
          wage_input: boolean
          work_resource_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          entry_date: string
          ewm_project_id?: string | null
          exclusion_reason?: string | null
          hours: number
          id?: string
          is_overtime?: boolean
          payroll_period_id?: string | null
          status?: string
          time_entry_id: string
          wage_input?: boolean
          work_resource_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          entry_date?: string
          ewm_project_id?: string | null
          exclusion_reason?: string | null
          hours?: number
          id?: string
          is_overtime?: boolean
          payroll_period_id?: string | null
          status?: string
          time_entry_id?: string
          wage_input?: boolean
          work_resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_payroll_input_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_payroll_input_facts_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_payroll_input_facts_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: true
            referencedRelation: "ewm_time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_payroll_input_facts_work_resource_id_fkey"
            columns: ["work_resource_id"]
            isOneToOne: false
            referencedRelation: "ewm_work_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_phases: {
        Row: {
          company_id: string
          created_at: string
          end_date: string | null
          ewm_project_id: string
          id: string
          name: string
          sequence_no: number
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_date?: string | null
          ewm_project_id: string
          id?: string
          name: string
          sequence_no?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_date?: string | null
          ewm_project_id?: string
          id?: string
          name?: string
          sequence_no?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_phases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_phases_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_portfolios: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          owner_user_id: string | null
          status: string
          strategic_theme: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          owner_user_id?: string | null
          status?: string
          strategic_theme?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string | null
          status?: string
          strategic_theme?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_portfolios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_portfolios_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "ewm_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_project_budgets: {
        Row: {
          alert_threshold_pct: number
          budget_amount: number
          company_id: string
          cost_category: string
          created_at: string
          ewm_project_id: string
          id: string
          updated_at: string
        }
        Insert: {
          alert_threshold_pct?: number
          budget_amount?: number
          company_id: string
          cost_category?: string
          created_at?: string
          ewm_project_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          alert_threshold_pct?: number
          budget_amount?: number
          company_id?: string
          cost_category?: string
          created_at?: string
          ewm_project_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_project_budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_project_budgets_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_projects: {
        Row: {
          award_date: string | null
          client_id: string | null
          company_id: string
          contract_value: number | null
          created_at: string
          currency: string | null
          expected_completion: string | null
          id: string
          name: string
          operational_budget: number | null
          overall_progress: number | null
          portfolio_id: string | null
          project_id: string | null
          project_manager_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          award_date?: string | null
          client_id?: string | null
          company_id: string
          contract_value?: number | null
          created_at?: string
          currency?: string | null
          expected_completion?: string | null
          id?: string
          name: string
          operational_budget?: number | null
          overall_progress?: number | null
          portfolio_id?: string | null
          project_id?: string | null
          project_manager_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          award_date?: string | null
          client_id?: string | null
          company_id?: string
          contract_value?: number | null
          created_at?: string
          currency?: string | null
          expected_completion?: string | null
          id?: string
          name?: string
          operational_budget?: number | null
          overall_progress?: number | null
          portfolio_id?: string | null
          project_id?: string | null
          project_manager_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_projects_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "ewm_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_rate_cards: {
        Row: {
          billable_rate: number
          company_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string | null
          ewm_project_id: string | null
          id: string
          name: string
          operational_cost_rate: number
          role_name: string | null
        }
        Insert: {
          billable_rate?: number
          company_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string | null
          ewm_project_id?: string | null
          id?: string
          name: string
          operational_cost_rate?: number
          role_name?: string | null
        }
        Update: {
          billable_rate?: number
          company_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string | null
          ewm_project_id?: string | null
          id?: string
          name?: string
          operational_cost_rate?: number
          role_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_rate_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_rate_cards_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_resource_consumptions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          company_id: string
          consumption_date: string
          cost_category: string
          created_at: string
          ewm_project_id: string
          external_ref: string | null
          id: string
          notes: string | null
          quantity: number
          status: string
          unit_cost: number
          updated_at: string
          work_resource_id: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          consumption_date: string
          cost_category: string
          created_at?: string
          ewm_project_id: string
          external_ref?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          status?: string
          unit_cost?: number
          updated_at?: string
          work_resource_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          consumption_date?: string
          cost_category?: string
          created_at?: string
          ewm_project_id?: string
          external_ref?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          status?: string
          unit_cost?: number
          updated_at?: string
          work_resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_resource_consumptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_resource_consumptions_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_resource_consumptions_work_resource_id_fkey"
            columns: ["work_resource_id"]
            isOneToOne: false
            referencedRelation: "ewm_work_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_resource_types: {
        Row: {
          approval_workflow: string
          billing_behaviour: string
          cost_behaviour: string
          id: string
          integration_target: string
          label: string
          payroll_eligible: boolean
          sort_order: number
        }
        Insert: {
          approval_workflow: string
          billing_behaviour: string
          cost_behaviour: string
          id: string
          integration_target: string
          label: string
          payroll_eligible?: boolean
          sort_order?: number
        }
        Update: {
          approval_workflow?: string
          billing_behaviour?: string
          cost_behaviour?: string
          id?: string
          integration_target?: string
          label?: string
          payroll_eligible?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      ewm_tasks: {
        Row: {
          assignee_employee_id: string | null
          billable: boolean
          company_id: string
          created_at: string
          description: string | null
          estimate_hours: number | null
          ewm_project_id: string
          id: string
          milestone_id: string | null
          name: string
          parent_task_id: string | null
          phase_id: string | null
          priority: string
          remaining_hours: number | null
          status: string
          updated_at: string
        }
        Insert: {
          assignee_employee_id?: string | null
          billable?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          estimate_hours?: number | null
          ewm_project_id: string
          id?: string
          milestone_id?: string | null
          name: string
          parent_task_id?: string | null
          phase_id?: string | null
          priority?: string
          remaining_hours?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_employee_id?: string | null
          billable?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          estimate_hours?: number | null
          ewm_project_id?: string
          id?: string
          milestone_id?: string | null
          name?: string
          parent_task_id?: string | null
          phase_id?: string | null
          priority?: string
          remaining_hours?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_tasks_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "ewm_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "ewm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "ewm_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_time_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          billable_rate: number | null
          billable_value: number | null
          break_minutes: number
          capture_channel: string
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string | null
          entry_date: string
          ewm_project_id: string
          financial_period_id: string | null
          finish_at: string | null
          hours: number
          id: string
          is_internal: boolean
          is_overtime: boolean
          labour_cost: number | null
          location_lat: number | null
          location_lng: number | null
          locked_at: string | null
          notes: string | null
          operational_rate: number | null
          payroll_cost_ref: string | null
          payroll_period_id: string | null
          photo_ref: string | null
          portfolio_id: string | null
          qr_ref: string | null
          start_at: string | null
          status: string
          task_id: string | null
          timesheet_id: string | null
          updated_at: string
          work_resource_id: string | null
          workspace_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          billable_rate?: number | null
          billable_value?: number | null
          break_minutes?: number
          capture_channel?: string
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          entry_date: string
          ewm_project_id: string
          financial_period_id?: string | null
          finish_at?: string | null
          hours?: number
          id?: string
          is_internal?: boolean
          is_overtime?: boolean
          labour_cost?: number | null
          location_lat?: number | null
          location_lng?: number | null
          locked_at?: string | null
          notes?: string | null
          operational_rate?: number | null
          payroll_cost_ref?: string | null
          payroll_period_id?: string | null
          photo_ref?: string | null
          portfolio_id?: string | null
          qr_ref?: string | null
          start_at?: string | null
          status?: string
          task_id?: string | null
          timesheet_id?: string | null
          updated_at?: string
          work_resource_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          billable_rate?: number | null
          billable_value?: number | null
          break_minutes?: number
          capture_channel?: string
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          entry_date?: string
          ewm_project_id?: string
          financial_period_id?: string | null
          finish_at?: string | null
          hours?: number
          id?: string
          is_internal?: boolean
          is_overtime?: boolean
          labour_cost?: number | null
          location_lat?: number | null
          location_lng?: number | null
          locked_at?: string | null
          notes?: string | null
          operational_rate?: number | null
          payroll_cost_ref?: string | null
          payroll_period_id?: string | null
          photo_ref?: string | null
          portfolio_id?: string | null
          qr_ref?: string | null
          start_at?: string | null
          status?: string
          task_id?: string | null
          timesheet_id?: string | null
          updated_at?: string
          work_resource_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_time_entries_ewm_project_id_fkey"
            columns: ["ewm_project_id"]
            isOneToOne: false
            referencedRelation: "ewm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ewm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_time_entries_work_resource_id_fkey"
            columns: ["work_resource_id"]
            isOneToOne: false
            referencedRelation: "ewm_work_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_time_entry_corrections: {
        Row: {
          company_id: string
          compensating_entry_id: string
          created_at: string
          created_by: string | null
          id: string
          original_entry_id: string
          reason: string
        }
        Insert: {
          company_id: string
          compensating_entry_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          original_entry_id: string
          reason: string
        }
        Update: {
          company_id?: string
          compensating_entry_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          original_entry_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_time_entry_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_time_entry_corrections_compensating_entry_id_fkey"
            columns: ["compensating_entry_id"]
            isOneToOne: false
            referencedRelation: "ewm_time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_time_entry_corrections_original_entry_id_fkey"
            columns: ["original_entry_id"]
            isOneToOne: false
            referencedRelation: "ewm_time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_work_resources: {
        Row: {
          asset_id: string | null
          company_id: string
          created_at: string
          default_billable_rate: number | null
          default_cost_rate: number | null
          employee_id: string | null
          id: string
          metadata: Json
          name: string
          product_id: string | null
          resource_type_id: string
          status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          asset_id?: string | null
          company_id: string
          created_at?: string
          default_billable_rate?: number | null
          default_cost_rate?: number | null
          employee_id?: string | null
          id?: string
          metadata?: Json
          name: string
          product_id?: string | null
          resource_type_id: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          asset_id?: string | null
          company_id?: string
          created_at?: string
          default_billable_rate?: number | null
          default_cost_rate?: number | null
          employee_id?: string | null
          id?: string
          metadata?: Json
          name?: string
          product_id?: string | null
          resource_type_id?: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ewm_work_resources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ewm_work_resources_resource_type_id_fkey"
            columns: ["resource_type_id"]
            isOneToOne: false
            referencedRelation: "ewm_resource_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ewm_workspaces: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          name: string
          status: string
          updated_at: string
          workspace_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          workspace_type?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          workspace_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ewm_workspaces_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_claim_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          expense_account_id: string
          expense_claim_id: string
          expense_date: string
          id: string
          project_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          description: string
          expense_account_id: string
          expense_claim_id: string
          expense_date: string
          id?: string
          project_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          expense_account_id?: string
          expense_claim_id?: string
          expense_date?: string
          id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_claim_items_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claim_items_expense_claim_id_fkey"
            columns: ["expense_claim_id"]
            isOneToOne: false
            referencedRelation: "expense_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claim_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_claims: {
        Row: {
          attachment_url: string | null
          claim_number: string
          company_id: string
          created_at: string | null
          description: string | null
          employee_id: string
          id: string
          journal_entry_id: string | null
          status: string
          submission_date: string
          total_amount: number
        }
        Insert: {
          attachment_url?: string | null
          claim_number: string
          company_id: string
          created_at?: string | null
          description?: string | null
          employee_id: string
          id?: string
          journal_entry_id?: string | null
          status?: string
          submission_date?: string
          total_amount?: number
        }
        Update: {
          attachment_url?: string | null
          claim_number?: string
          company_id?: string
          created_at?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          journal_entry_id?: string | null
          status?: string
          submission_date?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_claims_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_journal_entry_id: string | null
          company_id: string
          created_at: string
          end_date: string
          id: string
          opening_journal_entry_id: string | null
          previous_financial_year_id: string | null
          reopened_at: string | null
          reopened_by: string | null
          retained_earnings_account_id: string | null
          start_date: string
          status: string
          updated_at: string
          year_code: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_journal_entry_id?: string | null
          company_id: string
          created_at?: string
          end_date: string
          id?: string
          opening_journal_entry_id?: string | null
          previous_financial_year_id?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          retained_earnings_account_id?: string | null
          start_date: string
          status?: string
          updated_at?: string
          year_code: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_journal_entry_id?: string | null
          company_id?: string
          created_at?: string
          end_date?: string
          id?: string
          opening_journal_entry_id?: string | null
          previous_financial_year_id?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          retained_earnings_account_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          year_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_closing_journal_entry_id_fkey"
            columns: ["closing_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_years_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_years_opening_journal_entry_id_fkey"
            columns: ["opening_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_years_previous_financial_year_id_fkey"
            columns: ["previous_financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_years_retained_earnings_account_id_fkey"
            columns: ["retained_earnings_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          accumulated_depreciation: number | null
          accumulated_depreciation_account_id: string | null
          asset_account_id: string
          asset_code: string
          asset_tag: string | null
          assigned_to_employee_id: string | null
          barcode: string | null
          category_id: string | null
          company_id: string
          created_at: string | null
          custodian_name: string | null
          department: string | null
          depreciation_expense_account_id: string | null
          depreciation_method: string | null
          depreciation_ytd: number
          depreciation_ytd_year: number | null
          description: string
          disposal_account_id: string | null
          health_risk: string | null
          health_score: number | null
          id: string
          impairment_account_id: string | null
          impairment_amount: number
          is_component: boolean
          last_depreciation_date: string | null
          last_revaluation_date: string | null
          last_verified_at: string | null
          lifecycle_stage: string
          location: string | null
          next_verification_due: string | null
          parent_asset_id: string | null
          purchase_cost: number
          purchase_date: string
          qr_code: string | null
          residual_value: number | null
          revaluation_amount: number
          revaluation_reserve_account_id: string | null
          serial_number: string | null
          status: string
          updated_at: string
          useful_life_years: number | null
          vendor_id: string | null
          verification_status: string
          verified_by_name: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          accumulated_depreciation?: number | null
          accumulated_depreciation_account_id?: string | null
          asset_account_id: string
          asset_code: string
          asset_tag?: string | null
          assigned_to_employee_id?: string | null
          barcode?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string | null
          custodian_name?: string | null
          department?: string | null
          depreciation_expense_account_id?: string | null
          depreciation_method?: string | null
          depreciation_ytd?: number
          depreciation_ytd_year?: number | null
          description: string
          disposal_account_id?: string | null
          health_risk?: string | null
          health_score?: number | null
          id?: string
          impairment_account_id?: string | null
          impairment_amount?: number
          is_component?: boolean
          last_depreciation_date?: string | null
          last_revaluation_date?: string | null
          last_verified_at?: string | null
          lifecycle_stage?: string
          location?: string | null
          next_verification_due?: string | null
          parent_asset_id?: string | null
          purchase_cost: number
          purchase_date: string
          qr_code?: string | null
          residual_value?: number | null
          revaluation_amount?: number
          revaluation_reserve_account_id?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          useful_life_years?: number | null
          vendor_id?: string | null
          verification_status?: string
          verified_by_name?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          accumulated_depreciation?: number | null
          accumulated_depreciation_account_id?: string | null
          asset_account_id?: string
          asset_code?: string
          asset_tag?: string | null
          assigned_to_employee_id?: string | null
          barcode?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string | null
          custodian_name?: string | null
          department?: string | null
          depreciation_expense_account_id?: string | null
          depreciation_method?: string | null
          depreciation_ytd?: number
          depreciation_ytd_year?: number | null
          description?: string
          disposal_account_id?: string | null
          health_risk?: string | null
          health_score?: number | null
          id?: string
          impairment_account_id?: string | null
          impairment_amount?: number
          is_component?: boolean
          last_depreciation_date?: string | null
          last_revaluation_date?: string | null
          last_verified_at?: string | null
          lifecycle_stage?: string
          location?: string | null
          next_verification_due?: string | null
          parent_asset_id?: string | null
          purchase_cost?: number
          purchase_date?: string
          qr_code?: string | null
          residual_value?: number | null
          revaluation_amount?: number
          revaluation_reserve_account_id?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          useful_life_years?: number | null
          vendor_id?: string | null
          verification_status?: string
          verified_by_name?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_accumulated_depreciation_account_id_fkey"
            columns: ["accumulated_depreciation_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_asset_account_id_fkey"
            columns: ["asset_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_assigned_to_employee_id_fkey"
            columns: ["assigned_to_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_depreciation_expense_account_id_fkey"
            columns: ["depreciation_expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_disposal_account_id_fkey"
            columns: ["disposal_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_impairment_account_id_fkey"
            columns: ["impairment_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_revaluation_reserve_account_id_fkey"
            columns: ["revaluation_reserve_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_balances: {
        Row: {
          avg_unit_cost: number
          company_id: string
          id: string
          location_id: string | null
          product_id: string
          qty_on_hand: number
          qty_reserved: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          avg_unit_cost?: number
          company_id: string
          id?: string
          location_id?: string | null
          product_id: string
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          avg_unit_cost?: number
          company_id?: string
          id?: string
          location_id?: string | null
          product_id?: string
          qty_on_hand?: number
          qty_reserved?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_cost_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          product_id: string
          qty: number
          reason: string | null
          unit_cost_from: number | null
          unit_cost_to: number | null
          warehouse_id: string | null
        }
        Insert: {
          adjustment_type: string
          amount?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          product_id: string
          qty?: number
          reason?: string | null
          unit_cost_from?: number | null
          unit_cost_to?: number | null
          warehouse_id?: string | null
        }
        Update: {
          adjustment_type?: string
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          product_id?: string
          qty?: number
          reason?: string | null
          unit_cost_from?: number | null
          unit_cost_to?: number | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_cost_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cost_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cost_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_cost_layers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          lot_code: string | null
          product_id: string
          qty_remaining: number
          received_at: string
          source_doc_id: string | null
          source_doc_type: string | null
          status: string
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          lot_code?: string | null
          product_id: string
          qty_remaining?: number
          received_at?: string
          source_doc_id?: string | null
          source_doc_type?: string | null
          status?: string
          unit_cost?: number
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          lot_code?: string | null
          product_id?: string
          qty_remaining?: number
          received_at?: string
          source_doc_id?: string | null
          source_doc_type?: string | null
          status?: string
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_cost_layers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cost_layers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cost_layers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_cycle_count_lines: {
        Row: {
          company_id: string
          count_id: string
          counted_qty: number | null
          id: string
          product_id: string
          system_qty: number
          unit_cost: number
        }
        Insert: {
          company_id: string
          count_id: string
          counted_qty?: number | null
          id?: string
          product_id: string
          system_qty?: number
          unit_cost?: number
        }
        Update: {
          company_id?: string
          count_id?: string
          counted_qty?: number | null
          id?: string
          product_id?: string
          system_qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inv_cycle_count_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cycle_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inv_cycle_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cycle_count_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_cycle_counts: {
        Row: {
          company_id: string
          count_date: string
          count_number: string
          count_type: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          location_id: string | null
          notes: string | null
          posted_at: string | null
          status: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          count_date?: string
          count_number: string
          count_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          location_id?: string | null
          notes?: string | null
          posted_at?: string | null
          status?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          count_date?: string
          count_number?: string
          count_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          location_id?: string | null
          notes?: string | null
          posted_at?: string | null
          status?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_cycle_counts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cycle_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cycle_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_goods_receipt_lines: {
        Row: {
          company_id: string
          id: string
          location_id: string | null
          notes: string | null
          po_line_id: string | null
          product_id: string
          qty_ordered: number
          qty_received: number
          receipt_id: string
          unit_cost: number
        }
        Insert: {
          company_id: string
          id?: string
          location_id?: string | null
          notes?: string | null
          po_line_id?: string | null
          product_id: string
          qty_ordered?: number
          qty_received?: number
          receipt_id: string
          unit_cost?: number
        }
        Update: {
          company_id?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          po_line_id?: string | null
          product_id?: string
          qty_ordered?: number
          qty_received?: number
          receipt_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inv_goods_receipt_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_goods_receipt_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_goods_receipt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_goods_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "inv_goods_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_goods_receipts: {
        Row: {
          acquisition_id: string | null
          bill_id: string | null
          capitalise_to_asset: boolean
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          purchase_order_id: string | null
          receipt_date: string
          receipt_number: string
          status: string
          updated_at: string
          vendor_id: string | null
          warehouse_id: string
        }
        Insert: {
          acquisition_id?: string | null
          bill_id?: string | null
          capitalise_to_asset?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          receipt_date?: string
          receipt_number: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
          warehouse_id: string
        }
        Update: {
          acquisition_id?: string | null
          bill_id?: string | null
          capitalise_to_asset?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          receipt_date?: string
          receipt_number?: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_goods_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_goods_receipts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_goods_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_locations: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          location_type: string
          name: string
          status: string
          warehouse_id: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          location_type?: string
          name: string
          status?: string
          warehouse_id: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          location_type?: string
          name?: string
          status?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_reservations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notes: string | null
          product_id: string
          qty: number
          reference_id: string | null
          reference_type: string | null
          released_at: string | null
          status: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          qty: number
          reference_id?: string | null
          reference_type?: string | null
          released_at?: string | null
          status?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          qty?: number
          reference_id?: string | null
          reference_type?: string | null
          released_at?: string | null
          status?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_reservations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_transfers: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          from_location_id: string | null
          from_warehouse_id: string
          id: string
          notes: string | null
          product_id: string
          qty: number
          status: string
          to_location_id: string | null
          to_warehouse_id: string
          transfer_date: string
          transfer_number: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          from_location_id?: string | null
          from_warehouse_id: string
          id?: string
          notes?: string | null
          product_id: string
          qty: number
          status?: string
          to_location_id?: string | null
          to_warehouse_id: string
          transfer_date?: string
          transfer_number: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          from_location_id?: string | null
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          qty?: number
          status?: string
          to_location_id?: string | null
          to_warehouse_id?: string
          transfer_date?: string
          transfer_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_uom: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          is_base: boolean
          name: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_base?: boolean
          name: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_base?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_uom_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_warehouses: {
        Row: {
          address: string | null
          code: string
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          company_id: string
          cost_method: string | null
          created_at: string | null
          description: string | null
          id: string
          journal_entry_id: string | null
          location_id: string | null
          product_id: string
          quantity_change: number
          reference_id: string | null
          reference_number: string | null
          source_doc_id: string | null
          source_doc_type: string | null
          total_cost: number | null
          transaction_date: string
          transaction_type: string
          unit_cost: number | null
          warehouse_id: string | null
        }
        Insert: {
          company_id: string
          cost_method?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          journal_entry_id?: string | null
          location_id?: string | null
          product_id: string
          quantity_change: number
          reference_id?: string | null
          reference_number?: string | null
          source_doc_id?: string | null
          source_doc_type?: string | null
          total_cost?: number | null
          transaction_date?: string
          transaction_type: string
          unit_cost?: number | null
          warehouse_id?: string | null
        }
        Update: {
          company_id?: string
          cost_method?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          journal_entry_id?: string | null
          location_id?: string | null
          product_id?: string
          quantity_change?: number
          reference_id?: string | null
          reference_number?: string | null
          source_doc_id?: string | null
          source_doc_type?: string | null
          total_cost?: number | null
          transaction_date?: string
          transaction_type?: string
          unit_cost?: number | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_id: string
          created_at: string | null
          customer_id: string
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          journal_entry_id: string | null
          notes: string | null
          quote_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
        }
        Insert: {
          company_id: string
          created_at?: string | null
          customer_id: string
          due_date: string
          id?: string
          invoice_date?: string
          invoice_number: string
          journal_entry_id?: string | null
          notes?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Update: {
          company_id?: string
          created_at?: string | null
          customer_id?: string
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          journal_entry_id?: string | null
          notes?: string | null
          quote_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: true
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          accounting_period_id: string | null
          attachment_url: string | null
          bill_id: string | null
          company_id: string
          created_at: string | null
          customer_id: string | null
          description: string | null
          entry_date: string
          financial_year_id: string | null
          id: string
          invoice_id: string | null
          journal_number: string | null
          vendor_id: string | null
        }
        Insert: {
          accounting_period_id?: string | null
          attachment_url?: string | null
          bill_id?: string | null
          company_id: string
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          entry_date: string
          financial_year_id?: string | null
          id?: string
          invoice_id?: string | null
          journal_number?: string | null
          vendor_id?: string | null
        }
        Update: {
          accounting_period_id?: string | null
          attachment_url?: string | null
          bill_id?: string | null
          company_id?: string
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          entry_date?: string
          financial_year_id?: string | null
          id?: string
          invoice_id?: string | null
          journal_number?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_accounting_period_id_fkey"
            columns: ["accounting_period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_item_tax_rates: {
        Row: {
          journal_entry_item_id: string
          tax_rate_id: string
        }
        Insert: {
          journal_entry_item_id: string
          tax_rate_id: string
        }
        Update: {
          journal_entry_item_id?: string
          tax_rate_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_item_tax_rates_journal_entry_item_id_fkey"
            columns: ["journal_entry_item_id"]
            isOneToOne: false
            referencedRelation: "journal_entry_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_item_tax_rates_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_items: {
        Row: {
          account_id: string
          amount: number
          created_at: string | null
          dimensions: Json
          id: string
          journal_entry_id: string
          project_id: string | null
          reconciled: boolean
          reconciled_at: string | null
          type: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string | null
          dimensions?: Json
          id?: string
          journal_entry_id: string
          project_id?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          type: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string | null
          dimensions?: Json
          id?: string
          journal_entry_id?: string
          project_id?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_items_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_amortization_schedule: {
        Row: {
          created_at: string | null
          id: string
          interest: number
          journal_entry_id: string | null
          loan_id: string
          payment_amount: number
          payment_date: string
          payment_number: number
          principal: number
          remaining_balance: number
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          interest: number
          journal_entry_id?: string | null
          loan_id: string
          payment_amount: number
          payment_date: string
          payment_number: number
          principal: number
          remaining_balance: number
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          interest?: number
          journal_entry_id?: string | null
          loan_id?: string
          payment_amount?: number
          payment_date?: string
          payment_number?: number
          principal?: number
          remaining_balance?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_amortization_schedule_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_amortization_schedule_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          interest_rate: number
          lender_id: string | null
          liability_account_id: string | null
          loan_agreement_url: string | null
          principal_amount: number
          repayment_frequency: string
          start_date: string
          status: string
          term_months: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          interest_rate: number
          lender_id?: string | null
          liability_account_id?: string | null
          loan_agreement_url?: string | null
          principal_amount: number
          repayment_frequency: string
          start_date: string
          status?: string
          term_months: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          interest_rate?: number
          lender_id?: string | null
          liability_account_id?: string | null
          loan_agreement_url?: string | null
          principal_amount?: number
          repayment_frequency?: string
          start_date?: string
          status?: string
          term_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "loans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_liability_account_id_fkey"
            columns: ["liability_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          is_read: boolean
          link_to: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          link_to?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_audit_events: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          event_data: Json
          event_type: string
          id: string
          payroll_run_id: string | null
          payslip_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          event_data?: Json
          event_type: string
          id?: string
          payroll_run_id?: string | null
          payslip_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          event_data?: Json
          event_type?: string
          id?: string
          payroll_run_id?: string | null
          payslip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_audit_events_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_audit_events_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payslips"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rule_catalog: {
        Row: {
          accounting_impact: string
          calculation_order: number
          category: string
          company_configurable: boolean
          created_at: string
          description: string | null
          effective_from: string
          effective_to: string | null
          employee_configurable: boolean
          employee_contribution: boolean
          employer_contribution: boolean
          enabled_by_default: boolean
          id: string
          name: string
          payslip_label: string
          taxable_impact: string
          version: string
        }
        Insert: {
          accounting_impact?: string
          calculation_order: number
          category: string
          company_configurable?: boolean
          created_at?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_configurable?: boolean
          employee_contribution?: boolean
          employer_contribution?: boolean
          enabled_by_default?: boolean
          id: string
          name: string
          payslip_label: string
          taxable_impact?: string
          version?: string
        }
        Update: {
          accounting_impact?: string
          calculation_order?: number
          category?: string
          company_configurable?: boolean
          created_at?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_configurable?: boolean
          employee_contribution?: boolean
          employer_contribution?: boolean
          enabled_by_default?: boolean
          id?: string
          name?: string
          payslip_label?: string
          taxable_impact?: string
          version?: string
        }
        Relationships: []
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string | null
          id: string
          journal_entry_id: string | null
          output_metadata: Json
          pay_date: string
          pay_period_end: string
          pay_period_start: string
          processed_at: string | null
          processed_by: string | null
          rule_config: Json
          status: Database["public"]["Enums"]["payroll_run_status"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          journal_entry_id?: string | null
          output_metadata?: Json
          pay_date: string
          pay_period_end: string
          pay_period_start: string
          processed_at?: string | null
          processed_by?: string | null
          rule_config?: Json
          status?: Database["public"]["Enums"]["payroll_run_status"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          journal_entry_id?: string | null
          output_metadata?: Json
          pay_date?: string
          pay_period_end?: string
          pay_period_start?: string
          processed_at?: string | null
          processed_by?: string | null
          rule_config?: Json
          status?: Database["public"]["Enums"]["payroll_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_tax_year_config: {
        Row: {
          brackets: Json
          country_code: string
          created_at: string
          effective_from: string
          effective_to: string
          id: string
          is_active: boolean
          medical_credits: Json
          rebates: Json
          sdl_rate: number | null
          tax_year_label: string
          uif_ceiling_monthly: number | null
          uif_rate: number | null
        }
        Insert: {
          brackets: Json
          country_code?: string
          created_at?: string
          effective_from: string
          effective_to: string
          id?: string
          is_active?: boolean
          medical_credits?: Json
          rebates?: Json
          sdl_rate?: number | null
          tax_year_label: string
          uif_ceiling_monthly?: number | null
          uif_rate?: number | null
        }
        Update: {
          brackets?: Json
          country_code?: string
          created_at?: string
          effective_from?: string
          effective_to?: string
          id?: string
          is_active?: boolean
          medical_credits?: Json
          rebates?: Json
          sdl_rate?: number | null
          tax_year_label?: string
          uif_ceiling_monthly?: number | null
          uif_rate?: number | null
        }
        Relationships: []
      }
      payslip_items: {
        Row: {
          amount: number
          description: string
          id: string
          payslip_id: string
          type: Database["public"]["Enums"]["payslip_item_type"]
        }
        Insert: {
          amount: number
          description: string
          id?: string
          payslip_id: string
          type: Database["public"]["Enums"]["payslip_item_type"]
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          payslip_id?: string
          type?: Database["public"]["Enums"]["payslip_item_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payslip_items_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payslips"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          basic_salary: number
          calculation_snapshot: Json | null
          company_id: string
          created_at: string | null
          email_sent_at: string | null
          employee_id: string
          id: string
          net_pay: number
          payment_status: string
          payroll_run_id: string
          status: Database["public"]["Enums"]["payslip_status"]
          total_deductions: number
          total_earnings: number
        }
        Insert: {
          basic_salary: number
          calculation_snapshot?: Json | null
          company_id: string
          created_at?: string | null
          email_sent_at?: string | null
          employee_id: string
          id?: string
          net_pay: number
          payment_status?: string
          payroll_run_id: string
          status?: Database["public"]["Enums"]["payslip_status"]
          total_deductions: number
          total_earnings: number
        }
        Update: {
          basic_salary?: number
          calculation_snapshot?: Json | null
          company_id?: string
          created_at?: string | null
          email_sent_at?: string | null
          employee_id?: string
          id?: string
          net_pay?: number
          payment_status?: string
          payroll_run_id?: string
          status?: Database["public"]["Enums"]["payslip_status"]
          total_deductions?: number
          total_earnings?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_journal_number_settings: {
        Row: {
          company_id: string
          next_number: number
          prefix: string
          updated_at: string
        }
        Insert: {
          company_id: string
          next_number?: number
          prefix?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          next_number?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posting_journal_number_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_requests: {
        Row: {
          accounting_period_id: string | null
          committed_at: string | null
          company_id: string
          correlation_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          document_id: string | null
          document_type: string | null
          exchange_rate: number
          financial_year_id: string | null
          id: string
          idempotency_key: string
          journal_entry_id: string | null
          journal_number: string | null
          module: string
          posting_engine_version: string
          reference: string | null
          reversal_of_id: string | null
          source: string | null
          status: string
          warnings: Json
        }
        Insert: {
          accounting_period_id?: string | null
          committed_at?: string | null
          company_id: string
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          document_id?: string | null
          document_type?: string | null
          exchange_rate?: number
          financial_year_id?: string | null
          id?: string
          idempotency_key: string
          journal_entry_id?: string | null
          journal_number?: string | null
          module: string
          posting_engine_version?: string
          reference?: string | null
          reversal_of_id?: string | null
          source?: string | null
          status?: string
          warnings?: Json
        }
        Update: {
          accounting_period_id?: string | null
          committed_at?: string | null
          company_id?: string
          correlation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          document_id?: string | null
          document_type?: string | null
          exchange_rate?: number
          financial_year_id?: string | null
          id?: string
          idempotency_key?: string
          journal_entry_id?: string | null
          journal_number?: string | null
          module?: string
          posting_engine_version?: string
          reference?: string | null
          reversal_of_id?: string | null
          source?: string | null
          status?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "posting_requests_accounting_period_id_fkey"
            columns: ["accounting_period_id"]
            isOneToOne: false
            referencedRelation: "accounting_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_requests_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_requests_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_requests_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "posting_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_name: string | null
          cogs_account_id: string | null
          company_id: string
          cost: number | null
          cost_method: string
          created_at: string | null
          default_warehouse_id: string | null
          description: string | null
          id: string
          income_account_id: string | null
          inventory_asset_account_id: string | null
          item_class: string
          linked_asset_id: string | null
          name: string
          price: number | null
          quantity_on_hand: number
          reorder_level: number
          sku: string | null
          standard_cost: number | null
          stock_status: string
          supplier_id: string | null
          tax_rate_id: string | null
          type: string
          uom: string
          updated_at: string
          variance_account_id: string | null
        }
        Insert: {
          barcode?: string | null
          category_name?: string | null
          cogs_account_id?: string | null
          company_id: string
          cost?: number | null
          cost_method?: string
          created_at?: string | null
          default_warehouse_id?: string | null
          description?: string | null
          id?: string
          income_account_id?: string | null
          inventory_asset_account_id?: string | null
          item_class?: string
          linked_asset_id?: string | null
          name: string
          price?: number | null
          quantity_on_hand?: number
          reorder_level?: number
          sku?: string | null
          standard_cost?: number | null
          stock_status?: string
          supplier_id?: string | null
          tax_rate_id?: string | null
          type: string
          uom?: string
          updated_at?: string
          variance_account_id?: string | null
        }
        Update: {
          barcode?: string | null
          category_name?: string | null
          cogs_account_id?: string | null
          company_id?: string
          cost?: number | null
          cost_method?: string
          created_at?: string | null
          default_warehouse_id?: string | null
          description?: string | null
          id?: string
          income_account_id?: string | null
          inventory_asset_account_id?: string | null
          item_class?: string
          linked_asset_id?: string | null
          name?: string
          price?: number | null
          quantity_on_hand?: number
          reorder_level?: number
          sku?: string | null
          standard_cost?: number | null
          stock_status?: string
          supplier_id?: string | null
          tax_rate_id?: string | null
          type?: string
          uom?: string
          updated_at?: string
          variance_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_expense_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_income_account_id_fkey"
            columns: ["income_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_inventory_asset_account_id_fkey"
            columns: ["inventory_asset_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_linked_asset_id_fkey"
            columns: ["linked_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_variance_account_id_fkey"
            columns: ["variance_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_company_id: string | null
          avatar_url: string | null
          current_financial_year_start: string | null
          financial_year_end_day: number | null
          financial_year_end_month: number | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          active_company_id?: string | null
          avatar_url?: string | null
          current_financial_year_start?: string | null
          financial_year_end_day?: number | null
          financial_year_end_month?: number | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          active_company_id?: string | null
          avatar_url?: string | null
          current_financial_year_start?: string | null
          financial_year_end_day?: number | null
          financial_year_end_month?: number | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          amount: number | null
          company_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          name: string
          project_id: string
          status: string | null
        }
        Insert: {
          amount?: number | null
          company_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          project_id: string
          status?: string | null
        }
        Update: {
          amount?: number | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          project_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          billable_rate: number | null
          budget_amount: number | null
          company_id: string
          created_at: string | null
          customer_id: string | null
          description: string | null
          id: string
          name: string
          status: string
        }
        Insert: {
          billable_rate?: number | null
          budget_amount?: number | null
          company_id: string
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string
        }
        Update: {
          billable_rate?: number | null
          budget_amount?: number | null
          company_id?: string
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          product_id: string | null
          project_id: string | null
          purchase_order_id: string | null
          quantity: number
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          product_id?: string | null
          project_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          product_id?: string | null
          project_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          attachment_url: string | null
          company_id: string | null
          created_at: string | null
          delivery_date: string | null
          id: string
          notes: string | null
          po_date: string | null
          po_number: string
          status: string
          vendor_id: string | null
        }
        Insert: {
          attachment_url?: string | null
          company_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          po_date?: string | null
          po_number: string
          status?: string
          vendor_id?: string | null
        }
        Update: {
          attachment_url?: string | null
          company_id?: string | null
          created_at?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          po_date?: string | null
          po_number?: string
          status?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          description: string
          id: string
          income_account_id: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          tax_rate_id: string | null
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          income_account_id?: string | null
          product_id?: string | null
          quantity: number
          quote_id: string
          tax_rate_id?: string | null
          unit_price: number
        }
        Update: {
          description?: string
          id?: string
          income_account_id?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          tax_rate_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_income_account_id_fkey"
            columns: ["income_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          company_id: string
          created_at: string | null
          customer_id: string
          description: string | null
          expiry_date: string | null
          id: string
          quote_date: string
          quote_number: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          customer_id: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          quote_date?: string
          quote_number: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          customer_id?: string
          description?: string | null
          expiry_date?: string | null
          id?: string
          quote_date?: string
          quote_number?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_bill_items: {
        Row: {
          created_at: string | null
          description: string
          expense_account_id: string | null
          id: string
          product_id: string | null
          quantity: number
          recurring_bill_id: string | null
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          description: string
          expense_account_id?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          recurring_bill_id?: string | null
          unit_cost?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          expense_account_id?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          recurring_bill_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_bill_items_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bill_items_recurring_bill_id_fkey"
            columns: ["recurring_bill_id"]
            isOneToOne: false
            referencedRelation: "recurring_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_bills: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          last_run_date: string | null
          next_run_date: string
          profile_name: string
          start_date: string
          status: string
          vendor_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          last_run_date?: string | null
          next_run_date: string
          profile_name: string
          start_date: string
          status?: string
          vendor_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          last_run_date?: string | null
          next_run_date?: string
          profile_name?: string
          start_date?: string
          status?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoice_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          income_account_id: string
          product_id: string | null
          quantity: number
          recurring_invoice_id: string
          tax_rate_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          income_account_id: string
          product_id?: string | null
          quantity?: number
          recurring_invoice_id: string
          tax_rate_id?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          income_account_id?: string
          product_id?: string | null
          quantity?: number
          recurring_invoice_id?: string
          tax_rate_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoice_items_income_account_id_fkey"
            columns: ["income_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_items_recurring_invoice_id_fkey"
            columns: ["recurring_invoice_id"]
            isOneToOne: false
            referencedRelation: "recurring_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          company_id: string
          created_at: string | null
          customer_id: string
          end_date: string | null
          frequency: string
          id: string
          last_run_date: string | null
          next_run_date: string
          profile_name: string
          start_date: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          customer_id: string
          end_date?: string | null
          frequency: string
          id?: string
          last_run_date?: string | null
          next_run_date: string
          profile_name: string
          start_date: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          customer_id?: string
          end_date?: string | null
          frequency?: string
          id?: string
          last_run_date?: string | null
          next_run_date?: string
          profile_name?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_journal_entries: {
        Row: {
          company_id: string
          created_at: string | null
          description: string
          end_date: string | null
          frequency: string
          id: string
          next_run_date: string
          start_date: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description: string
          end_date?: string | null
          frequency: string
          id?: string
          next_run_date: string
          start_date: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string
          end_date?: string | null
          frequency?: string
          id?: string
          next_run_date?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_journal_entry_items: {
        Row: {
          account_id: string
          amount: number
          id: string
          recurring_journal_entry_id: string
          type: string
        }
        Insert: {
          account_id: string
          amount: number
          id?: string
          recurring_journal_entry_id: string
          type: string
        }
        Update: {
          account_id?: string
          amount?: number
          id?: string
          recurring_journal_entry_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_journal_entry_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_journal_entry_items_recurring_journal_entry_id_fkey"
            columns: ["recurring_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "recurring_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      statutory_returns: {
        Row: {
          company_id: string
          content_hash: string | null
          country: string
          created_at: string
          declaration_data: Json
          generated_at: string
          generated_by: string | null
          id: string
          immutable: boolean
          payroll_run_id: string | null
          return_type: string
          source_payroll_runs: string[]
          status: string
          submission_reference: string | null
          submitted_at: string | null
          tax_year: string
          updated_at: string
          validation_result: Json
        }
        Insert: {
          company_id: string
          content_hash?: string | null
          country?: string
          created_at?: string
          declaration_data?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          immutable?: boolean
          payroll_run_id?: string | null
          return_type: string
          source_payroll_runs?: string[]
          status?: string
          submission_reference?: string | null
          submitted_at?: string | null
          tax_year: string
          updated_at?: string
          validation_result?: Json
        }
        Update: {
          company_id?: string
          content_hash?: string | null
          country?: string
          created_at?: string
          declaration_data?: Json
          generated_at?: string
          generated_by?: string | null
          id?: string
          immutable?: boolean
          payroll_run_id?: string | null
          return_type?: string
          source_payroll_runs?: string[]
          status?: string
          submission_reference?: string | null
          submitted_at?: string | null
          tax_year?: string
          updated_at?: string
          validation_result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "statutory_returns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statutory_returns_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      statutory_submission_ledger: {
        Row: {
          company_id: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          event_payload: Json
          event_type: string
          id: string
          statutory_return_id: string
        }
        Insert: {
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          event_payload?: Json
          event_type: string
          id?: string
          statutory_return_id: string
        }
        Update: {
          company_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          event_payload?: Json
          event_type?: string
          id?: string
          statutory_return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statutory_submission_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statutory_submission_ledger_statutory_return_id_fkey"
            columns: ["statutory_return_id"]
            isOneToOne: false
            referencedRelation: "statutory_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          rate: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          rate: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          company_id: string
          created_at: string | null
          date: string
          hours: number
          id: string
          invoice_id: string | null
          is_billed: boolean | null
          notes: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          date: string
          hours: number
          id?: string
          invoice_id?: string | null
          is_billed?: boolean | null
          notes?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          date?: string
          hours?: number
          id?: string
          invoice_id?: string | null
          is_billed?: boolean | null
          notes?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_credit_items: {
        Row: {
          account_id: string
          created_at: string | null
          description: string
          id: string
          product_id: string | null
          quantity: number
          unit_price: number
          vendor_credit_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          description: string
          id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
          vendor_credit_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
          vendor_credit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_credit_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credit_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credit_items_vendor_credit_id_fkey"
            columns: ["vendor_credit_id"]
            isOneToOne: false
            referencedRelation: "vendor_credits"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_credits: {
        Row: {
          company_id: string
          created_at: string | null
          credit_date: string
          credit_number: string
          id: string
          journal_entry_id: string | null
          reason: string | null
          status: string
          vendor_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          credit_date?: string
          credit_number: string
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          status?: string
          vendor_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          credit_date?: string
          credit_number?: string
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_credits_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          company_id: string
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          payment_terms: number | null
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          payment_terms?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          payment_terms?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_fixed_asset_atomic: {
        Args: {
          p_actor_user_id?: string
          p_asset: Json
          p_company_id: string
          p_payment_account_id: string
        }
        Returns: string
      }
      allocate_asset_code: { Args: { p_company_id: string }; Returns: string }
      allocate_credit_note: {
        Args: {
          p_amount: number
          p_ar_account_id: string
          p_company_id: string
          p_credit_note_id: string
          p_invoice_id: string
        }
        Returns: undefined
      }
      allocate_vendor_credit: {
        Args: {
          p_amount: number
          p_ap_account_id: string
          p_bill_id: string
          p_company_id: string
          p_vendor_credit_id: string
        }
        Returns: undefined
      }
      assert_bank_account_open: {
        Args: { p_bank_account_id: string; p_company_id: string }
        Returns: {
          account_number: string | null
          account_type: string
          bank_name: string | null
          branch_code: string | null
          chart_of_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_default: boolean
          metadata: Json
          name: string
          opening_balance: number
          opening_balance_date: string | null
          opening_balance_posted: boolean
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "bank_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_period_open: {
        Args: { p_company_id: string; p_date: string }
        Returns: undefined
      }
      close_financial_year: { Args: { p_end_date: string }; Returns: undefined }
      create_bank_account_atomic: {
        Args: {
          p_account_number?: string
          p_account_type?: string
          p_actor_user_id?: string
          p_bank_name?: string
          p_branch_code?: string
          p_chart_of_account_id?: string
          p_company_id: string
          p_currency?: string
          p_is_default?: boolean
          p_metadata?: Json
          p_name: string
          p_opening_balance?: number
          p_opening_balance_contra_account_id?: string
          p_opening_balance_date?: string
        }
        Returns: string
      }
      create_bank_statement_import_atomic: {
        Args: {
          p_actor_user_id?: string
          p_bank_account_id: string
          p_closing_balance: number
          p_company_id: string
          p_file_name: string
          p_lines: Json
          p_opening_balance: number
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      create_credit_note: {
        Args: {
          p_ar_account_id: string
          p_company_id: string
          p_credit_note_number: string
          p_customer_id: string
          p_date: string
          p_items: Json
          p_reason: string
          p_tax_account_id: string
        }
        Returns: string
      }
      create_invoice_with_inventory: {
        Args: {
          p_ar_account_id: string
          p_company_id: string
          p_customer_id: string
          p_description: string
          p_due_date: string
          p_inventory_asset_account_id: string
          p_invoice_date: string
          p_invoice_number: string
          p_items: Json
        }
        Returns: undefined
      }
      create_invoice_with_taxes:
        | {
            Args: {
              p_ar_account_id: string
              p_company_id: string
              p_customer_id: string
              p_description?: string
              p_due_date: string
              p_inventory_asset_account_id?: string
              p_invoice_date: string
              p_invoice_number: string
              p_items?: Json
              p_quote_id?: string
              p_tax_payable_account_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_ar_account_id: string
              p_company_id: string
              p_customer_id: string
              p_description: string
              p_due_date: string
              p_inventory_asset_account_id: string
              p_invoice_date: string
              p_invoice_number: string
              p_items: Json
              p_tax_payable_account_id: string
            }
            Returns: undefined
          }
      create_vendor_credit: {
        Args: {
          p_ap_account_id: string
          p_company_id: string
          p_credit_number: string
          p_date: string
          p_items: Json
          p_reason: string
          p_vendor_id: string
        }
        Returns: string
      }
      dispose_asset: {
        Args: {
          p_actor_user_id?: string
          p_asset_id: string
          p_cash_account_id: string
          p_company_id?: string
          p_disposal_date: string
          p_gain_loss_account_id: string
          p_proceeds: number
        }
        Returns: undefined
      }
      eim_consume_stock: {
        Args: {
          p_company_id: string
          p_cost_method: string
          p_product_id: string
          p_qty: number
          p_specific_layer_id?: string
          p_standard_cost?: number
          p_warehouse_id: string
        }
        Returns: {
          total_cost: number
          unit_cost: number
        }[]
      }
      eim_ensure_default_warehouse: {
        Args: { p_company_id: string }
        Returns: string
      }
      eim_get_or_create_balance: {
        Args: {
          p_company_id: string
          p_location_id?: string
          p_product_id: string
          p_warehouse_id: string
        }
        Returns: {
          avg_unit_cost: number
          company_id: string
          id: string
          location_id: string | null
          product_id: string
          qty_on_hand: number
          qty_reserved: number
          updated_at: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inv_balances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      eim_sync_product_qty: {
        Args: { p_company_id: string; p_product_id: string }
        Returns: undefined
      }
      eim_weighted_average: {
        Args: { c0: number; c1: number; q0: number; q1: number }
        Returns: number
      }
      ensure_auth_user_in_public_users: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      format_employee_number: {
        Args: { p_padding: number; p_sequence: number; p_template: string }
        Returns: string
      }
      format_employee_number_from_policy: {
        Args: {
          p_branch_code?: string
          p_company_code?: string
          p_padding: number
          p_sequence: number
          p_template: string
        }
        Returns: string
      }
      generate_accounting_periods: {
        Args: { p_financial_year_id: string }
        Returns: undefined
      }
      generate_amortization_schedule: {
        Args: { p_loan_id: string }
        Returns: undefined
      }
      generate_employee_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      generate_payslips_for_run: {
        Args: { p_company_id: string; p_run_id: string }
        Returns: undefined
      }
      get_aged_payables: {
        Args: never
        Returns: {
          current: number
          days_1_30: number
          days_31_60: number
          days_61_90: number
          days_90_plus: number
          total_due: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      get_aged_receivables: {
        Args: never
        Returns: {
          current: number
          customer_id: string
          customer_name: string
          days_1_30: number
          days_31_60: number
          days_61_90: number
          days_90_plus: number
          total_due: number
        }[]
      }
      get_balances_as_of_date:
        | {
            Args: { p_end_date: string }
            Returns: {
              account_number: number
              balance: number
              id: string
              name: string
              type: Database["public"]["Enums"]["account_type"]
            }[]
          }
        | {
            Args: { p_company_id?: string; p_end_date: string }
            Returns: {
              account_number: number
              balance: number
              id: string
              name: string
              type: Database["public"]["Enums"]["account_type"]
            }[]
          }
      get_budgets_with_activity: {
        Args: { p_company_id?: string }
        Returns: {
          account_id: string
          account_name: string
          actual_amount: number
          amount: number
          id: string
          period: string
          period_end_date: string
          period_start_date: string
          start_date: string
        }[]
      }
      get_cash_flow_statement: {
        Args: {
          p_company_id?: string
          p_end_date: string
          p_start_date: string
        }
        Returns: {
          amount: number
          category: string
          section: string
        }[]
      }
      get_customer_ar_balances: {
        Args: { p_company_id?: string }
        Returns: {
          balance: number
          customer_id: string
          customer_name: string
        }[]
      }
      get_monthly_summary: {
        Args: { p_months: number; p_company_id?: string }
        Returns: {
          month_start: string
          total_expenses: number
          total_income: number
        }[]
      }
      get_next_invoice_number_for_user: { Args: never; Returns: string }
      get_next_quote_number_for_user: { Args: never; Returns: string }
      get_overdue_invoices: {
        Args: { p_company_id?: string }
        Returns: {
          customer_name: string
          due_date: string
          id: string
          invoice_number: string
          total: number
        }[]
      }
      get_payroll_summary_report: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          item_description: string
          item_type: string
          total_amount: number
        }[]
      }
      get_period_activity: {
        Args: {
          p_company_id?: string
          p_end_date: string
          p_start_date: string
        }
        Returns: {
          activity: number
          id: string
          name: string
          type: Database["public"]["Enums"]["account_type"]
        }[]
      }
      get_top_expenses: {
        Args: { p_end_date: string; p_start_date: string; p_company_id?: string }
        Returns: {
          account_name: string
          total_amount: number
        }[]
      }
      get_vendor_ap_balances: {
        Args: { p_company_id?: string }
        Returns: {
          balance: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      is_admin_of: { Args: { p_company_id: string }; Returns: boolean }
      is_company_member: { Args: { p_company_id: string }; Returns: boolean }
      issue_stock_atomic: {
        Args: {
          p_actor_user_id?: string
          p_cogs_account_id?: string
          p_company_id: string
          p_date: string
          p_description?: string
          p_inventory_account_id?: string
          p_location_id?: string
          p_product_id: string
          p_qty: number
          p_source_doc_id: string
          p_source_doc_type: string
          p_specific_layer_id?: string
          p_warehouse_id: string
        }
        Returns: {
          amount: number
          journal_entry_id: string
          unit_cost: number
        }[]
      }
      match_statement_line_atomic: {
        Args: {
          p_actor_user_id?: string
          p_company_id: string
          p_journal_entry_item_id: string
          p_statement_line_id: string
        }
        Returns: Json
      }
      pay_specific_bill: {
        Args: {
          p_amount: number
          p_ap_account_id: string
          p_bill_id: string
          p_payment_account_id: string
          p_payment_date: string
        }
        Returns: undefined
      }
      peek_next_asset_code: { Args: { p_company_id: string }; Returns: string }
      post_bank_opening_balance_atomic: {
        Args: {
          p_actor_user_id?: string
          p_bank_account_id: string
          p_contra_account_id: string
          p_opening_balance_date?: string
        }
        Returns: Json
      }
      post_sales_invoice_atomic: {
        Args: {
          p_actor_user_id?: string
          p_ar_account_id: string
          p_company_id: string
          p_customer_id: string
          p_description: string
          p_due_date: string
          p_inventory_asset_account_id: string
          p_invoice_date: string
          p_invoice_number: string
          p_items: Json
          p_notes?: string
          p_quote_id?: string
          p_tax_payable_account_id: string
        }
        Returns: string
      }
      post_statement_line_adjustment_atomic: {
        Args: {
          p_actor_user_id?: string
          p_company_id: string
          p_contra_account_id: string
          p_description?: string
          p_statement_line_id: string
        }
        Returns: Json
      }
      posting_engine_next_journal_number: {
        Args: { p_company_id: string }
        Returns: string
      }
      posting_engine_rollback: {
        Args: {
          p_actor_user_id?: string
          p_company_id: string
          p_idempotency_key: string
          p_reason?: string
        }
        Returns: Json
      }
      posting_engine_submit: {
        Args: { p_mode?: string; p_request: Json }
        Returns: Json
      }
      preview_employee_number: {
        Args: { p_company_id: string; p_sequence?: number }
        Returns: string
      }
      receive_stock_atomic: {
        Args: {
          p_actor_user_id?: string
          p_company_id: string
          p_date: string
          p_description?: string
          p_inventory_account_id: string
          p_location_id?: string
          p_lot_code?: string
          p_offset_account_id: string
          p_product_id: string
          p_qty: number
          p_source_doc_id: string
          p_source_doc_type: string
          p_unit_cost: number
          p_vendor_id?: string
          p_warehouse_id: string
        }
        Returns: {
          amount: number
          journal_entry_id: string
          unit_cost: number
        }[]
      }
      record_bank_transaction_atomic: {
        Args: {
          p_actor_user_id?: string
          p_amount: number
          p_bank_account_id: string
          p_company_id: string
          p_contra_account_id: string
          p_description?: string
          p_direction: string
          p_reference?: string
          p_transaction_date: string
          p_transaction_type: string
        }
        Returns: Json
      }
      record_bank_transfer_atomic: {
        Args: {
          p_actor_user_id?: string
          p_amount: number
          p_company_id: string
          p_description?: string
          p_from_bank_account_id: string
          p_idempotency_key?: string
          p_to_bank_account_id: string
          p_transfer_date: string
        }
        Returns: Json
      }
      record_bill_with_inventory: {
        Args: {
          p_accounts_payable_id: string
          p_bill_date: string
          p_company_id: string
          p_description: string
          p_due_date: string
          p_items: Json
          p_vendor_id: string
        }
        Returns: undefined
      }
      record_bill_with_taxes: {
        Args: {
          p_accounts_payable_id: string
          p_bill_date: string
          p_bill_number: string
          p_company_id: string
          p_description: string
          p_due_date: string
          p_items: Json
          p_tax_receivable_account_id: string
          p_vendor_id: string
        }
        Returns: undefined
      }
      record_customer_payment_on_account_atomic: {
        Args: {
          p_accounts_receivable_id: string
          p_actor_user_id?: string
          p_amount: number
          p_company_id: string
          p_customer_id: string
          p_deposit_account_id: string
          p_description?: string
          p_idempotency_key?: string
          p_payment_date: string
        }
        Returns: Json
      }
      record_invoice_payment:
        | {
            Args: {
              p_ar_account_id: string
              p_asset_account_id: string
              p_invoice_id: string
              p_payment_date: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_amount: number
              p_ar_account_id: string
              p_asset_account_id: string
              p_invoice_id: string
              p_payment_date: string
            }
            Returns: undefined
          }
      record_loan_disbursement_atomic: {
        Args: {
          p_actor_user_id?: string
          p_company_id: string
          p_deposit_account_id: string
          p_interest_rate: number
          p_lender_id: string
          p_lender_name: string
          p_liability_account_id: string
          p_loan_agreement_url: string
          p_principal_amount: number
          p_repayment_frequency: string
          p_start_date: string
          p_term_months: number
        }
        Returns: string
      }
      record_loan_payment: {
        Args: {
          p_bank_account_id: string
          p_interest_expense_account_id: string
          p_payment_date: string
          p_schedule_item_id: string
        }
        Returns: undefined
      }
      record_vendor_payment_on_account_atomic: {
        Args: {
          p_accounts_payable_id: string
          p_actor_user_id?: string
          p_amount: number
          p_company_id: string
          p_description?: string
          p_idempotency_key?: string
          p_payment_account_id: string
          p_payment_date: string
          p_vendor_id: string
        }
        Returns: Json
      }
      reimburse_expense_claim_atomic: {
        Args: {
          p_actor_user_id?: string
          p_claim_id: string
          p_liability_account_id: string
          p_payment_account_id: string
          p_payment_date: string
        }
        Returns: Json
      }
      reopen_financial_year: {
        Args: { p_closed_year_id: string }
        Returns: undefined
      }
      resolve_erp_context: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: Json
      }
      set_default_bank_account: {
        Args: { p_bank_account_id: string; p_company_id: string }
        Returns: undefined
      }
      sync_employee_sequence_after_import: {
        Args: { p_company_id: string; p_employee_number: string }
        Returns: undefined
      }
      update_invoice_full: {
        Args: {
          p_ar_account_id: string
          p_company_id: string
          p_customer_id: string
          p_description: string
          p_due_date: string
          p_inventory_asset_account_id: string
          p_invoice_date: string
          p_invoice_id: string
          p_invoice_number: string
          p_items: Json
          p_tax_payable_account_id: string
        }
        Returns: undefined
      }
      update_journal_entry_full: {
        Args: {
          p_attachment_url: string
          p_company_id: string
          p_customer_id: string
          p_date: string
          p_description: string
          p_entry_id: string
          p_items: Json
          p_vendor_id: string
        }
        Returns: undefined
      }
      validate_employee_number_format: {
        Args: { p_company_id: string; p_employee_number: string }
        Returns: boolean
      }
      void_invoice: { Args: { p_invoice_id: string }; Returns: undefined }
    }
    Enums: {
      account_type: "Asset" | "Liability" | "Equity" | "Income" | "Expense"
      company_role: "owner" | "admin" | "member"
      employment_period: "monthly" | "weekly" | "fortnightly"
      employment_type: "permanent" | "contract" | "intern" | "casual"
      invoice_status: "draft" | "sent" | "paid" | "void"
      payroll_run_status: "draft" | "processing" | "finalized" | "paid"
      payslip_item_type:
        | "earning"
        | "deduction"
        | "company_contribution"
        | "reimbursement"
        | "employer_contribution"
      payslip_status: "draft" | "finalized" | "paid"
      user_role: "admin" | "accountant" | "user"
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
      account_type: ["Asset", "Liability", "Equity", "Income", "Expense"],
      company_role: ["owner", "admin", "member"],
      employment_period: ["monthly", "weekly", "fortnightly"],
      employment_type: ["permanent", "contract", "intern", "casual"],
      invoice_status: ["draft", "sent", "paid", "void"],
      payroll_run_status: ["draft", "processing", "finalized", "paid"],
      payslip_item_type: [
        "earning",
        "deduction",
        "company_contribution",
        "reimbursement",
        "employer_contribution",
      ],
      payslip_status: ["draft", "finalized", "paid"],
      user_role: ["admin", "accountant", "user"],
    },
  },
} as const

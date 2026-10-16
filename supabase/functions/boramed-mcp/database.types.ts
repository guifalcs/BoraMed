type TableShape = {
  Row: Record<string, unknown> & { id: string }
  Insert: Record<string, unknown>
  Update: Record<string, unknown>
  Relationships: []
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' }
  public: {
    Tables: Record<string, TableShape>
    Views: Record<string, never>
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

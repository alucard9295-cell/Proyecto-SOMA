export function auditRepository(db: D1Database) {
  return {
    /** Solo ids y hechos, nunca contenido del usuario ni credenciales. */
    async record(eventType: string, actor: string, requestId: string, details: Record<string, string | number | null>) {
      await db
        .prepare("INSERT INTO audit_events (event_type, actor, request_id, details) VALUES (?,?,?,?)")
        .bind(eventType, actor, requestId, JSON.stringify(details))
        .run();
    },
  };
}


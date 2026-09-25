export function usoAsesorRepository(db: D1Database) {
  return {
    /**
     * Suma una respuesta al dia si queda cupo; false si ya se agoto. Una sola
     * sentencia: dos peticiones a la vez no pueden pasarse del tope.
     */
    async consumir(dia: string, tope: number): Promise<boolean> {
      const fila = await db
        .prepare("INSERT INTO uso_asesor (dia, respuestas) VALUES (?, 1) ON CONFLICT (dia) DO UPDATE SET respuestas = respuestas + 1 WHERE respuestas < ? RETURNING respuestas")
        .bind(dia, tope)
        .first();
      return fila !== null;
    },
  };
}

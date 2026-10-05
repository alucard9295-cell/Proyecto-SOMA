export type Contacto = { contacto_id: number; nombre: string; correo: string; visitas: number; creado_en: string; ultima_visita: string };

export function contactosRepository(db: D1Database) {
  return {
    /** Alta o regreso en una sola sentencia: el correo es la llave. */
    async registrar(nombre: string, correo: string): Promise<Contacto> {
      return (await db
        .prepare("INSERT INTO contactos (nombre, correo) VALUES (?, ?) ON CONFLICT (correo) DO UPDATE SET nombre = excluded.nombre, visitas = visitas + 1, ultima_visita = datetime('now') RETURNING *")
        .bind(nombre, correo)
        .first<Contacto>())!;
    },

    /** Los mas recientes primero. */
    async recientes(limite: number): Promise<Contacto[]> {
      const { results } = await db.prepare("SELECT * FROM contactos ORDER BY ultima_visita DESC, contacto_id DESC LIMIT ?").bind(limite).all<Contacto>();
      return results;
    },
  };
}

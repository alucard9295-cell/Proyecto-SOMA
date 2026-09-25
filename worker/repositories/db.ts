/** Utilidades compartidas por los repositorios. Solo SQL y mapeo de filas. */

export const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(",");

export async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  return (await statement.all<T>()).results;
}

/**
 * Id recien insertado dentro de un `db.batch()`. D1 ejecuta el batch como una
 * transaccion serializada, asi que MAX(id) es la fila del INSERT anterior. No
 * se usa last_insert_rowid(): cambia con cada INSERT de detalle del mismo batch.
 */
export const lastId = (table: string, column: string) => `(SELECT MAX(${column}) FROM ${table})`;

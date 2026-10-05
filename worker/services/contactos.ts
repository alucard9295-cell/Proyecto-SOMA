/**
 * Contactos que deja el visitante antes de abrir el asesor publico. Solo se
 * guardan nombre y correo, con autorizacion expresa; no se envia ningun correo.
 */
import { z } from "zod";
import type { Repos } from "../repositories";

export const contactoInput = z.object({
  nombre: z.string().trim().min(2).max(80),
  correo: z.string().trim().toLowerCase().max(120).pipe(z.email()),
  // La casilla de tratamiento de datos (Ley 1581): sin ella no se guarda nada.
  autoriza: z.literal(true),
});

export async function registrarContacto(r: Repos, datos: z.infer<typeof contactoInput>) {
  const { contacto_id } = await r.contactos.registrar(datos.nombre, datos.correo);
  return { contacto_id };
}

export const contactosRecientes = (r: Repos) => r.contactos.recientes(50);

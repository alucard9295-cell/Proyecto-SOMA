import { describe, expect, it } from "vitest";
import { api } from "./helpers";

const libre = { ASESOR_LIMITE: { limit: async () => ({ success: true }) } } as never;
const contacto = (json: unknown) => api("/api/sales/contacto", { method: "POST", json }, libre);

describe("paso previo del asesor", () => {
  it("guarda nombre y correo normalizado y lo muestra en el panel", async () => {
    const r = await contacto({ nombre: "  Ana Ruiz ", correo: " Ana@Ejemplo.CO ", autoriza: true });
    expect(r.status).toBe(201);
    expect(r.body.contacto_id).toBeGreaterThan(0);
    const lista = (await api("/api/admin/contactos")).body;
    expect(lista[0]).toMatchObject({ nombre: "Ana Ruiz", correo: "ana@ejemplo.co", visitas: 1 });
  });

  it("si el correo vuelve, actualiza el nombre y cuenta la visita", async () => {
    await contacto({ nombre: "Luis", correo: "luis@ejemplo.co", autoriza: true });
    const otra = await contacto({ nombre: "Luis Gómez", correo: "LUIS@ejemplo.co", autoriza: true });
    const lista = (await api("/api/admin/contactos")).body;
    const luis = lista.filter((c: { correo: string }) => c.correo === "luis@ejemplo.co");
    expect(luis).toHaveLength(1);
    expect(luis[0]).toMatchObject({ contacto_id: otra.body.contacto_id, nombre: "Luis Gómez", visitas: 2 });
  });

  it("sin autorizacion de datos o con correo invalido no guarda nada", async () => {
    expect((await contacto({ nombre: "Eva", correo: "eva@ejemplo.co", autoriza: false })).status).toBe(422);
    expect((await contacto({ nombre: "Eva", correo: "no-es-correo", autoriza: true })).status).toBe(422);
    expect((await contacto({ nombre: "E", correo: "eva@ejemplo.co", autoriza: true })).status).toBe(422);
  });

  it("respeta el limite por IP del asesor", async () => {
    const r = await api("/api/sales/contacto", { method: "POST", json: { nombre: "Eva", correo: "eva@ejemplo.co", autoriza: true } }, { ASESOR_LIMITE: { limit: async () => ({ success: false }) } } as never);
    expect(r.status).toBe(429);
  });
});

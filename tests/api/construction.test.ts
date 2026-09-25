import { describe, expect, it } from "vitest";
import { api, apuPayload, post, put } from "./helpers";

const CAMPOS = ["costo_directo", "administracion", "imprevistos", "utilidad", "subtotal", "base_iva", "iva", "precio_venta"] as const;

describe("APU y simulador de proyecto", () => {
  it("flujo completo: insumo -> APU -> proyecto -> partida con cronograma", async () => {
    const supplies = (await api("/api/admin/supplies")).body.items;
    const labor = supplies.find((item: { categoria: string }) => item.categoria === "mano_obra");
    const apu = await post("/api/admin/apus", {
      nombre_partida: "Muro de prueba", unidad: "m2", categoria: "obra_gris",
      detalles: [{ insumo_id: labor.insumo_id, categoria: "mano_obra", rendimiento: 0.1, precio_unitario: 269231 }],
    });
    expect(apu.status).toBe(200);
    const project = await post("/api/admin/proyectos", { nombre: "Casa prueba", fecha_inicio: "2026-01-05" });
    expect(project.status).toBe(200);
    const result = await post(`/api/admin/proyectos/${project.body.proyecto.proyecto_id}/partidas`, {
      fase: "Mamposteria", apu_id: apu.body.apu.apu_id, cantidad: 120, rendimiento_diario: 10, orden: 1,
    });
    expect(result.status).toBe(200);
    const payload = result.body.proyecto;
    expect(payload.costo_total).toBe(3230772); // 120 * 26923.10, exacto
    expect(payload.duracion_dias).toBe(12);
    expect(payload.fecha_fin).toBe("2026-01-16");
    expect(payload.partidas[0].apu.nombre_partida).toBe("Muro de prueba");
  });

  it.each(["utilidad", "directo", "subtotal"])("preview coincide con lo guardado (iva_base=%s)", async (iva_base) => {
    const preview = (await post("/api/admin/apus/preview", apuPayload({ iva_base }))).body;
    const guardado = (await post("/api/admin/apus", apuPayload({ iva_base }))).body.apu;
    for (const campo of CAMPOS) expect(preview[campo], campo).toBe(guardado[campo]);
  });

  it("el precio no arrastra error de punto flotante", async () => {
    const preview = (await post("/api/admin/apus/preview", apuPayload())).body;
    expect(preview.costo_directo).toBe(26923.1);
    expect(preview.precio_venta).toBe(32819.27);
  });

  it("preview no persiste nada", async () => {
    const antes = (await api("/api/admin/apus")).body.count;
    await post("/api/admin/apus/preview", apuPayload());
    expect((await api("/api/admin/apus")).body.count).toBe(antes);
  });

  it("actualizar un APU reemplaza sus detalles", async () => {
    const creado = (await post("/api/admin/apus", apuPayload())).body.apu;
    const detalles = [
      { insumo_id: 1, categoria: "mano_obra", rendimiento: 1, desperdicio_pct: 0, precio_unitario: 1000 },
      { insumo_id: 1, categoria: "mano_obra", rendimiento: 2, desperdicio_pct: 10, precio_unitario: null },
    ];
    const r = await put(`/api/admin/apus/${creado.apu_id}`, apuPayload({ nombre_partida: "Muro editado", detalles }));
    expect(r.status).toBe(200);
    expect(r.body.apu.nombre_partida).toBe("Muro editado");
    expect(r.body.apu.detalles).toHaveLength(2);
    // Sin compras en facturas, el precio de catalogo es 0.
    expect(r.body.apu.detalles[1].precio_aplicado).toBe(0);
    expect(r.body.apu.costo_directo).toBe(1000);
  });

  it("valida categorias, insumos y existencia", async () => {
    expect((await post("/api/admin/apus", apuPayload({ categoria: "otra" }))).body.detail).toBe("Categoria o base de IVA invalida.");
    expect((await post("/api/admin/apus", apuPayload({ detalles: [{ insumo_id: 999, categoria: "mano_obra", rendimiento: 1 }] }))).body.detail)
      .toBe("Insumo no encontrado: 999");
    expect((await put("/api/admin/apus/9999", apuPayload())).status).toBe(404);
    expect((await post("/api/admin/apus", apuPayload({ detalles: [] }))).status).toBe(422);
    expect((await post("/api/admin/proyectos/9999/partidas", { fase: "x", apu_id: 1, cantidad: 1, rendimiento_diario: 1 })).body.detail)
      .toBe("Proyecto no encontrado.");
    expect((await post("/api/admin/proyectos", { nombre: "x", fecha_inicio: "05/01/2026" })).status).toBe(422);
  });

  it("insumos: filtra, actualiza y rechaza categorias invalidas", async () => {
    expect((await api("/api/admin/supplies?category=nada")).status).toBe(422);
    const found = (await api("/api/admin/supplies?search=CUADRILLA")).body;
    expect(found.count).toBeGreaterThanOrEqual(1);
    const id = found.items[0].insumo_id;
    const r = await put(`/api/admin/supplies/${id}`, { nombre_normalizado: "  Mano de obra cuadrilla muro ", categoria: "mano_obra", unidad_estandar: "jornada" });
    expect(r.body).toEqual({ ok: true, insumo_id: id });
    expect((await put("/api/admin/supplies/9999", { nombre_normalizado: "x", categoria: "material" })).status).toBe(404);
  });
});

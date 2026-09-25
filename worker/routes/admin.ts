/**
 * Controladores del area de administracion. Validan la entrada con zod,
 * llaman al caso de uso y devuelven JSON. Sin SQL ni reglas de negocio.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { HttpError } from "../errors";
import { requireAccess } from "../middleware/access";
import { repos } from "../repositories";
import * as apus from "../services/apus";
import { perfilCopiloto } from "../services/asistentes";
import { correr, modeloDe } from "../services/copiloto";
import * as documents from "../services/documents";
import * as projects from "../services/projects";
import { corridaInput, registrarFallo, sse } from "./agui";
import { validate } from "./validate";

const id = z.object({ id: z.coerce.number().int().positive() });
const pct = z.number().min(0).max(100).default(0);
const optionalText = (max: number) => z.string().max(max).nullish();

const supplyUpdate = z.object({
  nombre_normalizado: z.string().trim().min(1).max(240),
  categoria: z.string(),
  unidad_estandar: optionalText(40),
});

const apuInput = z.object({
  nombre_partida: z.string().trim().min(1).max(240),
  unidad: z.string().trim().min(1).max(40),
  categoria: z.string().default("obra_gris"),
  descripcion: optionalText(1000),
  administracion_pct: pct,
  imprevistos_pct: pct,
  utilidad_pct: pct,
  iva_pct: pct,
  iva_base: z.string().default("utilidad"),
  detalles: z
    .array(
      z.object({
        insumo_id: z.number().int().positive(),
        categoria: z.string(),
        rendimiento: z.number().positive(),
        desperdicio_pct: pct,
        precio_unitario: z.number().min(0).nullish(),
      }),
    )
    .min(1),
});

const projectInput = z.object({
  nombre: z.string().trim().min(1).max(240),
  cliente: optionalText(240),
  ubicacion: optionalText(240),
  fecha_inicio: z.iso.date(),
});

const partidaInput = z.object({
  fase: z.string().trim().min(1).max(120),
  apu_id: z.number().int().positive(),
  cantidad: z.number().positive(),
  rendimiento_diario: z.number().positive(),
  orden: z.number().int().min(1).default(1),
});

// Importes y cantidades como texto decimal: el dinero nunca pasa por float.
const importe = z.string().regex(/^-?\d+(\.\d{1,2})?$/, "importe decimal con hasta 2 decimales").nullable();
const cantidad = z.string().regex(/^-?\d+(\.\d+)?$/, "numero decimal").nullable();
const texto = (max: number) => z.string().max(max).nullable();
const extraccionInput = z.object({
  emisor_nit: texto(20),
  emisor_nombre: texto(240),
  cliente_nit: texto(20),
  cufe: texto(200),
  fecha: z.iso.date().nullable(),
  parser: texto(120),
  items: z.array(z.object({ descripcion: z.string().max(500), cantidad, unidad: texto(40), valor_unitario: importe, valor_total: importe })).max(1000),
  subtotal: importe,
  iva: importe,
  total: importe,
});
const uploadInput = z.object({
  archivo: z.instanceof(File, { message: "falta el PDF" }),
  extraccion: z.string().max(1024 * 1024).transform((raw, ctx) => {
    try { return JSON.parse(raw); } catch { ctx.addIssue({ code: "custom", message: "JSON invalido" }); return z.NEVER; }
  }).pipe(extraccionInput),
});

const ctx = (c: Context<AppEnv>) => ({ actor: c.get("actor"), requestId: c.get("requestId") });

export const admin = new Hono<AppEnv>()
  .use(requireAccess)
  .get("/me", (c) => c.json({ email: c.get("actor") }))
  .get("/summary", async (c) => c.json(await documents.summary(repos(c.env.DB))))
  .post("/copiloto", validate("json", corridaInput({ mensajes: 40, texto: 4000 })), (c) =>
    sse(c, correr(modeloDe(c.env.AI), perfilCopiloto(repos(c.env.DB)), c.req.valid("json"), registrarFallo(c))))

  .get("/supplies", validate("query", z.object({ search: z.string().default(""), category: z.string().default("") })), async (c) => {
    const { search, category } = c.req.valid("query");
    return c.json(await apus.listSupplies(repos(c.env.DB), search, category));
  })
  .put("/supplies/:id", validate("param", id), validate("json", supplyUpdate), async (c) => {
    const r = repos(c.env.DB);
    const result = await apus.updateSupply(r, c.req.valid("param").id, c.req.valid("json"));
    await r.audit.record("supply.updated", c.get("actor"), c.get("requestId"), { insumo_id: result.insumo_id });
    return c.json(result);
  })

  .get("/apus", async (c) => c.json(await apus.listApus(repos(c.env.DB))))
  .post("/apus/preview", validate("json", apuInput), async (c) => c.json(await apus.previewApu(repos(c.env.DB), c.req.valid("json"))))
  .post("/apus", validate("json", apuInput), async (c) => {
    const r = repos(c.env.DB);
    const result = await apus.createApu(r, c.req.valid("json"));
    await r.audit.record("apu.created", c.get("actor"), c.get("requestId"), { apu_id: result.apu.apu_id });
    return c.json(result);
  })
  .put("/apus/:id", validate("param", id), validate("json", apuInput), async (c) => {
    const r = repos(c.env.DB);
    const result = await apus.updateApu(r, c.req.valid("param").id, c.req.valid("json"));
    await r.audit.record("apu.updated", c.get("actor"), c.get("requestId"), { apu_id: result.apu.apu_id });
    return c.json(result);
  })

  .get("/proyectos", async (c) => c.json(await projects.listProjects(repos(c.env.DB))))
  .post("/proyectos", validate("json", projectInput), async (c) => {
    const r = repos(c.env.DB);
    const result = await projects.createProject(r, c.req.valid("json"));
    await r.audit.record("project.created", c.get("actor"), c.get("requestId"), { proyecto_id: result.proyecto.proyecto_id });
    return c.json(result);
  })
  .post("/proyectos/:id/partidas", validate("param", id), validate("json", partidaInput), async (c) =>
    c.json(await projects.addPartida(repos(c.env.DB), c.req.valid("param").id, c.req.valid("json"))),
  )

  .get("/documentos/revision", async (c) => c.json(await documents.listInReview(repos(c.env.DB))))
  .get("/documentos/revision/:id", validate("param", id), async (c) => c.json(await documents.getJob(repos(c.env.DB), c.req.valid("param").id)))
  .post("/documentos", validate("form", uploadInput), async (c) => {
    if (!c.env.FILES) throw new HttpError(503, "La carga de facturas todavia no esta habilitada.");
    const { archivo, extraccion } = c.req.valid("form");
    const r = repos(c.env.DB);
    const result = await documents.subir(r, c.env.FILES, { nombre: archivo.name, bytes: await archivo.arrayBuffer() }, extraccion, ctx(c));
    if (result.duplicado) return c.json(result, 200);
    await r.audit.record("document.uploaded", c.get("actor"), c.get("requestId"), { documento_id: result.documento_id, job_id: result.job_id, estado: result.estado });
    return c.json(result, 201);
  })
  .post("/documentos/revision/:id/aprobar", validate("param", id), validate("json", extraccionInput), async (c) => {
    const r = repos(c.env.DB);
    const result = await documents.aprobar(r, c.req.valid("param").id, c.req.valid("json"), ctx(c));
    await r.audit.record("document.approved", c.get("actor"), c.get("requestId"), { job_id: result.job_id, factura_id: result.factura_id });
    return c.json(result);
  })
  .post("/documentos/revision/:id/descartar", validate("param", id), validate("json", z.object({ motivo: z.string().trim().min(1).max(500) })), async (c) => {
    const r = repos(c.env.DB);
    const result = await documents.descartar(r, c.req.valid("param").id, c.req.valid("json").motivo);
    await r.audit.record("document.discarded", c.get("actor"), c.get("requestId"), { job_id: result.job_id });
    return c.json(result);
  });

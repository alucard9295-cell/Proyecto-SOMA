import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { repos } from "../../worker/repositories";
import { consumoPlan, GRAPHQL_CLOUDFLARE } from "../../worker/services/consumo";
import { api } from "./helpers";

const AHORA = new Date("2026-03-04T15:30:00Z");
const uso = (c: Awaited<ReturnType<typeof consumoPlan>>, id: string) => c.medidas.find((m) => m.id === id)?.uso;

function cloudflareFalso(cuerpo: unknown, status = 200) {
  const pedidos: Array<{ url: string; init: RequestInit }> = [];
  const pedir = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, init });
    return new Response(JSON.stringify(cuerpo), { status });
  }) as unknown as typeof fetch;
  return { pedir, pedidos };
}

const RESPUESTA = {
  data: { viewer: { accounts: [{
    workers: [{ sum: { requests: 799 } }],
    d1: [{ sum: { rowsRead: 19566, rowsWritten: 73 } }],
    almacen: [{ max: { databaseSizeBytes: 106496 } }, { max: { databaseSizeBytes: 114688 } }],
    ia: [{ sum: { totalNeurons: 1293.34 } }],
  }] } },
  errors: null,
};

describe("consumo del plan gratis", () => {
  it("suma las cifras de Cloudflare del dia UTC y el cupo del asesor de D1", async () => {
    await env.DB.prepare("INSERT INTO uso_asesor (dia, respuestas) VALUES ('2026-03-04', 12) ON CONFLICT (dia) DO UPDATE SET respuestas = 12").run();
    const { pedir, pedidos } = cloudflareFalso(RESPUESTA);
    const c = await consumoPlan(repos(env.DB), { cuenta: "cuenta", token: "secreto" }, AHORA, pedir);

    expect(c.analitica).toBe("ok");
    expect(uso(c, "workers")).toBe(799);
    expect(uso(c, "ia")).toBe(1293);
    expect(uso(c, "d1_lecturas")).toBe(19566);
    expect(uso(c, "d1_escrituras")).toBe(73);
    expect(uso(c, "d1_almacen")).toBe(106496 + 114688);
    expect(uso(c, "asesor")).toBe(12);

    expect(pedidos[0].url).toBe(GRAPHQL_CLOUDFLARE);
    expect(new Headers(pedidos[0].init.headers).get("authorization")).toBe("Bearer secreto");
    const { variables } = JSON.parse(String(pedidos[0].init.body));
    expect(variables).toMatchObject({ cuenta: "cuenta", dia: "2026-03-04", desde: "2026-03-04T00:00:00Z" });
  });

  it("sin token no llama a Cloudflare y aun muestra el cupo del asesor", async () => {
    const { pedir, pedidos } = cloudflareFalso(RESPUESTA);
    const c = await consumoPlan(repos(env.DB), { cuenta: "cuenta" }, new Date("2026-03-05T10:00:00Z"), pedir);
    expect(c.analitica).toBe("sin_token");
    expect(pedidos).toHaveLength(0);
    expect(uso(c, "workers")).toBeNull();
    expect(uso(c, "asesor")).toBe(0);
  });

  it("un token sin permiso o un error de GraphQL se informa sin romper la pantalla", async () => {
    const r = repos(env.DB);
    const conError = await consumoPlan(r, { cuenta: "c", token: "t" }, AHORA, cloudflareFalso({ data: null, errors: [{ message: "not authorized" }] }).pedir);
    expect(conError).toMatchObject({ analitica: "error", detalle: "not authorized" });
    expect(uso(conError, "workers")).toBeNull();

    const caido = await consumoPlan(r, { cuenta: "c", token: "t" }, AHORA, cloudflareFalso({}, 403).pedir);
    expect(caido).toMatchObject({ analitica: "error", detalle: "Cloudflare respondio 403" });
  });

  it("la ruta queda detras de Access como el resto del admin", async () => {
    const r = await api("/api/admin/consumo", {}, { ENVIRONMENT: "production", ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" });
    expect(r.status).toBe(503);
  });
});

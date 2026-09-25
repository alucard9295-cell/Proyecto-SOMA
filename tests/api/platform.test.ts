import { env } from "cloudflare:workers";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import { esAdmin, verifyAccessToken } from "../../worker/middleware/access";
import { api, post } from "./helpers";

describe("endurecimiento del API", () => {
  it("health responde con cabeceras de seguridad e id de peticion", async () => {
    const r = await api("/api/health");
    expect(r.body).toEqual({ status: "ok" });
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("X-Frame-Options")).toBe("DENY");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("respeta un X-Request-ID sano y descarta uno malicioso", async () => {
    expect((await api("/api/health", { headers: { "X-Request-ID": "abc-123" } })).headers.get("X-Request-ID")).toBe("abc-123");
    expect((await api("/api/health", { headers: { "X-Request-ID": "<script>" } })).headers.get("X-Request-ID")).not.toBe("<script>");
  });

  it("ruta inexistente da 404 JSON con request_id", async () => {
    const r = await api("/api/pipeline/process");
    expect(r.status).toBe(404);
    expect(r.body.request_id).toBeTruthy();
  });

  it("rechaza cuerpos de mas de 2 MB", async () => {
    const r = await api("/api/sales/simulation", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(2 * 1024 * 1024 + 1) });
    expect(r.status).toBe(413);
  });

  it("HSTS solo en produccion", async () => {
    expect((await api("/api/health")).headers.get("Strict-Transport-Security")).toBeNull();
    expect((await api("/api/health", {}, { ENVIRONMENT: "production" })).headers.get("Strict-Transport-Security")).toContain("max-age");
  });
});

describe("Cloudflare Access", () => {
  it("en produccion sin configurar, el admin falla cerrado (503)", async () => {
    const r = await api("/api/admin/summary", {}, { ENVIRONMENT: "production", ACCESS_AUD: "", ACCESS_TEAM_DOMAIN: "" });
    expect(r.status).toBe(503);
  });

  it("configurado y sin JWT, 401", async () => {
    const r = await api("/api/admin/apus/preview", { method: "POST", json: {} }, { ENVIRONMENT: "production", ACCESS_AUD: "aud", ACCESS_TEAM_DOMAIN: "equipo.cloudflareaccess.com", ADMIN_EMAILS: "admin@soma.co" });
    expect(r.status).toBe(401);
  });

  it("configurado con JWT basura, 401 sin filtrar el motivo", async () => {
    const r = await api("/api/admin/summary", { headers: { "Cf-Access-Jwt-Assertion": "a.b.c" } }, { ENVIRONMENT: "production", ACCESS_AUD: "aud", ACCESS_TEAM_DOMAIN: "equipo.cloudflareaccess.com", ADMIN_EMAILS: "admin@soma.co" });
    expect(r.status).toBe(401);
    expect(r.body.detail).toBe("La sesion no es valida o vencio.");
  });

  it("con Access configurado pero sin ADMIN_EMAILS, tambien falla cerrado (503)", async () => {
    const r = await api("/api/admin/summary", {}, { ENVIRONMENT: "production", ACCESS_AUD: "aud", ACCESS_TEAM_DOMAIN: "equipo.cloudflareaccess.com" });
    expect(r.status).toBe(503);
  });

  it("una identidad firmada por Access solo entra si esta en ADMIN_EMAILS", () => {
    expect(esAdmin("Admin@Soma.co", " admin@soma.co , socio@soma.co")).toBe(true);
    expect(esAdmin("intruso@gmail.com", "admin@soma.co")).toBe(false);
    expect(esAdmin("admin@soma.co.evil.com", "admin@soma.co")).toBe(false);
    expect(esAdmin("", ",")).toBe(false);
  });

  it("en local sin configurar entra como dev@local", async () => {
    expect((await api("/api/admin/me")).body).toEqual({ email: "dev@local" });
  });

  it("verifica firma, emisor y audiencia del JWT", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
    const issuer = "https://equipo.cloudflareaccess.com";
    const sign = (claims: { aud: string; iss: string }) =>
      new SignJWT({ email: "admin@soma.co" }).setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(claims.iss).setAudience(claims.aud).setIssuedAt().setExpirationTime("5m").sign(privateKey);

    expect(await verifyAccessToken(await sign({ aud: "aud", iss: issuer }), { issuer, audience: "aud", keys })).toBe("admin@soma.co");
    await expect(verifyAccessToken(await sign({ aud: "otra", iss: issuer }), { issuer, audience: "aud", keys })).rejects.toThrow();
    await expect(verifyAccessToken(await sign({ aud: "aud", iss: "https://otro.cloudflareaccess.com" }), { issuer, audience: "aud", keys })).rejects.toThrow();
  });
});

describe("sitio de ventas", () => {
  it("simula sin sesion", async () => {
    const r = await post("/api/sales/simulation", { area_m2: 100, units: 2, tier: "standard", acquisition_cost: 300_000_000, monthly_rent_per_unit: 2_000_000 });
    expect(r.status).toBe(200);
    expect(r.body.construction.base).toBe(260_000_000);
  });

  it("valida la entrada con 422", async () => {
    expect((await post("/api/sales/simulation", { area_m2: 0, units: 2, tier: "standard" })).status).toBe(422);
    expect((await post("/api/sales/simulation", { area_m2: 10, units: 2, tier: "lujo" })).status).toBe(422);
  });
});

describe("auditoria", () => {
  it("registra quien cambio que, sin contenido del usuario", async () => {
    await post("/api/admin/proyectos", { nombre: "Auditado", fecha_inicio: "2026-02-01" });
    const row = await env.DB.prepare("SELECT event_type, actor, details FROM audit_events WHERE event_type = 'project.created' ORDER BY id DESC").first<{ actor: string; details: string }>();
    expect(row?.actor).toBe("dev@local");
    expect(Object.keys(JSON.parse(row!.details))).toEqual(["proyecto_id"]);
  });
});

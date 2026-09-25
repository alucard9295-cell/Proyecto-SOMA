import { expect, test } from "@playwright/test";

// En local, .dev.vars pone ENVIRONMENT=development y el Worker usa un actor de
// desarrollo; en produccion /admin esta detras de Cloudflare Access y esta
// prueba no aplica (E2E_BASE_URL apunta siempre a un servidor local).
const secciones = ["/admin", "/admin/insumos", "/admin/apus", "/admin/simulador", "/admin/revision"];

for (const ruta of secciones) {
  test(`${ruta} carga sin errores`, async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    const fallidas: string[] = [];
    page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) fallidas.push(`${r.status()} ${r.url()}`); });

    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible();
    expect(fallidas).toEqual([]);
    expect(errores).toEqual([]);
  });
}

// Las categorias salen de domain/costing.ts, la misma lista que valida el Worker.
test("los selectores usan las categorias del dominio", async ({ page }) => {
  await page.goto("/admin/apus");
  await expect(page.getByLabel("Categoría").locator("option")).toHaveText(["Excavaciones", "Obra gris", "Acabados", "Instalaciones"]);
  await page.goto("/admin/insumos");
  await expect(page.getByLabel("Filtrar por categoría").locator("option")).toHaveText(["Todas las categorías", "material", "mano_obra", "equipo", "transporte", "servicio_terceros"]);
});

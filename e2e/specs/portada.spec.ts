import { expect, test } from "@playwright/test";

// CU-01: un visitante obtiene una cifra preliminar del simulador.
test("el simulador calcula un escenario en pesos", async ({ page }) => {
  const errores: string[] = [];
  page.on("pageerror", (e) => errores.push(e.message));

  await page.goto("/");
  const simulador = page.locator(".sales-simulator");
  await simulador.scrollIntoViewIfNeeded();
  await simulador.getByLabel("Área (m²)").fill("120");
  await simulador.getByLabel("Unidades").fill("2");

  const respuesta = page.waitForResponse((r) => r.url().includes("/api/sales/simulation"));
  await simulador.getByRole("button", { name: /Ver escenario/ }).click();
  expect((await respuesta).status()).toBe(200);

  const inversion = simulador.locator(".sales-kpis > div", { hasText: "Inversión total" }).locator("strong");
  await expect(inversion).toContainText("$");
  expect(errores).toEqual([]);
});

test("la portada muestra el contacto con el mapa", async ({ page }) => {
  await page.goto("/");
  const contacto = page.locator("#contacto");
  await contacto.scrollIntoViewIfNeeded();
  await expect(contacto.getByRole("heading", { name: /Visítanos/ })).toBeVisible();
  await expect(contacto.locator("iframe")).toHaveAttribute("title", /Villa Luz/);
});

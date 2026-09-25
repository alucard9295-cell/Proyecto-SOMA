// Captura de una seccion de la pagina por CDP, al ancho pedido. Requiere Chrome en el 9222.
// Uso: node tools/e2e/seccion.mjs <url> "<selector>" <salida.png> [ancho=1262]
// Imprime tambien los errores de consola y las violaciones de CSP (p. ej. un iframe bloqueado).
import { writeFileSync } from "node:fs";
const [,, url, selector, salida, ancho = "1262"] = process.argv;
const tab = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let n = 0; const pend = new Map(); const errores = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errores.push(m.params.entry.text);
});
const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await cmd("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
const esperar = async (x, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x)) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };
await cmd("Page.enable"); await cmd("Log.enable");
await cmd("Emulation.setDeviceMetricsOverride", { width: Number(ancho), height: 900, deviceScaleFactor: 1, mobile: Number(ancho) < 600 });
await cmd("Page.navigate", { url });
const sel = JSON.stringify(selector);
if (!(await esperar(`!!document.querySelector(${sel})`))) { console.log("no aparece:", selector); process.exit(1); }
await ev(`document.querySelector(${sel}).scrollIntoView()`);
await new Promise((r) => setTimeout(r, 2500)); // iframes y lazy
const caja = await ev(`(() => { const r = document.querySelector(${sel}).getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
const foto = await cmd("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...caja, scale: 1 } });
writeFileSync(salida, Buffer.from(foto.result.data, "base64"));
console.log(errores.length ? `errores de consola:\n${errores.join("\n")}` : "sin errores de consola");
await cmd("Target.closeTarget", { targetId: tab.id }).catch(() => {}); process.exit(0);

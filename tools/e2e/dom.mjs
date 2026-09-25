// Capturas del chat por CDP: recien abierto (sugerencias) y mientras corre el
// agente (spinner). Requiere Chrome en el 9222.
// Uso: node tools/e2e/dom.mjs <url> <prefijo-salida>  -> <prefijo>-abierto.png, <prefijo>-corriendo.png
import { writeFileSync } from "node:fs";
const [,, url, prefijo] = process.argv;
const tab = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let n = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await cmd("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
const esperar = async (x, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x)) return true; await new Promise((r) => setTimeout(r, 150)); } return false; };
const foto = async (nombre) => writeFileSync(`${prefijo}-${nombre}.png`, Buffer.from((await cmd("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
await cmd("Page.enable"); await cmd("Emulation.setDeviceMetricsOverride", { width: 1262, height: 804, deviceScaleFactor: 1, mobile: false });
await cmd("Page.navigate", { url }); await esperar("!!document.querySelector('.asistente-lanzador')");
await ev("document.querySelector('.asistente-lanzador').click()"); await esperar("!!document.querySelector('[data-testid=copilot-suggestion]')");
await new Promise((r) => setTimeout(r, 800)); await foto("abierto");
await ev("document.querySelectorAll('[data-testid=copilot-suggestion]')[2].click()");
console.log("spinner visto:", await esperar("!!document.querySelector('.chat-pensando')", 10000)); await foto("corriendo");
await cmd("Target.closeTarget", { targetId: tab.id }).catch(() => {}); process.exit(0);

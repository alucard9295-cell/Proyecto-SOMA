// E2E del asesor por CDP: abre la pagina, pregunta y captura. Requiere Chrome con
// --remote-debugging-port=9222. Uso: node tools/e2e/asesor.mjs <url> "<pregunta>" <salida.png>
// ESPERA=ms ajusta cuanto se espera la respuesta (por defecto 25000).
const [,, url, pregunta, salida] = process.argv;
const tabs = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tabs.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0; const pend = new Map(); const logs = []; const bodies = new Map(); const fallos = [];
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === "Runtime.consoleAPICalled" || m.method === "Runtime.exceptionThrown") logs.push(JSON.stringify(m.params).slice(0, 300)); if (m.method === "Network.requestWillBeSent" && m.params.request.url.includes("/api/")) bodies.set(m.params.requestId, m.params.request.postData); if (m.method === "Network.responseReceived" && m.params.response.url.includes("/api/")) { logs.push(`NET ${m.params.response.status} ${m.params.response.url}`); if (m.params.response.status >= 400) fallos.push([m.params.requestId]); } });
const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const esperar = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return true; await new Promise((r) => setTimeout(r, 500)); } return false; };
await cmd("Runtime.enable"); await cmd("Network.enable"); await cmd("Page.enable");
await cmd("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI+' '+e.sourceFile+':'+e.lineNumber))" });
await cmd("Page.navigate", { url });
await esperar("!!document.querySelector('.asistente-lanzador')", 30000);
const antes = await ev("performance.getEntriesByType('resource').filter(r=>/copilot|Asistente/i.test(r.name)).length");
await ev("document.querySelector('.asistente-lanzador').click()");
const abierto = await esperar("!!document.querySelector('textarea')", 30000);
await ev("document.querySelector('textarea').focus()");
await cmd("Input.insertText", { text: pregunta });
await cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
await cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await new Promise((r) => setTimeout(r, Number(process.env.ESPERA ?? 25000)));
const estado = await ev(`JSON.stringify({ path: location.pathname, form: [...document.querySelectorAll('.sales-simulator input, .sales-simulator select')].map(e=>e.name+'='+e.value), chat: (document.querySelector('[class*=copilot]')?.closest('body')?.innerText||'').split('\n').filter(Boolean).slice(-12) })`);
console.log("CSP", await ev("JSON.stringify(window.__csp)"));
const shot = await cmd("Page.captureScreenshot", { format: "png" });
(await import("node:fs")).writeFileSync(salida, Buffer.from(shot.result.data, "base64"));
for (const [rid] of fallos) { const b = await cmd("Network.getResponseBody", { requestId: rid }); console.log("FALLO", b.result?.body?.slice(0, 600), " REQ", (bodies.get(rid) || "").slice(0, 3000)); }
console.log(JSON.stringify({ chunksAntesDelClic: antes, abierto }), "\n", estado, "\n", logs.slice(-15).join("\n"));
await cmd("Target.closeTarget", { targetId: tabs.id }).catch(() => {}); process.exit(0);

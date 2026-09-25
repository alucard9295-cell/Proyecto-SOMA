// Mismo origen que el Worker: sin URL base, sin CORS y sin token en el
// navegador. La identidad la pone Cloudflare Access en una cookie que el
// navegador envia solo (ADR-010).

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function request(path, { json, ...options } = {}) {
  const init = json === undefined ? options : { ...options, headers: { "Content-Type": "application/json", ...options.headers }, body: JSON.stringify(json) };
  const response = await fetch(path, init);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new ApiError(payload?.detail || "La API no pudo completar la solicitud.", response.status);
  return payload;
}

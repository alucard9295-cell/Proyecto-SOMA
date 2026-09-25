/**
 * Error con estado HTTP. Los servicios lo lanzan sin saber de Hono; el
 * manejador global de app.ts lo traduce a `{detail, request_id}`.
 */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message: string) => new HttpError(404, message);
export const invalid = (message: string) => new HttpError(422, message);

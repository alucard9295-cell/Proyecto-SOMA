import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { HttpError } from "../errors";

/** zValidator que responde 422 con un mensaje legible, como el resto del API. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join(".") || "cuerpo"}: ${i.message}`).join("; ");
      throw new HttpError(422, `Datos invalidos. ${detail}`);
    }
  });

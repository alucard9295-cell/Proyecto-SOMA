/**
 * Fabrica de repositorios por peticion. Es el unico "contenedor" del API: una
 * funcion, no un framework de inyeccion. Los servicios reciben `Repos` y los
 * tests pueden pasar la misma base D1 local.
 */
import { apusRepository } from "./apus";
import { auditRepository } from "./audit";
import { documentsRepository } from "./documents";
import { projectsRepository } from "./projects";
import { summaryRepository } from "./summary";
import { suppliesRepository } from "./supplies";
import { usoAsesorRepository } from "./usoAsesor";

export function repos(db: D1Database) {
  return {
    apus: apusRepository(db),
    audit: auditRepository(db),
    documents: documentsRepository(db),
    projects: projectsRepository(db),
    summary: summaryRepository(db),
    supplies: suppliesRepository(db),
    usoAsesor: usoAsesorRepository(db),
  };
}

export type Repos = ReturnType<typeof repos>;

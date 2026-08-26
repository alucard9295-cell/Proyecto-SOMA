"""Ingesta de facturas: de una carpeta de PDFs a filas de `facturas`.

Se ejecuta a mano o desde un cron de la plataforma:

    uv run --directory api python -m soma_api.jobs.ingest ../facturas_db_pdf

El comando es el mismo en los dos casos. Un cron solo *agenda* esto; por eso
probar no cuesta nada y la programacion es lo ultimo que se enciende.

Idempotente por `content_hash`: volver a pasar la misma carpeta no duplica una
sola factura. Una factura cuyas cifras no cierran **no entra** a `facturas`;
queda como job en `needs_review` con el motivo escrito. Ver ADR-006 seccion 6.
"""

import argparse
import logging
from pathlib import Path

from ..config import load_settings
from ..database import init_db
from ..invoice_parsing import DocumentoCrudo, FacturaExtraida, extraer
from ..observability import configure_logging
from ..repositories import unit_of_work
from .context import run_id


logger = logging.getLogger(__name__)

# Cota por corrida: una ejecucion siempre debe terminar. Lo que sobre lo toma
# la siguiente. Sin cota, un lote grande convierte al cron en un proceso colgado.
LIMITE_POR_CORRIDA = 20


def _cabecera(factura: FacturaExtraida) -> tuple:
    """Fila de `facturas`. El dinero va como texto: conserva el Decimal exacto.

    `total_pagar` es REAL desde la migracion 4 y se mantiene por compatibilidad
    con lo que ya lee esa columna; las columnas nuevas guardan la cifra fiel.
    """
    return (
        factura.emisor_nombre or "Desconocido",
        factura.emisor_nit,
        factura.cufe[:20] if factura.cufe else None,
        factura.fecha,
        float(factura.total) if factura.total is not None else 0,
        factura.cufe,
        str(factura.subtotal) if factura.subtotal is not None else None,
        str(factura.iva) if factura.iva is not None else None,
        str(factura.total) if factura.total is not None else None,
    )


def _items(factura: FacturaExtraida) -> list[tuple]:
    return [
        (
            item.descripcion or "(sin descripcion)",
            item.unidad,
            float(item.cantidad) if item.cantidad is not None else None,
            float(item.valor_unitario) if item.valor_unitario is not None else None,
            float(item.total_efectivo()) if item.total_efectivo() is not None else None,
        )
        for item in factura.items
    ]


def procesar_carpeta(
    carpeta: Path,
    database_path: str,
    limite: int = LIMITE_POR_CORRIDA,
    recursivo: bool = False,
) -> dict:
    """Procesa hasta `limite` PDFs. Devuelve el conteo por resultado.

    Con `recursivo`, recorre subcarpetas: el archivo historico esta organizado
    por mes, y una de esas carpetas contiene una copia anidada de si misma. No
    hace falta limpiarla a mano — el `content_hash` la reconoce como repetida.
    """
    corrida = run_id()
    resumen = {"nuevos": 0, "repetidos": 0, "validados": 0, "revision": 0}

    patron = "**/*.pdf" if recursivo else "*.pdf"
    archivos = sorted(carpeta.glob(patron))[:limite]
    logger.info(
        "ingesta iniciada",
        extra={"request_id": corrida, "carpeta": str(carpeta), "archivos": len(archivos)},
    )

    for ruta in archivos:
        documento = DocumentoCrudo.desde_archivo(ruta)
        with unit_of_work(database_path) as uow:
            documento_id, es_nuevo = uow.documents.registrar_documento(
                storage_key=str(ruta),
                content_hash=documento.content_hash,
                nombre_original=documento.nombre_original,
                mime=documento.mime,
                bytes_totales=documento.bytes,
            )
            if not es_nuevo:
                resumen["repetidos"] += 1
                logger.info(
                    "documento ya ingerido, se omite",
                    extra={"request_id": corrida, "archivo": documento.nombre_original},
                )
                continue

            resumen["nuevos"] += 1
            job_id = uow.documents.crear_job(documento_id, request_id=corrida)

        factura = extraer(documento)

        with unit_of_work(database_path) as uow:
            if not factura.veredicto.valida:
                resumen["revision"] += 1
                uow.documents.cerrar_job(
                    job_id,
                    estado="needs_review",
                    motivo=" ".join(factura.veredicto.motivos)[:500],
                    parser=factura.parser,
                )
                logger.warning(
                    "factura a revision",
                    extra={
                        "request_id": corrida,
                        "archivo": documento.nombre_original,
                        "motivos": list(factura.veredicto.motivos),
                    },
                )
                continue

            factura_id = uow.documents.guardar_factura(
                documento_id=documento_id,
                cabecera=_cabecera(factura),
                items=_items(factura),
            )
            uow.documents.cerrar_job(
                job_id, estado="indexed", parser=factura.parser, factura_id=factura_id
            )
            resumen["validados"] += 1
            logger.info(
                "factura registrada",
                extra={
                    "request_id": corrida,
                    "archivo": documento.nombre_original,
                    "factura_id": factura_id,
                    "items": len(factura.items),
                    "total": str(factura.total),
                },
            )

    logger.info("ingesta terminada", extra={"request_id": corrida, **resumen})
    return resumen


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingesta de facturas de proveedor en PDF")
    parser.add_argument("carpeta", help="Carpeta con los PDF a procesar")
    parser.add_argument("--limite", type=int, default=LIMITE_POR_CORRIDA)
    parser.add_argument(
        "--recursivo", action="store_true", help="Recorrer tambien las subcarpetas"
    )
    args = parser.parse_args()

    carpeta = Path(args.carpeta)
    if not carpeta.is_dir():
        raise SystemExit(f"La carpeta no existe: {carpeta}")

    settings = load_settings()
    configure_logging(settings.log_level)
    init_db(settings.database_path)
    resumen = procesar_carpeta(
        carpeta, settings.database_path, args.limite, recursivo=args.recursivo
    )

    print(
        f"nuevos={resumen['nuevos']} repetidos={resumen['repetidos']} "
        f"registradas={resumen['validados']} en_revision={resumen['revision']}"
    )


if __name__ == "__main__":
    main()

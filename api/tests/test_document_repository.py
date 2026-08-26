"""Persistencia del pipeline de documentos.

No dependen de un PDF: las facturas de prueba son documentos comerciales
reales y viven fuera del repositorio. Lo que se verifica aqui es que lo que el
parser produce aterriza en la columna correcta y que el pipeline es idempotente.
"""

from decimal import Decimal

from soma_api.database import init_db
from soma_api.repositories import unit_of_work


CABECERA = (
    "FERRETERIA CONSTRUCTIVA Y DEPOSITO DE MATERIALES SAS",
    "901649012",
    "FYD - 2482",
    "06/02/2026",
    736700.0,
    "c7f62daf0e059f98bb414923d4c7f7b8f3c9a9b9",
    "666975.00",
    "69725.00",
    "736700.00",
)

ITEMS = [
    ("Cemento Tequendama Gris 50kg", "EA", 10.0, 28571.0, 285714.0),
    ("MALLA VENA 0.60x2mt Cal. 34", "EA", 3.0, 9244.0, 27731.0),
]


def _base(tmp_path):
    database_path = str(tmp_path / "soma.sqlite3")
    init_db(database_path)
    return database_path


def test_cada_dato_aterriza_en_su_columna(tmp_path):
    """Regresion: la tupla y la lista de columnas del INSERT no coincidian.

    El subtotal terminaba guardado en `cufe` y el `documento_id` en `total`.
    SQLite acepta eso sin una sola queja porque los tipos le dan igual, asi que
    solo se ve leyendo las filas.
    """
    database_path = _base(tmp_path)
    with unit_of_work(database_path) as uow:
        documento_id, _ = uow.documents.registrar_documento(
            storage_key="inbox/factura.pdf",
            content_hash="a" * 64,
            nombre_original="factura.pdf",
            mime="application/pdf",
            bytes_totales=22905,
        )
        factura_id = uow.documents.guardar_factura(
            documento_id=documento_id, cabecera=CABECERA, items=ITEMS
        )

    with unit_of_work(database_path) as uow:
        fila = uow.documents.factura_por_cufe(CABECERA[5])

    assert fila is not None
    assert fila["factura_id"] == factura_id
    assert fila["proveedor_nit"] == "901649012"
    assert fila["documento_id"] == documento_id
    assert Decimal(fila["subtotal"]) == Decimal("666975.00")
    assert Decimal(fila["iva"]) == Decimal("69725.00")
    assert Decimal(fila["total"]) == Decimal("736700.00")


def test_el_mismo_hash_no_duplica_el_documento(tmp_path):
    """Idempotencia: el cron puede correr de mas sin ensuciar la base."""
    database_path = _base(tmp_path)
    with unit_of_work(database_path) as uow:
        primero, nuevo_primero = uow.documents.registrar_documento(
            storage_key="inbox/f.pdf", content_hash="b" * 64,
            nombre_original="f.pdf", mime="application/pdf", bytes_totales=100,
        )
        segundo, nuevo_segundo = uow.documents.registrar_documento(
            storage_key="otra/ruta/f.pdf", content_hash="b" * 64,
            nombre_original="f.pdf", mime="application/pdf", bytes_totales=100,
        )

    assert nuevo_primero is True
    assert nuevo_segundo is False
    assert primero == segundo

    with unit_of_work(database_path) as uow:
        total = uow.connection.execute("SELECT COUNT(*) FROM documentos_raw").fetchone()[0]
    assert total == 1


def test_los_items_quedan_ligados_a_su_factura(tmp_path):
    database_path = _base(tmp_path)
    with unit_of_work(database_path) as uow:
        documento_id, _ = uow.documents.registrar_documento(
            storage_key="inbox/f.pdf", content_hash="c" * 64,
            nombre_original="f.pdf", mime="application/pdf", bytes_totales=100,
        )
        factura_id = uow.documents.guardar_factura(
            documento_id=documento_id, cabecera=CABECERA, items=ITEMS
        )

    with unit_of_work(database_path) as uow:
        filas = uow.connection.execute(
            "SELECT descripcion_cruda, cantidad, valor_total FROM factura_items WHERE factura_id=?",
            (factura_id,),
        ).fetchall()

    assert len(filas) == 2
    assert filas[0]["descripcion_cruda"] == "Cemento Tequendama Gris 50kg"
    assert filas[1]["valor_total"] == 27731.0


def test_un_job_en_revision_no_deja_factura(tmp_path):
    """Una factura que no cierra no entra a la fuente de verdad numerica."""
    database_path = _base(tmp_path)
    with unit_of_work(database_path) as uow:
        documento_id, _ = uow.documents.registrar_documento(
            storage_key="inbox/rara.pdf", content_hash="d" * 64,
            nombre_original="rara.pdf", mime="application/pdf", bytes_totales=100,
        )
        job_id = uow.documents.crear_job(documento_id, request_id="corrida-1")
        uow.documents.cerrar_job(
            job_id, estado="needs_review",
            motivo="La suma de los items no coincide con el subtotal.",
            parser="SODIMAC COLOMBIA S.A.",
        )

    with unit_of_work(database_path) as uow:
        pendientes = uow.documents.jobs_por_estado("needs_review")
        facturas = uow.connection.execute("SELECT COUNT(*) FROM facturas").fetchone()[0]

    assert facturas == 0
    assert len(pendientes) == 1
    assert pendientes[0]["intentos"] == 1
    assert pendientes[0]["nombre_original"] == "rara.pdf"
    assert "no coincide" in pendientes[0]["motivo"]


def test_las_migraciones_siguen_siendo_idempotentes(tmp_path):
    """La migracion 7 usa ALTER TABLE, que en SQLite no tiene IF NOT EXISTS."""
    database_path = str(tmp_path / "soma.sqlite3")
    init_db(database_path)
    init_db(database_path)

    with unit_of_work(database_path) as uow:
        columnas = {
            row[1] for row in uow.connection.execute("PRAGMA table_info(facturas)")
        }
    assert {"documento_id", "cufe", "subtotal", "iva", "total"} <= columnas

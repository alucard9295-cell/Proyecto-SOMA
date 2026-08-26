"""Pantalla de revision: lo que no cerro tiene que ser visible y accionable."""

from fastapi.testclient import TestClient

from soma_api.database import init_db, upsert_user
from soma_api.main import app
from soma_api.repositories import unit_of_work
from soma_api.security import hash_password


EXTRACCION = {
    "emisor_nombre": "SODIMAC COLOMBIA S.A.",
    "emisor_nit": "800242106",
    "cufe": "10e603072e27a548",
    "fecha": "2026/02/28",
    "subtotal": "73361.34",
    "iva": "13938.66",
    "total": "87300.00",
    "items": [
        {"descripcion": "PISO CERAMICA GINEVRA", "unidad": "UN", "cantidad": "1",
         "valor_unitario": "73361.34", "valor_total": "73361.34"},
    ],
}


def _sesion(tmp_path, monkeypatch):
    database_path = tmp_path / "soma.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(database_path))
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes-long")
    init_db(str(database_path))
    upsert_user(str(database_path), "admon", hash_password("1234"))
    client = TestClient(app)
    respuesta = client.post("/api/admin/login", json={"username": "admon", "password": "1234"})
    return client, {"Authorization": f"Bearer {respuesta.json()['token']}"}, str(database_path)


def _job_en_revision(database_path, *, extraccion=EXTRACCION, motivo="Hay items sin importe legible."):
    with unit_of_work(database_path) as uow:
        documento_id, _ = uow.documents.registrar_documento(
            storage_key="inbox/f.pdf", content_hash="e" * 64,
            nombre_original="fv0800242106.pdf", mime="application/pdf", bytes_totales=37405,
        )
        job_id = uow.documents.crear_job(documento_id, request_id="corrida-1")
        uow.documents.cerrar_job(
            job_id, estado="needs_review", motivo=motivo,
            parser="SODIMAC COLOMBIA S.A.", extraccion=extraccion,
        )
        return job_id


def test_la_lista_muestra_lo_que_no_cerro(tmp_path, monkeypatch):
    client, headers, database_path = _sesion(tmp_path, monkeypatch)
    _job_en_revision(database_path)

    cuerpo = client.get("/api/admin/documentos/revision", headers=headers).json()

    assert cuerpo["count"] == 1
    fila = cuerpo["items"][0]
    assert fila["archivo"] == "fv0800242106.pdf"
    assert fila["emisor"] == "SODIMAC COLOMBIA S.A."
    assert fila["items"] == 1
    assert "sin importe legible" in fila["motivo"]


def test_el_detalle_trae_los_renglones_para_confirmar(tmp_path, monkeypatch):
    """El valor de revisar esta en confirmar items ya leidos, no en teclearlos.

    Si el detalle no devolviera la extraccion, la pantalla solo podria decir
    "fallo" y la persona tendria que copiar la factura entera a mano.
    """
    client, headers, database_path = _sesion(tmp_path, monkeypatch)
    job_id = _job_en_revision(database_path)

    detalle = client.get(f"/api/admin/documentos/revision/{job_id}", headers=headers).json()

    assert detalle["extraccion"]["total"] == "87300.00"
    assert len(detalle["extraccion"]["items"]) == 1
    assert detalle["extraccion"]["items"][0]["descripcion"] == "PISO CERAMICA GINEVRA"


def test_un_documento_sin_extraccion_no_rompe_la_pantalla(tmp_path, monkeypatch):
    """Los jobs anteriores a la migracion 8 no tienen extraccion guardada."""
    client, headers, database_path = _sesion(tmp_path, monkeypatch)
    job_id = _job_en_revision(database_path, extraccion=None)

    fila = client.get("/api/admin/documentos/revision", headers=headers).json()["items"][0]
    detalle = client.get(f"/api/admin/documentos/revision/{job_id}", headers=headers).json()

    assert fila["items"] == 0
    assert fila["emisor"] is None
    assert detalle["extraccion"] is None


def test_un_job_inexistente_da_404(tmp_path, monkeypatch):
    client, headers, _ = _sesion(tmp_path, monkeypatch)
    respuesta = client.get("/api/admin/documentos/revision/999", headers=headers)
    assert respuesta.status_code == 404
    assert "no encontrado" in respuesta.json()["detail"].lower()


def test_la_revision_exige_sesion(tmp_path, monkeypatch):
    client, _, _ = _sesion(tmp_path, monkeypatch)
    assert client.get("/api/admin/documentos/revision").status_code == 401

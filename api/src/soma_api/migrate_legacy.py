import argparse
import sqlite3
from pathlib import Path

from .database import init_db


def migrate(source_path: str, target_path: str) -> None:
    init_db(target_path)
    source = sqlite3.connect(source_path)
    source.row_factory = sqlite3.Row
    target = sqlite3.connect(target_path)
    target.row_factory = sqlite3.Row
    try:
        target.execute("PRAGMA foreign_keys = ON")
        supply_map = {}
        for row in source.execute("SELECT insumo_id, nombre_normalizado, categoria, unidad_estandar FROM insumos_maestros"):
            target.execute("INSERT OR IGNORE INTO insumos_maestros (nombre_normalizado, categoria, unidad_estandar) VALUES (?,?,?)", (row["nombre_normalizado"], row["categoria"], row["unidad_estandar"]))
            new_row = target.execute("SELECT insumo_id FROM insumos_maestros WHERE nombre_normalizado=?", (row["nombre_normalizado"],)).fetchone()
            supply_map[row["insumo_id"]] = new_row["insumo_id"]
        invoice_map = {}
        for row in source.execute("SELECT factura_id, proveedor_nombre, proveedor_nit, numero_factura, fecha_factura, total_pagar FROM facturas"):
            target.execute("INSERT INTO facturas (proveedor_nombre, proveedor_nit, numero_factura, fecha_factura, total_pagar) VALUES (?,?,?,?,?)", (row["proveedor_nombre"], row["proveedor_nit"], row["numero_factura"], row["fecha_factura"], row["total_pagar"]))
            invoice_map[row["factura_id"]] = target.execute("SELECT last_insert_rowid()").fetchone()[0]
        for row in source.execute("SELECT factura_id, descripcion_cruda, unidad_medida, cantidad, valor_unitario, valor_total, insumo_id FROM factura_items"):
            target.execute("INSERT INTO factura_items (factura_id, descripcion_cruda, unidad_medida, cantidad, valor_unitario, valor_total, insumo_id) VALUES (?,?,?,?,?,?,?)", (invoice_map[row["factura_id"]], row["descripcion_cruda"], row["unidad_medida"], row["cantidad"], row["valor_unitario"], row["valor_total"], supply_map.get(row["insumo_id"])))
        apu_map = {}
        for row in source.execute("SELECT apu_id, nombre_partida, unidad, descripcion, categoria, administracion_pct, imprevistos_pct, utilidad_pct, iva_pct, iva_base FROM apus"):
            target.execute("INSERT INTO apus (nombre_partida, unidad, descripcion, categoria, administracion_pct, imprevistos_pct, utilidad_pct, iva_pct, iva_base) VALUES (?,?,?,?,?,?,?,?,?)", (row["nombre_partida"], row["unidad"], row["descripcion"], row["categoria"], row["administracion_pct"], row["imprevistos_pct"], row["utilidad_pct"], row["iva_pct"], row["iva_base"]))
            apu_map[row["apu_id"]] = target.execute("SELECT last_insert_rowid()").fetchone()[0]
        for row in source.execute("SELECT apu_id, insumo_id, categoria, rendimiento, desperdicio_pct, precio_unitario FROM apu_detalle"):
            target.execute("INSERT INTO apu_detalle (apu_id, insumo_id, categoria, rendimiento, desperdicio_pct, precio_unitario) VALUES (?,?,?,?,?,?)", (apu_map[row["apu_id"]], supply_map[row["insumo_id"]], row["categoria"], row["rendimiento"], row["desperdicio_pct"], row["precio_unitario"]))
        target.commit()
    finally:
        source.close()
        target.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Migra el catalogo y APUs del control plane anterior.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", default="data/soma.sqlite3")
    args = parser.parse_args()
    migrate(str(Path(args.source)), str(Path(args.target)))
    print(f"Migracion completada: {args.target}")


if __name__ == "__main__":
    main()

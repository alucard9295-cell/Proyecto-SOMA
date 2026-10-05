"""Linea base del extractor Python: una fila por PDF, para comparar el port a TS."""
import json, sys
from pathlib import Path
from soma_api.invoice_parsing import DocumentoCrudo, extraer

raiz = Path(sys.argv[1])
salida = []
vistos = set()
for ruta in sorted(raiz.glob("**/*.pdf")):
    doc = DocumentoCrudo.desde_archivo(ruta)
    if doc.content_hash in vistos:
        continue
    vistos.add(doc.content_hash)
    f = extraer(doc)
    s = lambda v: None if v is None else str(v)
    salida.append({
        "hash": doc.content_hash, "archivo": str(ruta.relative_to(raiz)).replace("\\", "/"),
        "estado": f.estado, "motivos": list(f.veredicto.motivos),
        "emisor_nit": f.emisor_nit, "cufe": f.cufe, "fecha": f.fecha,
        "subtotal": s(f.subtotal), "iva": s(f.iva), "total": s(f.total),
        "items": [{"descripcion": i.descripcion, "cantidad": s(i.cantidad), "unidad": i.unidad,
                   "valor_unitario": s(i.valor_unitario), "valor_total": s(i.total_efectivo())} for i in f.items],
    })
json.dump(salida, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(salida), "documentos;", sum(x["estado"] == "validated" for x in salida), "validados;",
      sum(1 for x in salida if x["emisor_nit"]), "con emisor;", sum(len(x["items"]) for x in salida), "items")

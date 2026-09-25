import { useEffect, useState } from "react";
import { request } from "../lib/api.js";
import { money } from "../lib/format.js";
import { SUPPLY_CATEGORIES } from "../../domain/costing";
import ModuleHelper from "./ModuleHelper.jsx";


export default function Supplies() {
  const [items, setItems] = useState([]); const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function load() {
    setBusy(true); setMessage("");
    try { const params = new URLSearchParams(); if (search.trim()) params.set("search", search.trim()); if (category) params.set("category", category); const data = await request(`/api/admin/supplies?${params}`); setItems(data.items || []); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [category]);
  function edit(id, field, value) { setItems((current) => current.map((item) => item.insumo_id === id ? { ...item, [field]: value } : item)); }
  async function save(item) {
    setBusy(true); setMessage("");
    try { await request(`/api/admin/supplies/${item.insumo_id}`, { method: "PUT", json: ({ nombre_normalizado: item.nombre_normalizado, categoria: item.categoria, unidad_estandar: item.unidad_estandar || null }) }); setMessage(`Insumo ${item.insumo_id} actualizado.`); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <div className="panel-view module-view"><div className="module-heading"><span className="eyebrow">02 / CATÁLOGO</span><h1>Ordenar los<br /><em>insumos.</em></h1><p>Corrige el nombre canónico, la categoría y la unidad que usarán las facturas y los futuros APUs.</p></div><ModuleHelper title="Normalización segura">Editar un insumo no cambia las facturas originales ni sus precios históricos. Solo corrige el catálogo maestro al que apuntan sus ítems.</ModuleHelper><div className="supply-toolbar"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Buscar por nombre o alias..." aria-label="Buscar insumos" /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoría"><option value="">Todas las categorías</option>{SUPPLY_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select><button className="button button-dark" onClick={load} disabled={busy}>{busy ? "Cargando…" : "Buscar"}</button></div>{message && <div className="feedback-card" role="status">{message}</div>}<section className="supplies-table-wrap"><table className="supplies-table"><thead><tr><th>Insumo normalizado</th><th>Categoría</th><th>Unidad</th><th>Precio promedio</th><th>Historial</th><th>Acción</th></tr></thead><tbody>{items.map((item) => <tr key={item.insumo_id}><td><input value={item.nombre_normalizado} onChange={(event) => edit(item.insumo_id, "nombre_normalizado", event.target.value)} aria-label={`Nombre del insumo ${item.insumo_id}`} /><small>{item.alias_count || 0} alias · {(item.aliases || []).slice(0, 2).map((alias) => alias.texto_original).join(" · ") || "sin alias"}</small></td><td><select value={item.categoria} onChange={(event) => edit(item.insumo_id, "categoria", event.target.value)} aria-label={`Categoría del insumo ${item.insumo_id}`}>{SUPPLY_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></td><td><input value={item.unidad_estandar || ""} onChange={(event) => edit(item.insumo_id, "unidad_estandar", event.target.value)} placeholder="und" aria-label={`Unidad del insumo ${item.insumo_id}`} /></td><td>{item.price_average == null ? "—" : money(item.price_average)}<small>{item.price_min == null ? "sin compras" : `${money(item.price_min)} – ${money(item.price_max)}`}</small></td><td>{item.purchase_count || 0} compras<small>{item.last_purchase || "sin fecha"}</small></td><td><button className="button" onClick={() => save(item)} disabled={busy}>Guardar</button></td></tr>)}</tbody></table>{!busy && !items.length && <p className="empty-state">No hay insumos que coincidan con la búsqueda.</p>}</section></div>;
}

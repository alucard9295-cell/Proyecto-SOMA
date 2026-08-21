import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8767";

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : await response.blob();
  if (!response.ok) throw new Error(payload.detail || "La API no pudo completar la solicitud.");
  return payload;
}

export default function ApuEditor({ token }) {
  const [apus, setApus] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [newSupply, setNewSupply] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const headers = { Authorization: `Bearer ${token}` };

  async function load() {
    try {
      const [apuData, supplyData] = await Promise.all([
        request("/api/admin/apus", { headers }),
        request("/api/admin/supplies", { headers }),
      ]);
      setApus(apuData.items || []);
      setSupplies(supplyData.items || []);
    } catch (error) { setMessage(error.message); }
  }

  useEffect(() => { load(); }, []);

  function select(id) {
    const apu = apus.find((item) => item.apu_id === Number(id));
    setSelectedId(id);
    setDraft(apu ? JSON.parse(JSON.stringify(apu)) : null);
    setNewSupply("");
    setMessage("");
  }

  function edit(field, value) { setDraft((current) => ({ ...current, [field]: value })); }
  function editDetail(index, field, value) {
    setDraft((current) => ({ ...current, detalles: current.detalles.map((detail, detailIndex) => detailIndex === index ? { ...detail, [field]: value } : detail) }));
  }
  function addSupply() {
    const supply = supplies.find((item) => item.insumo_id === Number(newSupply));
    if (!supply) return;
    setDraft((current) => ({ ...current, detalles: [...current.detalles, { insumo_id: supply.insumo_id, categoria: supply.categoria, nombre_normalizado: supply.nombre_normalizado, unidad_estandar: supply.unidad_estandar, rendimiento: 1, desperdicio_pct: 0, precio_manual: supply.categoria === "mano_obra" ? Number(localStorage.getItem("soma-labor-price")) || null : null }] }));
    setNewSupply("");
  }
  function removeDetail(index) { setDraft((current) => ({ ...current, detalles: current.detalles.filter((_, detailIndex) => detailIndex !== index) })); }

  async function save() {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const data = await request(`/api/admin/apus/${draft.apu_id}`, {
        method: "PUT", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_partida: draft.nombre_partida, unidad: draft.unidad, categoria: draft.categoria || "obra_gris", descripcion: draft.descripcion || "", administracion_pct: Number(draft.administracion_pct || 0), imprevistos_pct: Number(draft.imprevistos_pct || 0), utilidad_pct: Number(draft.utilidad_pct || 0), iva_pct: Number(draft.iva_pct || 0), iva_base: draft.iva_base || "utilidad", detalles: draft.detalles.map((detail) => ({ insumo_id: Number(detail.insumo_id), categoria: detail.categoria, rendimiento: Number(detail.rendimiento), desperdicio_pct: Number(detail.desperdicio_pct || 0), precio_unitario: detail.precio_manual == null || detail.precio_manual === "" ? null : Number(detail.precio_manual) })) }),
      });
      setApus((current) => current.map((item) => item.apu_id === data.apu.apu_id ? data.apu : item));
      setDraft(data.apu); setMessage("APU actualizado correctamente.");
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  return <section className="apu-editor"><div className="apu-editor-head"><div><span className="eyebrow">EDITAR PARTIDA</span><h2>Biblioteca de APUs</h2></div><select value={selectedId} onChange={(event) => select(event.target.value)}><option value="">Selecciona un APU...</option>{apus.map((apu) => <option key={apu.apu_id} value={apu.apu_id}>{apu.nombre_partida} · {apu.categoria}</option>)}</select></div>{draft && <div className="apu-editor-form"><div className="apu-editor-grid"><label>Nombre<input value={draft.nombre_partida} onChange={(event) => edit("nombre_partida", event.target.value)} /></label><label>Unidad<input value={draft.unidad} onChange={(event) => edit("unidad", event.target.value)} /></label><label>Categoria<select value={draft.categoria || "obra_gris"} onChange={(event) => edit("categoria", event.target.value)}><option value="excavaciones">Excavaciones</option><option value="obra_gris">Obra gris</option><option value="acabados">Acabados</option><option value="instalaciones">Instalaciones</option></select></label></div><label>Descripcion<textarea rows="2" value={draft.descripcion || ""} onChange={(event) => edit("descripcion", event.target.value)} /></label><div className="apu-editor-details"><strong>Consumos por unidad</strong>{draft.detalles.map((detail, index) => <div className="apu-editor-detail" key={`${detail.insumo_id}-${index}`}><span>{detail.nombre_normalizado}</span><input type="number" min="0" step="0.001" value={detail.rendimiento} onChange={(event) => editDetail(index, "rendimiento", event.target.value)} aria-label={`Rendimiento de ${detail.nombre_normalizado}`} /><input type="number" min="0" step="0.01" value={detail.precio_manual ?? ""} placeholder={detail.precio_unitario || "Precio catalogo"} onChange={(event) => editDetail(index, "precio_manual", event.target.value)} aria-label={`Precio manual de ${detail.nombre_normalizado}`} /><small>{detail.unidad_estandar || "unidad"}</small><button className="apu-remove" onClick={() => removeDetail(index)} aria-label={`Quitar ${detail.nombre_normalizado}`}>×</button></div>)}</div><div className="apu-editor-add"><select value={newSupply} onChange={(event) => setNewSupply(event.target.value)}><option value="">Seleccionar insumo para agregar...</option>{supplies.filter((supply) => !draft.detalles.some((detail) => detail.insumo_id === supply.insumo_id)).map((supply) => <option key={supply.insumo_id} value={supply.insumo_id}>{supply.nombre_normalizado} · {supply.unidad_estandar || "sin unidad"}</option>)}</select><button className="button" onClick={addSupply} disabled={!newSupply}>+ Agregar insumo</button></div><button className="button button-dark" onClick={save} disabled={busy}>{busy ? "Guardando..." : "Guardar cambios"}</button></div>}{message && <small className="apu-message">{message}</small>}</section>;
}

import { useState } from "react";

export default function ModuleHelper({ title, children }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return <button className="helper-reopen" onClick={() => setVisible(true)}>Mostrar ayuda</button>;
  return <aside className="module-helper"><div><span className="eyebrow">AYUDA RÁPIDA</span><strong>{title}</strong><p>{children}</p></div><button aria-label="Ocultar ayuda" onClick={() => setVisible(false)}>×</button></aside>;
}

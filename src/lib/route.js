import { useEffect, useState } from "react";

// La URL es la unica fuente de verdad de la navegacion: Atras/Adelante del
// navegador y los botones de la app no pueden divergir. Siete rutas no pagan
// una dependencia de router.

const EVENTO = "soma:navegar";

export function navigate(path) {
  if (path === window.location.pathname) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event(EVENTO));
}

export function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    window.addEventListener(EVENTO, sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener(EVENTO, sync); };
  }, []);
  return path;
}

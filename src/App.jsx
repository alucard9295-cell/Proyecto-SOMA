import { lazy, Suspense } from "react";
import AdminApp from "./admin/AdminApp.jsx";
import SalesSite from "./sales/SalesSite.jsx";
import { useRoute } from "./lib/route.js";

// El recorrido 3D trae three.js y el path tracer: va en su propio chunk para
// que la portada no cargue ni un byte de eso.
const Recorrido = lazy(() => import("./sales/recorrido/Recorrido.jsx"));

// Tres superficies: el sitio publico de ventas, el recorrido 3D y el control
// room. /admin/* lo protege Cloudflare Access en el borde; aqui no hay login.
export default function App() {
  const path = useRoute();
  if (path === "/admin" || path.startsWith("/admin/")) return <AdminApp path={path} />;
  if (path === "/recorrido") return <Suspense fallback={null}><Recorrido /></Suspense>;
  return <SalesSite />;
}

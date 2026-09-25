import AdminApp from "./admin/AdminApp.jsx";
import SalesSite from "./sales/SalesSite.jsx";
import { useRoute } from "./lib/route.js";

// Dos superficies: el sitio publico de ventas y el control room. /admin/* lo
// protege Cloudflare Access en el borde; aqui no hay formulario de login.
export default function App() {
  const path = useRoute();
  return path === "/admin" || path.startsWith("/admin/") ? <AdminApp path={path} /> : <SalesSite />;
}

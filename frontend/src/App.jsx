import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout           from './components/Layout';
import Login            from './pages/Login';
import Home             from './pages/Home';
import Locales          from './pages/Locales';
import Empleados        from './pages/Empleados';
import VentasImportar   from './pages/ventas/Importar';
import VentasListado    from './pages/ventas/Listado';
import VentasDashboard  from './pages/ventas/DashboardLocal';
import VentasComparativo from './pages/ventas/Comparativo';
import HistorialImports from './pages/HistorialImports';
import DocenasAnalisisPage      from './pages/ventas/productos/DocenasAnalisisPage';
import DocenasPorEmpleadoPage   from './pages/ventas/productos/DocenasPorEmpleadoPage';
import CatalogoPage             from './pages/ventas/productos/CatalogoPage';
import RedDashboard             from './pages/red/RedDashboard';
import StockInteligente        from './pages/stock/StockInteligente';
import FinanzasPage            from './pages/finanzas/FinanzasPage';
import MaestroDocenasPage      from './pages/admin/MaestroDocenasPage';
import UsuariosPage           from './pages/admin/UsuariosPage';
import MiReporte              from './pages/reportes/MiReporte';
import Bandeja                from './pages/reportes/Bandeja';
import Consolidado            from './pages/reportes/Consolidado';
import KpiPage                from './pages/kpi/KpiPage';
import ValorHoraPage          from './pages/admin/ValorHoraPage';
import FormulariosPage        from './pages/admin/FormulariosPage';
import { esDueno, esDeRed, esDeTurno } from './utils/roles';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-ahg-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

// Quien no tiene el rol vuelve a su inicio en vez de ver una pantalla que no le corresponde.
function RolRoute({ permitido, children }) {
  const { user } = useAuth();
  return permitido(user) ? children : <Navigate to="/" replace />;
}

const soloRed   = children => <RolRoute permitido={esDeRed}>{children}</RolRoute>;
const soloDueno = children => <RolRoute permitido={esDueno}>{children}</RolRoute>;

// Quien solo carga su reporte de turno entra directo a su formulario del día.
function Inicio() {
  const { user } = useAuth();
  return esDeTurno(user) ? <MiReporte /> : <Home />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Inicio />} />
            <Route path="locales"              element={soloDueno(<Locales />)} />
            <Route path="usuarios"             element={soloRed(<UsuariosPage />)} />
            <Route path="reportes"             element={soloRed(<Bandeja />)} />
            <Route path="consolidado"          element={soloRed(<Consolidado />)} />
            <Route path="kpi"                  element={soloRed(<KpiPage />)} />
            <Route path="valor-hora"           element={soloRed(<ValorHoraPage />)} />
            <Route path="formularios"          element={soloRed(<FormulariosPage />)} />
            <Route path="mi-reporte"           element={<MiReporte />} />
            <Route path="empleados"            element={soloRed(<Empleados />)} />
            <Route path="ventas/importar"      element={soloRed(<VentasImportar />)} />
            <Route path="ventas/listado"       element={soloRed(<VentasListado />)} />
            <Route path="ventas/dashboard"     element={soloRed(<VentasDashboard />)} />
            <Route path="ventas/comparativo"   element={soloRed(<VentasComparativo />)} />
            <Route path="historial-imports"              element={soloRed(<HistorialImports />)} />
            <Route path="ventas/productos/docenas"       element={soloRed(<DocenasAnalisisPage />)} />
            <Route path="ventas/productos/empleados"     element={soloRed(<DocenasPorEmpleadoPage />)} />
            <Route path="ventas/productos/catalogo"      element={soloRed(<CatalogoPage />)} />
            <Route path="red"                            element={soloRed(<RedDashboard />)} />
            <Route path="stock"                          element={soloRed(<StockInteligente />)} />
            <Route path="finanzas"                       element={soloRed(<FinanzasPage />)} />
            <Route path="admin/maestros/docenas"         element={soloDueno(<MaestroDocenasPage />)} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

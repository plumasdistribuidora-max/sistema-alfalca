import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout           from './components/Layout';
import Login            from './pages/Login';
import Home             from './pages/Home';
import Locales          from './pages/Locales';
import EmpleadosPage    from './pages/equipo/EmpleadosPage';
import CalendarioPage   from './pages/equipo/CalendarioPage';
import VentasImportar   from './pages/ventas/Importar';
import VentasListado    from './pages/ventas/Listado';
import HistorialImports from './pages/HistorialImports';
import CatalogoPage             from './pages/ventas/productos/CatalogoPage';
import RedDashboard             from './pages/red/RedDashboard';
import StockInteligente        from './pages/stock/StockInteligente';
import FinanzasPage            from './pages/finanzas/FinanzasPage';
import MaestroDocenasPage      from './pages/admin/MaestroDocenasPage';
import MaestroCafePage         from './pages/admin/MaestroCafePage';
import MaestroCocinaPage       from './pages/admin/MaestroCocinaPage';
import UsuariosPage           from './pages/admin/UsuariosPage';
import MiReporte              from './pages/reportes/MiReporte';
import Reportes               from './pages/reportes/Reportes';
import FormulariosPage        from './pages/admin/FormulariosPage';
import ProveedoresPage        from './pages/proveedores/ProveedoresPage';
import MarcaProximamente      from './pages/MarcaProximamente';
import KankayDashboard        from './pages/marcas/kankay/KankayDashboard';
import { KankayImportar, KankayHistorial } from './pages/marcas/kankay/KankayImportar';
import SenzenDashboard       from './pages/marcas/senzen/SenzenDashboard';
import MiSemana              from './pages/marcas/senzen/MiSemana';
import SenzenComercios       from './pages/marcas/senzen/Comercios';
import SemanaPepa            from './pages/marcas/senzen/SemanaPepa';
import TableroGordo          from './pages/tareas/TableroGordo';
import TableroDuenos         from './pages/tareas/TableroDuenos';
import DuenosMes             from './pages/duenos/Mes';
import DuenosCierre          from './pages/duenos/Cierre';
import DetalleTarea          from './pages/tareas/DetalleTarea';
import Tablero               from './pages/tareas/Tablero';
import ReporteDia            from './pages/tareas/ReporteDia';
import Solapas from './components/Solapas';
import { esDueno, esDeRed, esDeTurno, esVendedora } from './utils/roles';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-ahg-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  // Sin sesión, al login; después vuelve a la pantalla que se quería abrir (un aviso).
  const aca = location.pathname + location.search;
  return user ? children : <Navigate to={aca !== '/' ? `/login?volver=${encodeURIComponent(aca)}` : '/login'} replace />;
}

// Quien no tiene el rol vuelve a su inicio en vez de ver una pantalla que no le corresponde.
function RolRoute({ permitido, children }) {
  const { user } = useAuth();
  return permitido(user) ? children : <Navigate to="/" replace />;
}

const soloRed   = children => <RolRoute permitido={esDeRed}>{children}</RolRoute>;
const soloDueno = children => <RolRoute permitido={esDueno}>{children}</RolRoute>;
// Lo de Senzen que usa Pepa: también lo ven los dueños.
const deSenzen  = children => <RolRoute permitido={u => esVendedora(u) || esDueno(u)}>{children}</RolRoute>;

// Quien solo carga su reporte de turno entra directo a su formulario del día.
function Inicio() {
  const { user } = useAuth();
  if (esVendedora(user)) return <MiSemana />;
  return esDeTurno(user) ? <MiReporte /> : <Home />;
}

// El tablero de dueños tenía su dirección dentro de Tareas de Entre Dos: los avisos viejos
// todavía llevan ahí.
function IrConQuery({ a }) {
  const { search } = useLocation();
  return <Navigate to={`${a}${search}`} replace />;
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
            <Route path="reportes"             element={soloRed(<Reportes />)} />
            <Route path="tareas"               element={soloRed(<Solapas grupo="tareas"><TableroGordo /></Solapas>)} />
            <Route path="tareas-duenos"        element={soloDueno(<TableroDuenos />)} />
            <Route path="duenos"               element={soloDueno(<DuenosMes />)} />
            <Route path="duenos/cierre"        element={soloDueno(<DuenosCierre />)} />
            <Route path="duenos/objetivos"     element={<Navigate to="/duenos" replace />} />
            <Route path="duenos/reuniones"     element={<Navigate to="/duenos" replace />} />
            <Route path="tareas/duenos"        element={<IrConQuery a="/tareas-duenos" />} />
            <Route path="tareas/:id"           element={soloRed(<DetalleTarea />)} />
            <Route path="dia"                  element={soloRed(<ReporteDia />)} />
            <Route path="tablero"              element={soloDueno(<Solapas grupo="tareas"><Tablero /></Solapas>)} />
            <Route path="proveedores"          element={soloRed(<ProveedoresPage />)} />
            <Route path="formularios"          element={soloRed(<FormulariosPage />)} />
            <Route path="mi-reporte"           element={<MiReporte />} />
            <Route path="empleados"            element={soloRed(<EmpleadosPage />)} />
            <Route path="calendario"           element={soloRed(<CalendarioPage />)} />
            <Route path="ventas/importar"      element={soloRed(<Solapas grupo="fudo"><VentasImportar /></Solapas>)} />
            <Route path="ventas/listado"       element={soloRed(<VentasListado />)} />
            {/* Pantallas viejas que pasaron al tablero de Entre Dos: los enlaces guardados llevan ahí */}
            <Route path="ventas/dashboard"     element={<Navigate to="/red" replace />} />
            <Route path="ventas/comparativo"   element={<Navigate to="/red" replace />} />
            <Route path="historial-imports"              element={soloRed(<Solapas grupo="fudo"><HistorialImports /></Solapas>)} />
            <Route path="ventas/productos/docenas"       element={<Navigate to="/red" replace />} />
            <Route path="ventas/productos/empleados"     element={<Navigate to="/red" replace />} />
            <Route path="ventas/productos/catalogo"      element={soloRed(<CatalogoPage />)} />
            {/* El dashboard de Entre Dos es de los dueños: el Encargado General no ve ventas. */}
            <Route path="red"                            element={soloDueno(<RedDashboard />)} />
            <Route path="marcas/kankay"                  element={soloRed(<KankayDashboard />)} />
            <Route path="marcas/kankay/importar"         element={soloDueno(<Solapas grupo="dux"><KankayImportar /></Solapas>)} />
            <Route path="marcas/kankay/historial"        element={soloDueno(<Solapas grupo="dux"><KankayHistorial /></Solapas>)} />
            <Route path="marcas/senzen"                  element={soloRed(<SenzenDashboard />)} />
            {/* Cargar un contacto suelto se sacó: Pepa carga todo desde las tareas de su semana. */}
            <Route path="senzen/contacto"                element={<Navigate to="/" replace />} />
            <Route path="senzen/semana"                  element={soloDueno(<SemanaPepa />)} />
            <Route path="senzen/comercios"               element={deSenzen(<SenzenComercios />)} />
            <Route path="marcas/:slug"                   element={soloRed(<MarcaProximamente />)} />
            <Route path="stock"                          element={soloRed(<StockInteligente />)} />
            <Route path="finanzas"                       element={soloDueno(<FinanzasPage />)} />
            <Route path="admin/maestros/docenas"         element={soloDueno(<Solapas grupo="maestros"><MaestroDocenasPage /></Solapas>)} />
            <Route path="admin/maestros/cafe"            element={soloDueno(<Solapas grupo="maestros"><MaestroCafePage /></Solapas>)} />
            <Route path="admin/maestros/cocina"          element={soloDueno(<Solapas grupo="maestros"><MaestroCocinaPage /></Solapas>)} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

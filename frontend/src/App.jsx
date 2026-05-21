import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout           from './components/Layout';
import Login            from './pages/Login';
import Dashboard        from './pages/Dashboard';
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

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-ahg-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/red" replace />} />
            <Route path="dashboard"            element={<Dashboard />} />
            <Route path="locales"              element={<Locales />} />
            <Route path="empleados"            element={<Empleados />} />
            <Route path="ventas/importar"      element={<VentasImportar />} />
            <Route path="ventas/listado"       element={<VentasListado />} />
            <Route path="ventas/dashboard"     element={<VentasDashboard />} />
            <Route path="ventas/comparativo"   element={<VentasComparativo />} />
            <Route path="historial-imports"              element={<HistorialImports />} />
            <Route path="ventas/productos/docenas"       element={<DocenasAnalisisPage />} />
            <Route path="ventas/productos/empleados"     element={<DocenasPorEmpleadoPage />} />
            <Route path="ventas/productos/catalogo"      element={<CatalogoPage />} />
            <Route path="red"                            element={<RedDashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

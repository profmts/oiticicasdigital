import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './lib/hooks';
import { Providers, Spinner } from './components/ui';

const Landing = lazy(() => import('./pages/Landing'));
const Menu = lazy(() => import('./pages/public/Menu'));
const Track = lazy(() => import('./pages/public/Track'));
const Login = lazy(() => import('./pages/Login'));
const AdminLayout = lazy(() => import('./pages/admin/Layout'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Orders = lazy(() => import('./pages/admin/Orders'));
const PDV = lazy(() => import('./pages/admin/PDV'));
const Tables = lazy(() => import('./pages/admin/Tables'));
const Cash = lazy(() => import('./pages/admin/Cash'));
const Deliveries = lazy(() => import('./pages/admin/Deliveries'));
const Products = lazy(() => import('./pages/admin/Products'));
const Customers = lazy(() => import('./pages/admin/Customers'));
const Finance = lazy(() => import('./pages/admin/Finance'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Users = lazy(() => import('./pages/admin/Users'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const QrCodes = lazy(() => import('./pages/admin/QrCodes'));
const Audit = lazy(() => import('./pages/admin/Audit'));
const Kitchen = lazy(() => import('./pages/Kitchen'));
const Waiter = lazy(() => import('./pages/Waiter'));
const Courier = lazy(() => import('./pages/Courier'));
const Receipt = lazy(() => import('./pages/Receipt'));
const P = {
  Login: lazy(() => import('./pages/platform/Platform').then((m) => ({ default: m.PlatformLogin }))),
  Layout: lazy(() => import('./pages/platform/Platform').then((m) => ({ default: m.PlatformLayout }))),
  Overview: lazy(() => import('./pages/platform/Platform').then((m) => ({ default: m.PlatformOverview }))),
  Tenants: lazy(() => import('./pages/platform/Platform').then((m) => ({ default: m.PlatformTenants }))),
  Plans: lazy(() => import('./pages/platform/Platform').then((m) => ({ default: m.PlatformPlans }))),
  Team: lazy(() => import('./pages/platform/Platform').then((m) => ({ default: m.PlatformTeam }))),
  Audit: lazy(() => import('./pages/platform/Platform').then((m) => ({ default: m.PlatformAudit }))),
};

function Guard({ perm, children }: { perm?: string | string[]; children: ReactNode }) {
  const { me, loading, can } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to={`/entrar?volta=${encodeURIComponent(location.pathname)}`} replace />;
  const perms = perm ? (Array.isArray(perm) ? perm : [perm]) : [];
  if (perms.length && !perms.some(can)) return <Navigate to={me.home} replace />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/entrar" element={<Login />} />
              <Route path="/plataforma/entrar" element={<P.Login />} />
              <Route path="/plataforma" element={<P.Layout />}>
                <Route index element={<P.Overview />} />
                <Route path="empresas" element={<P.Tenants />} />
                <Route path="planos" element={<P.Plans />} />
                <Route path="equipe" element={<P.Team />} />
                <Route path="auditoria" element={<P.Audit />} />
              </Route>
              <Route path="/cozinha" element={<Guard perm="kitchen.use"><Kitchen /></Guard>} />
              <Route path="/garcom" element={<Guard perm="tables.use"><Waiter /></Guard>} />
              <Route path="/motoboy" element={<Guard perm="delivery.courier"><Courier /></Guard>} />
              <Route path="/imprimir/:id" element={<Guard><Receipt /></Guard>} />
              <Route path="/admin" element={<Guard perm={['dashboard.view', 'orders.view', 'pdv.use', 'cash.operate', 'delivery.manage', 'products.manage', 'customers.view', 'finance.view', 'reports.view', 'users.manage', 'settings.manage', 'audit.view']}><AdminLayout /></Guard>}>
                <Route index element={<Guard perm="dashboard.view"><Dashboard /></Guard>} />
                <Route path="pedidos" element={<Guard perm="orders.view"><Orders /></Guard>} />
                <Route path="pdv" element={<Guard perm="pdv.use"><PDV /></Guard>} />
                <Route path="mesas" element={<Guard perm="tables.use"><Tables /></Guard>} />
                <Route path="caixa" element={<Guard perm="cash.operate"><Cash /></Guard>} />
                <Route path="entregas" element={<Guard perm="delivery.manage"><Deliveries /></Guard>} />
                <Route path="produtos" element={<Guard perm="products.manage"><Products /></Guard>} />
                <Route path="clientes" element={<Guard perm="customers.view"><Customers /></Guard>} />
                <Route path="financeiro" element={<Guard perm="finance.view"><Finance /></Guard>} />
                <Route path="relatorios" element={<Guard perm="reports.view"><Reports /></Guard>} />
                <Route path="usuarios" element={<Guard perm="users.manage"><Users /></Guard>} />
                <Route path="configuracoes" element={<Guard perm="settings.manage"><Settings /></Guard>} />
                <Route path="qrcodes" element={<Guard perm={['settings.manage', 'tables.manage']}><QrCodes /></Guard>} />
                <Route path="auditoria" element={<Guard perm="audit.view"><Audit /></Guard>} />
              </Route>
              {/* Rotas públicas de cada empresa */}
              <Route path="/:slug" element={<Menu mode="online" />} />
              <Route path="/:slug/mesa/:token" element={<Menu mode="mesa" />} />
              <Route path="/:slug/balcao" element={<Menu mode="balcao" />} />
              <Route path="/:slug/pedido/:token" element={<Track />} />
              <Route path="/:slug/entrar" element={<Login />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </Providers>
  </StrictMode>,
);

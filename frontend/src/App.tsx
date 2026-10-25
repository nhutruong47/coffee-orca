import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoadingFallback from './components/LoadingFallback';
import ToastContainer from './components/ToastContainer';

// Lazy-loaded route bundles.
// Group key/large pages into a single chunk to keep the initial JS lean.
const LoginPage = lazy(() => import('./pages/AuthPage'));
const RegisterPage = lazy(() => import('./pages/AuthPage'));
const OAuth2Callback = lazy(() => import('./pages/OAuth2Callback'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage'));
const CreateTaskPage = lazy(() => import('./pages/CreateTaskPage'));
const ProductionCalendarPage = lazy(() => import('./pages/ProductionCalendarPage'));
const InviteAcceptPage = lazy(() => import('./pages/InviteAcceptPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));
const OrderManagementPage = lazy(() => import('./pages/OrderManagementPage'));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const UpgradePlanPage = lazy(() => import('./pages/UpgradePlanPage'));
const PaymentResultPage = lazy(() => import('./pages/PaymentResultPage'));
const VnpayMockCheckoutPage = lazy(() => import('./pages/VnpayMockCheckoutPage'));
const AdminVerificationPage = lazy(() => import('./pages/AdminVerificationPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const FactoryOverviewPage = lazy(() => import('./pages/FactoryOverviewPage'));

import './App.css';

function App() {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <AuthProvider>
                    <ToastProvider>
                        <Suspense fallback={<LoadingFallback />}>
                            <Routes>
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/register" element={<RegisterPage />} />
                                <Route path="/oauth2/callback" element={<OAuth2Callback />} />
                                <Route path="/invite" element={<InviteAcceptPage />} />
                                <Route path="/invite/:code" element={<InviteAcceptPage />} />

                                <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                                    <Route path="/dashboard" element={<DashboardPage />} />
                                    <Route path="/profile" element={<ProfilePage />} />
                                    <Route path="/groups" element={<GroupsPage />} />
                                    <Route path="/groups/:id" element={<GroupDetailPage />} />
                                    <Route path="/groups/:id/create-task" element={<CreateTaskPage />} />
                                    <Route path="/groups/:id/calendar" element={<ProductionCalendarPage />} />
                                    <Route path="/orders" element={<OrderManagementPage />} />
                                    <Route path="/orders/:id" element={<OrderDetailPage />} />
                                    <Route path="/settings" element={<SettingsPage />} />
                                    <Route path="/admin" element={<AdminPage />} />
                                    <Route path="/admin/verification" element={<AdminVerificationPage />} />
                                    <Route path="/notifications" element={<NotificationsPage />} />
                                    <Route path="/thong-bao" element={<NotificationsPage />} />
                                    <Route path="/factory-overview" element={<FactoryOverviewPage />} />
                                    <Route path="/tong-quan-xuong" element={<FactoryOverviewPage />} />
                                    <Route path="/upgrade" element={<UpgradePlanPage />} />
                                    <Route path="/nang-cap-goi" element={<UpgradePlanPage />} />
                                    <Route path="/payment-result" element={<PaymentResultPage />} />
                                    <Route path="/vnpay-mock-checkout" element={<VnpayMockCheckoutPage />} />
                                </Route>

                                <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
                                <Route path="/dat-hang" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
                                <Route path="/thi-truong-dat-hang" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
                                <Route path="/" element={<HomePage />} />
                                <Route path="/ban-sac" element={<HomePage />} />
                                <Route path="/san-pham" element={<Navigate to="/ban-sac#products" replace />} />
                                <Route path="/cong-nghe" element={<Navigate to="/ban-sac#process" replace />} />
                                <Route path="/lien-he" element={<Navigate to="/ban-sac#footer" replace />} />
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Suspense>
                        <ToastContainer />
                    </ToastProvider>
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}

export default App;

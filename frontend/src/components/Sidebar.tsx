import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { teamService } from '../services/groupService';
import { interGroupOrderService } from '../services/interGroupOrderService';
import orcaLogo from '../assets/orca-logo.png';

function getUsernameInitials(username?: string) {
    const value = username?.trim() || 'U';
    const parts = value.split(/[\s._-]+/).filter(Boolean);
    if (parts.length > 1) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return value.slice(0, 2).toUpperCase();
}

export default function Sidebar() {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [pendingOrderCount, setPendingOrderCount] = useState(0);
    const displayName = user?.fullName || user?.username || 'Người dùng';
    const displayPlan = user?.aiPlan || 'free';
    const usernameInitials = getUsernameInitials(user?.username);

    const getPlanColor = (plan: string) => {
        if (user?.role === 'ADMIN') {
            return { token: 'var(--info)', label: 'Platform Admin' };
        }
        switch (plan.toLowerCase()) {
            case 'free': return { token: 'var(--text-muted)', label: 'Miễn phí' };
            case 'professional':
            case 'plus': return { token: 'var(--primary)', label: 'Plus' };
            case 'pro': return { token: 'var(--info)', label: 'Pro' };
            case 'enterprise': return { token: 'var(--accent)', label: 'Doanh nghiệp' };
            default: return { token: 'var(--text-muted)', label: plan };
        }
    };
    const planStyle = getPlanColor(displayPlan);

    useEffect(() => {
        if (!user || user.role === 'ADMIN') {
            setPendingOrderCount(0);
            return;
        }

        let cancelled = false;

        const fetchPendingOrders = async () => {
            try {
                const teams = await teamService.getMyTeams();
                const ownedTeams = teams.filter(team => team.ownerId === user.id);

                if (ownedTeams.length === 0) {
                    const myOutboundOrders = await interGroupOrderService.getMyOutboundOrders();
                    const nextCount = myOutboundOrders.filter(order => order.buyerViewed === false).length;
                    if (!cancelled) setPendingOrderCount(nextCount);
                    return;
                }

                const myOutboundOrders = await interGroupOrderService.getMyOutboundOrders();
                const teamOutboundOrders = await Promise.all(
                    ownedTeams.map(team => interGroupOrderService.getOutboundOrders(team.id))
                );
                const inboundOrders = await Promise.all(
                    ownedTeams.map(team => interGroupOrderService.getInboundOrders(team.id))
                );

                const outboundUnread = [
                    ...myOutboundOrders,
                    ...teamOutboundOrders.flat()
                ].filter(order => order.buyerViewed === false).length;

                const inboundUnread = inboundOrders
                    .flat()
                    .filter(order => order.sellerViewed === false).length;

                const nextCount = outboundUnread + inboundUnread;

                if (!cancelled) setPendingOrderCount(nextCount);
            } catch (error) {
                if (!cancelled) setPendingOrderCount(0);
            }
        };

        fetchPendingOrders();
        const intervalId = window.setInterval(fetchPendingOrders, 30000);
        window.addEventListener('focus', fetchPendingOrders);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            window.removeEventListener('focus', fetchPendingOrders);
        };
    }, [user]);

    const adminNavItems = [
        { path: '/admin?section=overview', label: 'Tổng quan & Phân tích', icon: 'speedometer-outline' },
        { path: '/admin?section=workspace_requests', label: 'Yêu cầu mở xưởng', icon: 'person-add-outline' },
        { path: '/admin?section=companies', label: 'Quản lý doanh nghiệp', icon: 'business-outline' },
        { path: '/admin?section=users', label: 'Quản lý người dùng', icon: 'people-outline' },
        { path: '/admin?section=subscriptions', label: 'Gói dịch vụ', icon: 'receipt-outline' },
        { path: '/admin?section=payments', label: 'Thanh toán & doanh thu', icon: 'card-outline' },
        { path: '/admin?section=costs', label: 'Chi phí', icon: 'wallet-outline' },
        { path: '/admin?section=reports', label: 'Báo cáo thống kê', icon: 'document-text-outline' },
        { path: '/admin?section=logs', label: 'Nhật ký hệ thống', icon: 'shield-checkmark-outline' },
    ];

    const navItems = user?.role === 'ADMIN' ? adminNavItems : [
        { path: '/dashboard', label: 'Tổng quan', icon: 'grid-outline' },
        { path: '/groups', label: 'Nhóm xưởng', icon: 'people-outline', afterDivider: true },
        { path: '/marketplace', label: 'Thị trường', icon: 'storefront-outline' },
        { path: '/orders', label: 'Đơn hàng', icon: 'cube-outline', badge: pendingOrderCount },
    ];

    let accountMenuItems = [
        { path: '/upgrade', label: 'Nâng cấp gói', icon: 'sparkles-outline' },
        { path: '/settings', label: 'Cá nhân hóa', icon: 'color-palette-outline' },
        { path: '/profile', label: 'Hồ sơ', icon: 'person-circle-outline' },
        { path: '/settings', label: 'Cài đặt', icon: 'settings-outline' },
        { path: '/settings', label: 'Trợ giúp', icon: 'help-buoy-outline', separated: true, hasChevron: true },
    ];
    if (user?.role === 'ADMIN') {
        accountMenuItems = accountMenuItems.filter(item => item.path !== '/upgrade');
    }

    const isNavActive = (path: string) => {
        if (path.startsWith('/admin')) {
            const section = new URLSearchParams(path.split('?')[1] || '').get('section') || 'overview';
            const currentSection = new URLSearchParams(location.search).get('section') || 'overview';
            return location.pathname === '/admin' && section === currentSection;
        }
        if (path === '/marketplace') {
            return location.pathname.startsWith('/marketplace')
                || location.pathname === '/dat-hang'
                || location.pathname === '/thi-truong-dat-hang';
        }
        return location.pathname.startsWith(path);
    };
    const userMenuActive = accountMenuItems.some((item) => location.pathname.startsWith(item.path));

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <img className="app-logo-mark sidebar-brand-logo" src={orcaLogo} alt="ORCA" />
            </div>

            <nav className="sidebar-nav">
                <div className="nav-label">DANH MỤC</div>
                {navItems.map((item) => {
                    const active = isNavActive(item.path);
                    return (
                        <div className="nav-item-wrap" key={item.path}>
                            <NavLink to={item.path} className={() => `nav-item ${active ? 'active' : ''}`}>
                                <span className="nav-icon"><ion-icon name={item.icon} style={{ fontSize: '18px' }}></ion-icon></span>
                                <span className="nav-text">{item.label}</span>
                                {!!item.badge && item.badge > 0 && (
                                    <span className="nav-badge" style={{
                                        marginLeft: 'auto',
                                        background: 'var(--danger)',
                                        color: 'var(--text-on-accent)',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        padding: '3px 8px',
                                        borderRadius: '12px',
                                        lineHeight: 1,
                                        minWidth: '20px',
                                        textAlign: 'center'
                                    }}>
                                        {item.badge}
                                    </span>
                                )}
                            </NavLink>
                            {item.afterDivider && <div className="nav-divider" role="separator" />}
                        </div>
                    );
                })}
            </nav>

            {user && (
                <div className="sidebar-user-wrap">
                    {userMenuOpen && (
                        <div className="sidebar-user-menu">
                            <div className="sidebar-user-menu-head">
                                <div className="sidebar-avatar sidebar-avatar-initials">{usernameInitials}</div>
                                <div className="sidebar-user-info">
                                    <span className="sidebar-username">{displayName}</span>
                                    <span className="sidebar-user-plan">{displayPlan}</span>
                                </div>
                                <ion-icon name="chevron-forward-outline" className="sidebar-menu-head-chevron"></ion-icon>
                            </div>
                            {accountMenuItems.map((item) => (
                                <NavLink
                                    key={`${item.path}-${item.label}`}
                                    to={item.path}
                                    className={`sidebar-user-menu-item ${item.separated ? 'separated' : ''} ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
                                    onClick={() => setUserMenuOpen(false)}
                                >
                                    <span className="nav-icon">
                                        <ion-icon name={item.icon} style={{ fontSize: '18px' }}></ion-icon>
                                    </span>
                                    <span>{item.label}</span>
                                    {item.hasChevron && <ion-icon name="chevron-forward-outline" className="sidebar-menu-chevron"></ion-icon>}
                                </NavLink>
                            ))}
                            <button
                                type="button"
                                className="sidebar-user-menu-item sidebar-user-menu-button"
                                onClick={() => {
                                    setUserMenuOpen(false);
                                    logout();
                                }}
                            >
                                <span className="nav-icon"><ion-icon name="log-out-outline" style={{ fontSize: '18px' }}></ion-icon></span>
                                <span>Đăng xuất</span>
                            </button>
                        </div>
                    )}

                    <button
                        type="button"
                        className={`sidebar-user ${userMenuOpen || userMenuActive ? 'active' : ''}`}
                        onClick={() => setUserMenuOpen((open) => !open)}
                        aria-expanded={userMenuOpen}
                    >
                        <div className="sidebar-avatar sidebar-avatar-initials">{usernameInitials}</div>
                        <div className="sidebar-user-info">
                            <span className="sidebar-username">{displayName}</span>
                            <span
                                className="sidebar-user-plan"
                                style={{
                                    color: planStyle.token,
                                    padding: '2px 0',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    display: 'inline-block',
                                    marginTop: '2px'
                                }}
                            >{planStyle.label}</span>
                        </div>
                        <ion-icon name={userMenuOpen ? 'chevron-down-outline' : 'storefront-outline'} style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '18px' }}></ion-icon>
                    </button>
                </div>
            )}
        </aside>
    );
}

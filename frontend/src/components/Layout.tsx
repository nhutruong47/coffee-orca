import { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import { Bell, MoreHorizontal, MessageCircle, Sparkles } from 'lucide-react';
import { chatService, notificationService } from '../services/groupService';
import { useNotificationSocket, type NotificationPayload } from '../hooks/useNotificationSocket';
import type { AppNotification } from '../types/types';

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(false);
    const [showMessages, setShowMessages] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const notifRef = useRef<HTMLDivElement>(null);
    const msgRef = useRef<HTMLDivElement>(null);

    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    useEffect(() => {
        const handlePaymentRequired = () => {
            setShowUpgradeModal(true);
        };
        window.addEventListener('payment-required', handlePaymentRequired);
        return () => window.removeEventListener('payment-required', handlePaymentRequired);
    }, []);

    const loadNotifications = useCallback(() => {
        if (!user) return;
        notificationService.getAll().then(setNotifications).catch(() => { /* tolerated */ });
    }, [user]);

    useEffect(() => {
        loadNotifications();
        window.addEventListener('orca:notifications-refresh', loadNotifications);
        return () => window.removeEventListener('orca:notifications-refresh', loadNotifications);
    }, [loadNotifications]);

    // Realtime notifications share one transport, then are routed by type below.
    const handleIncomingNotification = useCallback((payload: NotificationPayload) => {
        const mapped: AppNotification = {
            id: payload.id,
            title: payload.title,
            message: payload.message,
            type: payload.type,
            taskId: payload.taskId ?? '',
            actorId: payload.actorId ?? null,
            read: payload.read,
            createdAt: payload.createdAt,
        };
        setNotifications(prev => {
            // de-duplicate so a server re-delivery doesn't double-show
            if (prev.some(n => n.id === mapped.id)) return prev;
            return [mapped, ...prev];
        });
    }, []);

    useNotificationSocket({
        onListChange: handleIncomingNotification,
        enabled: !!user,
    });

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
            if (msgRef.current && !msgRef.current.contains(event.target as Node)) {
                setShowMessages(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const chatNotifications = notifications.filter(n => n.type === 'CHAT_MESSAGE');
    const systemNotifications = notifications.filter(n => n.type !== 'CHAT_MESSAGE');
    const unreadCount = systemNotifications.filter(n => !n.read).length;
    const displayNotifications = activeTab === 'all'
        ? systemNotifications
        : systemNotifications.filter(n => !n.read);
    const unreadMsgCount = chatNotifications.filter(n => !n.read).length;

    const markNotificationAsRead = (notification: AppNotification) => {
        if (notification.read) return;

        setNotifications(prev => prev.map(item =>
            item.id === notification.id ? { ...item, read: true } : item
        ));
        notificationService.markAsRead(notification.id).catch(() => {
            setNotifications(prev => prev.map(item =>
                item.id === notification.id ? { ...item, read: false } : item
            ));
        });
    };

    const openChatNotification = async (notification: AppNotification) => {
        const matchesConversation = (item: AppNotification) =>
            item.type === 'CHAT_MESSAGE'
            && item.taskId === notification.taskId
            && (item.actorId ?? null) === (notification.actorId ?? null);
        setNotifications(prev => prev.map(item =>
            matchesConversation(item) ? { ...item, read: true } : item
        ));
        setShowMessages(false);
        if (!notification.taskId) {
            navigate('/groups');
            return;
        }

        const isDirect = !!notification.actorId;
        try {
            await chatService.markConversationRead(
                notification.taskId,
                isDirect ? 'DIRECT' : 'GROUP',
                notification.actorId ?? undefined,
            );
        } catch {
            loadNotifications();
        }
        const params = new URLSearchParams({
            openChat: '1',
            chat: isDirect ? 'dm' : 'group',
        });
        if (notification.actorId) params.set('userId', notification.actorId);
        navigate(`/groups/${notification.taskId}?${params.toString()}`);
    };

    const openSystemNotification = (notification: AppNotification) => {
        markNotificationAsRead(notification);
        setShowNotifications(false);

        if (notification.type.startsWith('/')) {
            navigate(notification.type);
        } else if (notification.type.startsWith('ORDER_') && notification.taskId) {
            navigate(`/orders/${notification.taskId}`);
        } else if (notification.type.startsWith('TASK_')) {
            navigate('/dashboard');
        } else {
            navigate('/notifications');
        }
    };

    return (
        <div className="layout">
            <Sidebar />
            <div className="layout-main">
                {/* Top bar */}
                <header className="topbar">
                    <div className="topbar-left">
                        <h2 className="topbar-greeting">
                            Xin chào, <span className="topbar-username">{user?.fullName || user?.username || 'Người dùng'}</span>
                        </h2>
                    </div>
                    <div className="topbar-right">
                        
                        {/* MESSENGER DROPDOWN */}
                        <div className="topbar-messenger" ref={msgRef}>
                            <button 
                                className="notification-btn" 
                                title="Tin nhắn"
                                onClick={() => {
                                    setShowMessages(!showMessages);
                                    if (!showMessages) setShowNotifications(false);
                                }}
                            >
                                <MessageCircle size={20} />
                                {unreadMsgCount > 0 && <span className="notification-badge">{unreadMsgCount}</span>}
                            </button>

                            {showMessages && (
                                <div className="fb-notification-dropdown msg-dropdown">
                                    <div className="fb-notification-header">
                                        <h3>Đoạn chat</h3>
                                        <button className="fb-notification-options"><MoreHorizontal size={20}/></button>
                                    </div>
                                    <div className="fb-notification-list">
                                        {chatNotifications.length === 0 ? (
                                            <div className="fb-notification-empty">
                                                <MessageCircle size={28} />
                                                <p>Chưa có tin nhắn mới.</p>
                                            </div>
                                        ) : chatNotifications.map(notification => (
                                            <div 
                                                key={notification.id}
                                                className={`fb-notification-item msg-item ${notification.read ? 'read' : 'unread'}`}
                                                onClick={() => openChatNotification(notification)}
                                                style={{cursor: 'pointer'}}
                                            >
                                                <div className="fb-notif-avatar-wrapper">
                                                    <div className="message-notification-avatar">
                                                        <MessageCircle size={23} />
                                                    </div>
                                                </div>
                                                <div className="fb-notif-content">
                                                    <p className={`msg-group-name ${!notification.read ? 'unread-text' : ''}`}>
                                                        {notification.title}
                                                    </p>
                                                    <div className="msg-preview">
                                                        <span className={`msg-preview-text ${!notification.read ? 'unread-text' : ''}`}>
                                                            {notification.message}
                                                        </span>
                                                        <span className="msg-preview-time">
                                                            {' · '}{new Date(notification.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                                {!notification.read && <div className="fb-notif-unread-dot"></div>}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="fb-notification-footer">
                                        <button onClick={() => { setShowMessages(false); navigate('/groups'); }}>Xem tất cả trong Messenger</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* NOTIFICATION DROPDOWN */}
                        <div className="topbar-notification" ref={notifRef}>
                            <button 
                                className="notification-btn"
                                onClick={() => {
                                    setShowNotifications(!showNotifications);
                                    if (!showNotifications) setShowMessages(false);
                                }}
                            >
                                <Bell size={20} />
                                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
                            </button>
                            
                            {showNotifications && (
                                <div className="fb-notification-dropdown">
                                    <div className="fb-notification-header">
                                        <h3>Thông báo</h3>
                                        <button className="fb-notification-options"><MoreHorizontal size={20}/></button>
                                    </div>
                                    <div className="fb-notification-tabs">
                                        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>Tất cả</button>
                                        <button className={activeTab === 'unread' ? 'active' : ''} onClick={() => setActiveTab('unread')}>Chưa đọc</button>
                                    </div>
                                    <div className="fb-notification-section">
                                        <span>Gần đây</span>
                                        <button onClick={() => { setShowNotifications(false); navigate('/notifications'); }}>Xem tất cả</button>
                                    </div>
                                    <div className="fb-notification-list">
                                        {displayNotifications.length === 0 ? (
                                            <div className="fb-notification-empty">
                                                <Bell size={28} />
                                                <p>{activeTab === 'unread' ? 'Không có thông báo chưa đọc.' : 'Chưa có thông báo hệ thống.'}</p>
                                            </div>
                                        ) : displayNotifications.map(notif => (
                                            <div 
                                                key={notif.id} 
                                                className={`fb-notification-item ${notif.read ? 'read' : 'unread'}`}
                                                onClick={() => openSystemNotification(notif)}
                                                style={{cursor: 'pointer'}}
                                            >
                                                <div className="fb-notif-avatar-wrapper">
                                                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700 }}>
                                                        <Bell size={24} color="#fff" />
                                                    </div>
                                                </div>
                                                <div className="fb-notif-content">
                                                    <p>
                                                        <strong>{notif.title || 'Hệ thống'}</strong> {notif.message}
                                                    </p>
                                                    <span className="fb-notif-time">{new Date(notif.createdAt).toLocaleString('vi-VN')}</span>
                                                </div>
                                                {!notif.read && <div className="fb-notif-unread-dot"></div>}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="fb-notification-footer">
                                        <button onClick={() => { setShowNotifications(false); navigate('/notifications'); }}>Xem tất cả thông báo</button>
                                    </div>
                                </div>
                            )}
                        </div>


                        <button className="topbar-logout" onClick={logout}>
                            Đăng xuất
                        </button>
                    </div>
                </header>

                {/* Page content */}
                <main className="layout-content">
                    <Outlet />
                </main>
            </div>

            {showUpgradeModal && (
                <div className="modal-overlay">
                    <div className="modal-content upgrade-required-modal">
                        <div style={{ color: '#7c3aed', marginBottom: '16px' }}>
                            <Sparkles size={48} style={{ margin: '0 auto' }} />
                        </div>
                        <h3 style={{ marginBottom: '12px' }}>Nâng cấp để tiếp tục</h3>
                        <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '15px' }}>
                            Chọn gói phù hợp để tiếp tục sử dụng trợ lý AI ORCA.
                        </p>
                        <div className="upgrade-required-actions">
                            <button
                                className="btn-secondary upgrade-required-button"
                                onClick={() => setShowUpgradeModal(false)}
                            >
                                Đóng
                            </button>
                            <button
                                className="btn-primary upgrade-required-button upgrade-required-primary"
                                onClick={() => {
                                    setShowUpgradeModal(false);
                                    navigate('/nang-cap-goi');
                                }}
                            >
                                Nâng cấp gói
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

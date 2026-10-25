import { useEffect, useState, useCallback } from 'react';
import { notificationService } from '../services/groupService';
import type { AppNotification } from '../types/types';
import { useNotificationSocket, type NotificationPayload } from '../hooks/useNotificationSocket';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const TYPE_BADGE: Record<string, { tone: string; label: string }> = {
    ORDER_CREATED: { tone: 'bg-blue-100 text-blue-700', label: 'Đơn mới' },
    ORDER_ACCEPTED: { tone: 'bg-green-100 text-green-700', label: 'Đã chấp nhận' },
    ORDER_REJECTED: { tone: 'bg-red-100 text-red-700', label: 'Bị từ chối' },
    ORDER_DELIVERED: { tone: 'bg-green-100 text-green-700', label: 'Đã giao' },
    ORDER_COMPLETED: { tone: 'bg-green-100 text-green-700', label: 'Hoàn thành' },
    ORDER_DISPUTED: { tone: 'bg-red-100 text-red-700', label: 'Tranh chấp' },
    ORDER_RESOLVED: { tone: 'bg-green-100 text-green-700', label: 'Đã giải quyết' },
    TASK_ASSIGNED: { tone: 'bg-blue-100 text-blue-700', label: 'Task mới' },
    TASK_OVERDUE: { tone: 'bg-yellow-100 text-yellow-700', label: 'Quá hạn' },
    PAYMENT_SUCCESS: { tone: 'bg-green-100 text-green-700', label: 'Thanh toán OK' },
    PAYMENT_FAILED: { tone: 'bg-red-100 text-red-700', label: 'Thanh toán lỗi' },
};

export default function NotificationsPage() {
    const { user } = useAuth();
    const toast = useToast();
    const [items, setItems] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const [marking, setMarking] = useState(false);

    const reload = useCallback(async () => {
        try {
            const data = await notificationService.getAll();
            setItems(data.filter((notification) => notification.type !== 'CHAT_MESSAGE'));
        } catch (err) {
            toast.error('Lỗi tải thông báo', 'Không thể tải danh sách thông báo.');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (!user) return;
        reload();
    }, [user, reload]);

    // Listen for new realtime notifications and prepend
    useNotificationSocket({
        enabled: !!user,
        onListChange: (payload: NotificationPayload) => {
            if (payload.type === 'CHAT_MESSAGE') return;
            const mapped: AppNotification = {
                id: payload.id,
                title: payload.title,
                message: payload.message,
                type: payload.type,
                taskId: payload.taskId ?? '',
                read: payload.read,
                createdAt: payload.createdAt,
            };
            setItems((prev) => (prev.some((n) => n.id === mapped.id) ? prev : [mapped, ...prev]));
        },
    });

    const handleMarkOne = async (id: string) => {
        try {
            await notificationService.markAsRead(id);
            setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        } catch (err) {
            toast.error('Lỗi', 'Không thể đánh dấu đã đọc.');
        }
    };

    const handleMarkAll = async () => {
        setMarking(true);
        try {
            const unreadIds = items.filter((notification) => !notification.read).map((notification) => notification.id);
            await Promise.all(unreadIds.map((id) => notificationService.markAsRead(id)));
            setItems((prev) => prev.map((n) => ({ ...n, read: true })));
            toast.success('Đã đánh dấu tất cả là đã đọc', '');
        } catch (err) {
            toast.error('Lỗi', 'Không thể đánh dấu tất cả.');
        } finally {
            setMarking(false);
        }
    };

    const visible = filter === 'unread' ? items.filter((n) => !n.read) : items;
    const unreadCount = items.filter((n) => !n.read).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Thông báo</h1>
                <div className="flex items-center gap-3">
                    <div className="flex rounded-lg border overflow-hidden text-sm">
                        <button
                            type="button"
                            className={`px-3 py-1 ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                            onClick={() => setFilter('all')}
                        >
                            Tất cả ({items.length})
                        </button>
                        <button
                            type="button"
                            className={`px-3 py-1 ${filter === 'unread' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                            onClick={() => setFilter('unread')}
                        >
                            Chưa đọc ({unreadCount})
                        </button>
                    </div>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={handleMarkAll}
                            disabled={marking}
                            className="px-3 py-1 text-sm border rounded text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                            {marking ? 'Đang xử lý...' : 'Đánh dấu tất cả đã đọc'}
                        </button>
                    )}
                </div>
            </div>

            {visible.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed">
                    <div className="text-5xl mb-3">🔔</div>
                    <p className="text-gray-600">
                        {filter === 'unread' ? 'Không có thông báo chưa đọc.' : 'Bạn chưa có thông báo nào.'}
                    </p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {visible.map((n) => {
                        const badge = TYPE_BADGE[n.type] ?? { tone: 'bg-gray-100 text-gray-700', label: n.type };
                        return (
                            <li
                                key={n.id}
                                className={`p-4 bg-white border rounded-lg shadow-sm flex gap-3 ${
                                    !n.read ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
                                }`}
                            >
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${badge.tone}`}>
                                            {badge.label}
                                        </span>
                                        {!n.read && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white">
                                                Mới
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-500 ml-auto">
                                            {new Date(n.createdAt).toLocaleString('vi-VN')}
                                        </span>
                                    </div>
                                    <h3 className={`text-sm ${!n.read ? 'font-semibold' : 'font-normal'}`}>
                                        {n.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                                </div>
                                {!n.read && (
                                    <button
                                        type="button"
                                        onClick={() => handleMarkOne(n.id)}
                                        className="text-xs text-blue-600 hover:underline self-start"
                                    >
                                        Đã đọc
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

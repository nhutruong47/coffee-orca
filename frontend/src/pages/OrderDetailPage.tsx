import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { interGroupOrderService } from '../services/interGroupOrderService';
import type { InterGroupOrder } from '../types/types';

export default function OrderDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [order, setOrder] = useState<InterGroupOrder | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            setLoading(true);
            try {
                const [orderData, eventsData] = await Promise.all([
                    interGroupOrderService.getOrder(id),
                    interGroupOrderService.getEventLogs(id)
                ]);
                setOrder(orderData);
                setEvents(eventsData);
            } catch (err: any) {
                setError(err.response?.data?.error || 'Không thể tải chi tiết đơn hàng.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div className="page-container" style={{ padding: 40, textAlign: 'center' }}>
                <p>Đang tải chi tiết đơn hàng...</p>
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="page-container" style={{ padding: 40, textAlign: 'center' }}>
                <div className="alert alert-danger">{error || 'Không tìm thấy đơn hàng.'}</div>
                <button className="btn btn-secondary" onClick={() => navigate('/orders')} style={{ marginTop: 20 }}>
                    Quay lại danh sách
                </button>
            </div>
        );
    }

    return (
        <div className="page-container">
            <header className="page-header glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', marginBottom: 24 }}>
                <div>
                    <button className="btn" onClick={() => navigate('/orders')} style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-secondary)' }}>
                        <ion-icon name="arrow-back-outline"></ion-icon> Quay lại
                    </button>
                    <h1 className="page-title text-glow-active" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                        Chi tiết đơn: {order.title}
                    </h1>
                    <p style={{ marginTop: 10, fontSize: 14, color: 'var(--text-secondary)' }}>
                        Mã đơn: <strong>{order.id}</strong> | Trạng thái: <strong style={{ color: 'var(--primary-color)' }}>{order.status}</strong>
                    </p>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, alignItems: 'start' }}>
                {/* Cột thông tin chi tiết */}
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>Thông tin chung</h2>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 30 }}>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Người đặt (Mua)</p>
                            <p style={{ fontWeight: 600, fontSize: 15 }}>{order.buyerTeamName || order.buyerUserName || 'Khách lẻ'}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Xưởng nhận (Bán)</p>
                            <p style={{ fontWeight: 600, fontSize: 15 }}>{order.sellerTeamName}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Số lượng</p>
                            <p style={{ fontWeight: 600, fontSize: 15 }}>{order.quantity}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Hạn chót</p>
                            <p style={{ fontWeight: 600, fontSize: 15 }}>{order.deadline ? new Date(order.deadline).toLocaleDateString('vi-VN') : 'N/A'}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Mô tả yêu cầu</p>
                            <div style={{ background: 'var(--bg-card)', padding: 15, borderRadius: 8, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                                {order.description || 'Không có mô tả'}
                            </div>
                        </div>
                    </div>

                    <h2 style={{ fontSize: 18, marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>Thông tin Giao hàng & Thanh toán</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Số điện thoại liên hệ</p>
                            <p style={{ fontWeight: 600, fontSize: 15 }}>{order.contactPhone || 'N/A'}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Địa chỉ giao hàng</p>
                            <p style={{ fontWeight: 600, fontSize: 15 }}>{order.deliveryAddress || 'N/A'}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 5 }}>Ghi chú giao hàng</p>
                            <p style={{ fontWeight: 600, fontSize: 14 }}>{order.deliveryNote || 'N/A'}</p>
                        </div>
                    </div>
                </div>

                {/* Cột Timeline */}
                <div className="glass-panel" style={{ padding: 24 }}>
                    <h2 style={{ fontSize: 18, marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>Lịch sử hoạt động (Audit Log)</h2>
                    
                    {events.length === 0 ? (
                        <p style={{ color: 'var(--text-secondary)' }}>Chưa có sự kiện nào.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 15, top: 10, bottom: 10, width: 2, background: 'var(--border-color)' }}></div>
                            {events.map((evt) => (
                                <div key={evt.id} style={{ display: 'flex', gap: 15, position: 'relative', zIndex: 1 }}>
                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, boxShadow: '0 0 0 4px var(--bg-card)' }}>
                                        <ion-icon name="time-outline"></ion-icon>
                                    </div>
                                    <div style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 8, flex: 1, border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                            <strong style={{ fontSize: 14 }}>{evt.eventType}</strong>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(evt.createdAt).toLocaleString('vi-VN')}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                            Thực hiện bởi: <strong>{evt.actorName}</strong> ({evt.actorRole})
                                        </p>
                                        {evt.newStatus && evt.newStatus !== evt.oldStatus && (
                                            <p style={{ margin: '5px 0 0', fontSize: 13 }}>
                                                Trạng thái: 
                                                <span style={{ color: 'var(--text-secondary)', textDecoration: 'line-through', margin: '0 5px' }}>{evt.oldStatus}</span> 
                                                <ion-icon name="arrow-forward-outline" style={{ fontSize: 10, verticalAlign: 'middle' }}></ion-icon>
                                                <strong style={{ color: 'var(--success)', marginLeft: 5 }}>{evt.newStatus}</strong>
                                            </p>
                                        )}
                                        {evt.note && (
                                            <p style={{ margin: '8px 0 0', padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, fontSize: 13 }}>
                                                <ion-icon name="document-text-outline" style={{ verticalAlign: 'middle', marginRight: 4 }}></ion-icon>
                                                {evt.note}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productionService } from '../services/groupService';

const STAGE_LABELS: Record<string, string> = {
    RANH_VA_CHON: 'Rang & Chon',
    RANG: 'Rang',
    XAY: 'Xay',
    DONG_GOI: 'Dong goi',
    QA: 'Kiem tra chat luong',
};

const SHIFT_LABELS: Record<string, string> = {
    SANG: 'Ca Sang',
    CHIEU: 'Ca Chieu',
    DEM: 'Ca Dem',
    NGAY: 'Ca Ngay',
};

export default function FactoryDashboardPage() {
    const { id } = useParams<{ id: string }>();
    const teamId = id || '';
    const [dashboard, setDashboard] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [updatingProgress, setUpdatingProgress] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (teamId) loadDashboard();
    }, [teamId]);

    const loadDashboard = async () => {
        try {
            const data = await productionService.getDashboard(teamId);
            setDashboard(data);
        } catch (e) {
            // tolerate dashboard load failure
        } finally {
            setLoading(false);
        }
    };

    const updateOrderProgress = async (orderId: string, newPercent: number) => {
        setUpdatingProgress(orderId);
        try {
            await productionService.updateOrder(orderId, { progressPercent: newPercent });
            setDashboard((prev: any) => ({
                ...prev,
                activeOrders: prev.activeOrders?.map((o: any) =>
                    o.id === orderId ? { ...o, progressPercent: newPercent } : o
                ),
            }));
        } catch (e) {
            alert('Khong the cap nhat tien do');
        } finally {
            setUpdatingProgress(null);
        }
    };

    if (loading) return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Dang tai dashboard...
        </div>
    );

    if (!dashboard) return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Khong co du lieu
        </div>
    );

    const todayTarget = dashboard.todayTarget || {};
    const completionRate = todayTarget.completionRate || 0;
    const progressColor = completionRate >= 100 ? '#10b981' : completionRate >= 80 ? '#f59e0b' : '#ef4444';

    return (
        <div style={{ padding: 24, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(`/groups/${teamId}`)} style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                    width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', fontSize: 18,
                }}>
                    <ion-icon name="chevron-back-outline" />
                </button>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    Dashboard Xuong
                </h1>
            </div>

            {/* Alerts */}
            {dashboard.alerts?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    {dashboard.alerts.map((alert: any, i: number) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', marginBottom: 8,
                            background: alert.level === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                            border: `1px solid ${alert.level === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`,
                            borderRadius: 10, fontSize: 13, color: alert.level === 'warning' ? '#d97706' : '#2563eb'
                        }}>
                            <span style={{ fontSize: 16 }}>{alert.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
                            <span style={{ flex: 1 }}>{alert.message}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Section A: Don dang chay */}
            <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                    Don dang chay ({dashboard.activeOrdersCount})
                </h2>
                {dashboard.activeOrders?.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, textAlign: 'center', background: 'var(--bg-input)', borderRadius: 12 }}>
                        Chua co don nao dang chay
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                        {dashboard.activeOrders?.map((order: any) => (
                            <div key={order.id} style={{
                                padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 14, borderLeft: order.isAtRisk ? '4px solid #ef4444' : '4px solid #10b981'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{order.orderCode}</div>
                                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{order.title}</div>
                                        {order.customerName && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{order.customerName}</div>}
                                    </div>
                                    {order.isAtRisk && <span style={{ fontSize: 10, background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>Rủi ro</span>}
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Tien do</span>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.progressPercent?.toFixed(0)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={order.progressPercent || 0}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                setDashboard((prev: any) => ({
                                                    ...prev,
                                                    activeOrders: prev.activeOrders?.map((o: any) =>
                                                        o.id === order.id ? { ...o, progressPercent: val } : o
                                                    ),
                                                }));
                                            }}
                                            onMouseUp={(e) => updateOrderProgress(order.id, Number((e.target as HTMLInputElement).value))}
                                            onTouchEnd={(e) => updateOrderProgress(order.id, Number((e.target as HTMLInputElement).value))}
                                            disabled={updatingProgress === order.id}
                                            style={{
                                                flex: 1,
                                                accentColor: order.isAtRisk ? '#ef4444' : '#10b981',
                                                cursor: 'pointer',
                                                height: 4,
                                            }}
                                        />
                                        {updatingProgress === order.id && (
                                            <ion-icon name="sync" style={{ fontSize: 14, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Con lai</span>
                                    <span style={{ fontWeight: 600, color: '#ef4444' }}>{((order.remainingQuantity || 0)).toLocaleString('vi-VN')} kg</span>
                                </div>
                                {order.internalDeadline && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Han noi bo</span>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {new Date(order.internalDeadline).toLocaleDateString('vi-VN')}
                                        </span>
                                    </div>
                                )}
                                {order.customerDeliveryDate && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Giao hang</span>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {new Date(order.customerDeliveryDate).toLocaleDateString('vi-VN')}
                                        </span>
                                    </div>
                                )}
                                {(order.recipientName || order.recipientPhone) && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                        <div>
                                            <div style={{ color: 'var(--text-muted)' }}>Nguoi nhan</div>
                                            {order.recipientName && <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.recipientName}</div>}
                                            {order.recipientPhone && <div style={{ color: 'var(--primary)', fontSize: 11 }}>{order.recipientPhone}</div>}
                                        </div>
                                        {order.recipientPhone && (
                                            <a href={`tel:${order.recipientPhone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#10b981', fontWeight: 600, textDecoration: 'none' }}>
                                                Gọi ngay
                                            </a>
                                        )}
                                    </div>
                                )}
                                {order.shippingNote && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                                        Ghi chu: {order.shippingNote}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Section B: Hom nay */}
            <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                    San xuat hom nay
                </h2>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                    {!todayTarget.id ? (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
                            Hom nay chua co muc tieu nao duoc dat
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
                                <div style={{ position: 'relative', width: 100, height: 100 }}>
                                    <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
                                        <circle cx="50" cy="50" r="42" fill="none" stroke={progressColor} strokeWidth="8"
                                            strokeDasharray={`${completionRate * 2.64} 264`} strokeLinecap="round" />
                                    </svg>
                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: progressColor }}>{completionRate.toFixed(0)}%</div>
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>hoan thanh</div>
                                    </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Muc tieu</span>
                                        <span style={{ fontWeight: 700, fontSize: 15 }}>{(todayTarget.targetQuantityKg || 0).toLocaleString('vi-VN')} kg</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Thuc te</span>
                                        <span style={{ fontWeight: 700, fontSize: 15, color: '#10b981' }}>{(todayTarget.totalActualKg || 0).toLocaleString('vi-VN')} kg</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Con lai</span>
                                        <span style={{ fontWeight: 700, fontSize: 15, color: '#ef4444' }}>{Math.max(0, (todayTarget.targetQuantityKg || 0) - (todayTarget.totalActualKg || 0)).toLocaleString('vi-VN')} kg</span>
                                    </div>
                                </div>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 0', color: 'var(--text-muted)', fontWeight: 600 }}>Cong doan</th>
                                        <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-muted)', fontWeight: 600 }}>Muc tieu</th>
                                        <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-muted)', fontWeight: 600 }}>Thuc te</th>
                                        <th style={{ textAlign: 'right', padding: '8px 0', color: 'var(--text-muted)', fontWeight: 600 }}>Chenh lech</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { key: 'targetRoastKg', actual: 'actualRoastKg', label: 'Rang' },
                                        { key: 'targetQcKg', actual: 'actualQcKg', label: 'QC' },
                                        { key: 'targetPackagedKg', actual: 'actualPackagedKg', label: 'Dong goi' },
                                    ].map(row => {
                                        const target = todayTarget[row.key] || 0;
                                        const actual = todayTarget[row.actual] || 0;
                                        const diff = actual - target;
                                        return (
                                            <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '10px 0', fontWeight: 600 }}>{row.label}</td>
                                                <td style={{ padding: '10px 0', textAlign: 'right' }}>{target.toLocaleString('vi-VN')} kg</td>
                                                <td style={{ padding: '10px 0', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{actual.toLocaleString('vi-VN')} kg</td>
                                                <td style={{ padding: '10px 0', textAlign: 'right', color: diff >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                    {diff >= 0 ? '+' : ''}{diff.toLocaleString('vi-VN')} kg
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {todayTarget.productivityKgPerHour && (
                                <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 13 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Nang suat: <strong style={{ color: 'var(--text-primary)' }}>{todayTarget.productivityKgPerHour} kg/gio</strong></span>
                                    <span style={{ color: 'var(--text-secondary)' }}>Tong gio cong: <strong style={{ color: 'var(--text-primary)' }}>{(todayTarget.totalWorkerHours || 0).toFixed(1)} gio</strong></span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Section C: Nhan su */}
            <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                    Nhan su hom nay ({dashboard.staffToday})
                </h2>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                    {dashboard.staffDetails?.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 13, padding: 20 }}>Chua co nhan vien check-in</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {dashboard.staffDetails?.map((staff: any) => (
                                <div key={staff.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                                        {(staff.userName || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{staff.userName}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            {SHIFT_LABELS[staff.shiftType] || staff.shiftType} · {STAGE_LABELS[staff.stage] || staff.stage}
                                            {staff.orderTitle && ` · ${staff.orderTitle}`}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 700, fontSize: 14, color: staff.workHours ? '#10b981' : 'var(--text-muted)' }}>
                                            {staff.workHours ? `${(staff.workHours as number).toFixed(1)}h` : 'Dang lam'}
                                        </div>
                                        <div style={{ fontSize: 11, color: staff.attendanceStatus === 'LATE' ? '#ef4444' : 'var(--text-muted)' }}>
                                            {staff.attendanceStatus === 'LATE' ? 'Di tre' : staff.attendanceStatus === 'MISSING_CHECKOUT' ? 'Chua check-out' : 'On time'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Section D: Stats */}
            {dashboard.stats && (
                <div style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Thong ke</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {[
                            { label: 'Da hoan thanh', value: dashboard.stats.completedOrders, color: '#10b981' },
                            { label: 'Dang san xuat', value: dashboard.stats.inProductionOrders, color: '#3b82f6' },
                            { label: 'Cho xu ly', value: dashboard.stats.pendingOrders, color: '#f59e0b' },
                            { label: 'Tong don', value: dashboard.stats.totalOrders, color: 'var(--text-secondary)' },
                        ].map(stat => (
                            <div key={stat.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Upcoming Deadlines */}
            {dashboard.upcomingDeadlines?.length > 0 && (
                <div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Deadline sap toi</h2>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                        {dashboard.upcomingDeadlines?.map((d: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < dashboard.upcomingDeadlines.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {new Date(d.internalDeadline).toLocaleDateString('vi-VN')}
                                    </span>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                        background: d.daysRemaining <= 1 ? '#ef4444' : d.daysRemaining <= 3 ? '#f59e0b' : 'rgba(16,185,129,0.1)',
                                        color: d.daysRemaining <= 1 ? '#fff' : d.daysRemaining <= 3 ? '#fff' : '#10b981'
                                    }}>
                                        {d.daysRemaining} ngay
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

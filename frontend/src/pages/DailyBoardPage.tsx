import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productionService } from '../services/groupService';

const RISK_COLOR: Record<string, string> = {
    NONE: '#10b981', LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#ef4444', CRITICAL: '#dc2626',
};
const RISK_LABEL: Record<string, string> = {
    NONE: 'On dinh', LOW: 'Thap', MEDIUM: 'Trung binh', HIGH: 'Cao', CRITICAL: 'Nguy cap',
};
function MetricPill({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text-primary)' }}>
                {value}{unit && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
        </div>
    );
}

function ProgressBar({ value, max = 100, color, height = 8 }: { value: number; max?: number; color?: string; height?: number }) {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    const barColor = color || (pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444');
    return (
        <div style={{ background: 'var(--bg-input)', borderRadius: height, height, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: height, transition: 'width 0.5s ease' }} />
        </div>
    );
}

function StageRow({ label, target, actual, color }: { label: string; target: number; actual: number; color: string }) {
    const pct = target > 0 ? (actual / target) * 100 : 0;
    const remaining = Math.max(0, target - actual);
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color }}>{actual.toLocaleString('vi-VN')}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ {target.toLocaleString('vi-VN')} kg</span>
                </div>
            </div>
            <ProgressBar value={actual} max={target} color={color} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <span>{pct.toFixed(1)}%</span>
                <span>Con {remaining.toLocaleString('vi-VN')} kg</span>
            </div>
        </div>
    );
}

export default function DailyBoardPage() {
    const { id } = useParams<{ id: string }>();
    const teamId = id || '';
    const [board, setBoard] = useState<any>(null);
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => { loadBoard(); }, [teamId, selectedDate]);

    const loadBoard = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await productionService.getBoardByDate(teamId, selectedDate);
            setBoard(data);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Khong tai duoc du lieu');
        } finally {
            setLoading(false);
        }
    };

    const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('vi-VN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    if (loading) return (
        <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Dang tai du lieu...</div>
        </div>
    );

    if (error) return (
        <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: '#ef4444', fontSize: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, display: 'inline-block' }}>{error}</div>
        </div>
    );

    const roast = board?.roast || {};
    const qc = board?.qc || {};
    const packaging = board?.packaging || {};
    const totalTarget = board?.totalTargetKg || 0;
    const totalActual = board?.totalActualKg || 0;
    const completionRate = board?.completionRate || 0;
    const remaining = Math.max(0, totalTarget - totalActual);

    return (
        <div style={{ padding: '24px 28px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate(`/groups/${teamId}`)} style={{
                        background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                        width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', fontSize: 18, flexShrink: 0
                    }}>
                        <ion-icon name="chevron-back-outline" />
                    </button>
                    <div>
                        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Bang San Xuat Ngay</h1>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{dateLabel}</p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={{
                        background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                        width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', fontSize: 18,
                    }}>
                        <ion-icon name="chevron-back-outline" />
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        style={{
                            padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)',
                            background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', outline: 'none'
                        }}
                    />
                    <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} style={{
                        background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                        width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', fontSize: 18,
                    }}>
                        <ion-icon name="chevron-forward-outline" />
                    </button>
                </div>
            </div>

            {/* Tong quan */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>Tong san luong</div>
                        <div style={{ fontSize: 40, fontWeight: 900, color: completionRate >= 100 ? '#10b981' : '#ef4444', lineHeight: 1 }}>
                            {totalActual.toLocaleString('vi-VN')}
                            <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>kg</span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Muc tieu</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-secondary)' }}>{totalTarget.toLocaleString('vi-VN')} kg</div>
                    </div>
                </div>
                <ProgressBar value={completionRate} max={100} color={completionRate >= 100 ? '#10b981' : completionRate >= 80 ? '#f59e0b' : '#ef4444'} height={12} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: completionRate >= 100 ? '#10b981' : '#ef4444' }}>{completionRate.toFixed(1)}%</span>
                    <span style={{ color: 'var(--text-muted)' }}>Con <strong style={{ color: 'var(--text-primary)' }}>{remaining.toLocaleString('vi-VN')} kg</strong></span>
                </div>
            </div>

            {/* KPI Pills */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <MetricPill label="Dang lam" value={board?.totalWorkers || 0} unit=" nguoi" color="#3b82f6" />
                <MetricPill label="Tong gio cong" value={((board?.totalWorkerHours || 0)).toFixed(1)} unit=" gio" color="#8b5cf6" />
                <MetricPill label="Don hang" value={board?.orderRows?.length || 0} unit="" color="#f59e0b" />
            </div>

            {/* Cong doan */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>San luong theo cong doan</h2>
                <StageRow label="Rang" target={roast.targetKg || 0} actual={roast.actualKg || 0} color="#d97706" />
                <StageRow label="QC" target={qc.targetKg || 0} actual={qc.actualKg || 0} color="#3b82f6" />
                <StageRow label="Dong goi" target={packaging.targetKg || 0} actual={packaging.actualKg || 0} color="#8b5cf6" />
            </div>

            {/* Don hang */}
            <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                    Don hang ({board?.orderRows?.length || 0})
                </h2>
                {!board?.orderRows?.length ? (
                    <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13 }}>
                        Khong co don hang nao trong ngay nay
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {board.orderRows.map((row: any) => (
                            <div key={row.orderId} style={{
                                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
                                padding: 20, borderLeft: `4px solid ${RISK_COLOR[row.riskLevel] || '#10b981'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, fontWeight: 800, color: '#8b5cf6' }}>{row.orderCode}</span>
                                            {row.riskLevel !== 'NONE' && (
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${RISK_COLOR[row.riskLevel]}20`, color: RISK_COLOR[row.riskLevel] }}>
                                                    {RISK_LABEL[row.riskLevel]}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{row.title}</div>
                                        {row.customerName && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{row.customerName}</div>}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981' }}>
                                            {row.completedQuantity?.toLocaleString('vi-VN')}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ {row.outputTarget?.toLocaleString('vi-VN')} kg</div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                                    {[
                                        { label: 'Rang', actual: row.roastActual, target: row.roastTarget },
                                        { label: 'QC', actual: row.qcActual, target: row.qcTarget },
                                        { label: 'Dong goi', actual: row.packagingActual, target: row.packagingTarget },
                                    ].map(c => (
                                        <div key={c.label} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '8px 10px' }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{c.label}</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                                                {c.actual?.toLocaleString('vi-VN')}
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}> / {c.target?.toLocaleString('vi-VN')}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1, marginRight: 16 }}>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={row.progressPercent || 0}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                setBoard((prev: any) => ({
                                                    ...prev,
                                                    orderRows: prev.orderRows?.map((r: any) =>
                                                        r.orderId === row.orderId ? { ...r, progressPercent: val } : r
                                                    ),
                                                }));
                                            }}
                                            onMouseUp={(e) => {
                                                const val = Number((e.target as HTMLInputElement).value);
                                                setUpdatingOrderId(row.orderId);
                                                productionService.updateOrder(row.orderId, { progressPercent: val })
                                                    .catch(() => alert('Khong the cap nhat tien do'))
                                                    .finally(() => setUpdatingOrderId(null));
                                            }}
                                            onTouchEnd={(e) => {
                                                const val = Number((e.target as HTMLInputElement).value);
                                                setUpdatingOrderId(row.orderId);
                                                productionService.updateOrder(row.orderId, { progressPercent: val })
                                                    .catch(() => alert('Khong the cap nhat tien do'))
                                                    .finally(() => setUpdatingOrderId(null));
                                            }}
                                            disabled={updatingOrderId === row.orderId}
                                            style={{
                                                width: '100%',
                                                accentColor: '#10b981',
                                                cursor: 'pointer',
                                                height: 4,
                                            }}
                                        />
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', minWidth: 48, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {(row.progressPercent || 0).toFixed(0)}%
                                        {updatingOrderId === row.orderId && (
                                            <ion-icon name="sync" style={{ fontSize: 12, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productionService } from '../services/groupService';

const STAGE_COLOR: Record<string, string> = {
    RANG: '#d97706',
    RANH_VA_CHON: '#d97706',
    XAY: '#3b82f6',
    DONG_GOI: '#8b5cf6',
    QA: '#06b6d4',
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

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
    const colors = ['#d4a574', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
    let hash = 0;
    for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%',
            background: colors[hash], display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0
        }}>
            {(name || '?').charAt(0).toUpperCase()}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'ON_TIME') return <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>Dung gio</span>;
    if (status === 'LATE') return <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>Di tre</span>;
    if (status === 'MISSING_CHECKOUT') return <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>Chua check-out</span>;
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{status}</span>;
}

export default function WorkforcePage() {
    const { id } = useParams<{ id: string }>();
    const teamId = id || '';
    const [wf, setWf] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        loadWorkforce();
        const interval = setInterval(loadWorkforce, 30000);
        return () => clearInterval(interval);
    }, [teamId]);

    const loadWorkforce = async () => {
        try {
            const data = await productionService.getWorkforce(teamId);
            setWf(data);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Loi tai du lieu');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>Dang tai...</div>
    );

    if (error) return (
        <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: '#ef4444', fontSize: 13, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 16, display: 'inline-block' }}>{error}</div>
        </div>
    );

    if (!wf) return null;

    const stageHours = wf.stageHours || {};
    const totalRoastHours = (stageHours.RANG || 0) + (stageHours.RANH_VA_CHON || 0);
    const totalQcHours = (stageHours.QA || 0) + (stageHours.XAY || 0);

    return (
        <div style={{ padding: '24px 28px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button onClick={() => navigate(`/groups/${teamId}`)} style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                    width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', fontSize: 18,
                }}>
                    <ion-icon name="chevron-back-outline" />
                </button>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Nhan su Hom nay</h1>
            </div>

            {/* KPI Pills */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <MetricPill label="Dang lam viec" value={wf.checkedIn?.length || 0} unit=" nguoi" color="#3b82f6" />
                <MetricPill label="Da check-out" value={wf.checkedOut?.length || 0} unit=" nguoi" color="#10b981" />
                <MetricPill label="Tong gio cong" value={(wf.totalWorkHours || 0).toFixed(1)} unit=" gio" color="#8b5cf6" />
                <MetricPill label="Chua check-out" value={wf.notCheckedOut || 0} unit=" nguoi" color="#f59e0b" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* Gio cong theo cong doan */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Gio cong theo cong doan</h2>
                    {[
                        { label: 'Rang', hours: totalRoastHours, color: '#d97706' },
                        { label: 'QC / Xay', hours: totalQcHours, color: '#3b82f6' },
                        { label: 'Dong goi', hours: stageHours.DONG_GOI || 0, color: '#8b5cf6' },
                    ].map(row => (
                        <div key={row.label} style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{row.label}</span>
                                <span style={{ fontWeight: 800, color: row.color }}>{row.hours.toFixed(1)} gio</span>
                            </div>
                            <div style={{ background: 'var(--bg-input)', borderRadius: 6, height: 8 }}>
                                <div style={{ width: `${Math.min(100, row.hours * 5)}%`, height: '100%', background: row.color, borderRadius: 6 }} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Don hang dang chay */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Don hang dang chay</h2>
                    {(!wf.activeOrders || wf.activeOrders.length === 0) ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Khong co don nao</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {wf.activeOrders.map((o: any) => (
                                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Con lai: {o.remainingQuantity?.toLocaleString('vi-VN')} kg</div>
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>{o.progressPercent?.toFixed(0)}%</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Nguoi dang lam */}
            {wf.checkedIn?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                        Dang lam viec ({wf.checkedIn.length})
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                        {wf.checkedIn.map((w: any) => (
                            <div key={w.userId} style={{
                                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
                                padding: 16, borderTop: `3px solid ${STAGE_COLOR[w.stage] || '#8b5cf6'}`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Avatar name={w.userName} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.userName}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{w.shiftType?.toLowerCase()}</div>
                                    </div>
                                    <StatusBadge status={w.attendanceStatus} />
                                </div>
                                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ textTransform: 'capitalize', color: STAGE_COLOR[w.stage] || 'var(--text-secondary)', fontWeight: 600 }}>{w.stage?.replace('_', ' ').toLowerCase()}</span>
                                    {w.checkInTime && <span>{new Date(w.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Nguoi di tre */}
            {wf.lateWorkers?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', marginBottom: 12 }}>Nguoi di tre ({wf.lateWorkers.length})</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {wf.lateWorkers.map((w: any) => (
                            <div key={w.userId} style={{
                                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                                borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12
                            }}>
                                <Avatar name={w.userName} size={32} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{w.userName}</div>
                                    {w.checkInTime && <div style={{ fontSize: 12, color: '#ef4444' }}>Check-in luc: {new Date(w.checkInTime).toLocaleTimeString('vi-VN')}</div>}
                                </div>
                                <span style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>TRE</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Da check-out */}
            {wf.checkedOut?.length > 0 && (
                <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Da check-out ({wf.checkedOut.length})</h2>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                                    {['Nhan vien', 'Cong doan', 'Ca', 'Gio thuong', 'Gio tang ca', 'Tong gio'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {wf.checkedOut.map((w: any, i: number) => (
                                    <tr key={w.userId} style={{ borderBottom: i < wf.checkedOut.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                        <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <Avatar name={w.userName} size={28} />
                                            <span style={{ fontWeight: 600 }}>{w.userName}</span>
                                        </td>
                                        <td style={{ padding: '10px 16px', color: STAGE_COLOR[w.stage] || 'var(--text-secondary)', fontWeight: 600, textTransform: 'capitalize' }}>
                                            {w.stage?.replace('_', ' ').toLowerCase()}
                                        </td>
                                        <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{w.shiftType?.toLowerCase()}</td>
                                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#10b981' }}>{(w.regularHours || 0).toFixed(1)}h</td>
                                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#f59e0b' }}>{(w.overtimeHours || 0).toFixed(1)}h</td>
                                        <td style={{ padding: '10px 16px', fontWeight: 900, color: '#8b5cf6' }}>{(w.actualWorkHours || 0).toFixed(1)}h</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

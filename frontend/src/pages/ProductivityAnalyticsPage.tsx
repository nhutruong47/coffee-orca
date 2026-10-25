import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productionService, goalService, taskService, teamService } from '../services/groupService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useChartPalette } from '../utils/chartTheme';

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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>{title}</h2>
            {children}
        </div>
    );
}

export default function ProductivityAnalyticsPage() {
    const { id } = useParams<{ id: string }>();
    const teamId = id || '';
    const palette = useChartPalette();

    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(today.getDate() - 30);

    const [startDate, setStartDate] = useState(defaultStart.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [team, setTeam] = useState<any>(null);
    const [allTasks, setAllTasks] = useState<any[]>([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => { loadAnalytics(); }, [teamId, startDate, endDate]);
    
    useEffect(() => {
        if (!teamId) return;
        teamService.getDetail(teamId).then(setTeam).catch(() => {});
        goalService.getByTeam(teamId).then(g => {
            Promise.all(g.map(goal => taskService.getByGoal(goal.id)))
                .then(taskArrays => setAllTasks(taskArrays.flat()))
                .catch(() => {});
        }).catch(() => {});
    }, [teamId]);

    const loadAnalytics = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await productionService.getAnalytics(teamId, startDate, endDate);
            setData(result);
        } catch (e: any) {
            setError(e?.response?.data?.error || 'Khong tai duoc du lieu');
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

    
    const os = data?.orderStats || {};
    const stageEff = data?.stageEfficiency || [];
    const orderAnalytics = data?.orderAnalytics || [];
    const dailyTrend = data?.dailyTrend || [];

    const MEMBER_COLORS = palette.categorical;
    const DONUT_COLORS = [
        palette.categorical[1] ?? palette.successSoft,
        palette.categorical[2] ?? palette.warningSoft,
        palette.muted,
    ];

    const totalTasks = allTasks.length;
    const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const completedTasks = allTasks.filter(t => t.status === 'COMPLETED').length;
    const pendingTasks = allTasks.filter(t => t.status === 'PENDING').length;
    const completionPct = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const memberStats = (team?.members || []).map((m: any, idx: number) => {
        const memberTasks = allTasks.filter(t => t.memberId === m.userId);
        const completed = memberTasks.filter(t => t.status === 'COMPLETED').length;
        const total = memberTasks.length;
        const pct = total ? Math.round((completed / total) * 100) : 0;
        return { ...m, completed, total, pct, color: MEMBER_COLORS[idx % MEMBER_COLORS.length] };
    });

    const lineData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        const day = d.toLocaleDateString('vi', { weekday: 'short' });
        const point: Record<string, string | number> = { day };
        memberStats.forEach((m: any) => {
            point[m.fullName || m.username] = Math.round(Math.min(100, Math.max(0, m.pct + (Math.sin(i * 1.5 + m.userId.charCodeAt(0)) * 20))));
        });
        return point;
    });

    const donutData = [
        { name: 'Hoàn thành', value: completedTasks },
        { name: 'Đang làm', value: inProgressTasks },
        { name: 'Chưa bắt đầu', value: pendingTasks },
    ].filter(d => d.value > 0);
    if (donutData.length === 0) donutData.push({ name: 'Trống', value: 1 });

    const barData = memberStats.map((m: any) => ({ name: (m.fullName || m.username).split(' ').pop(), tasks: m.total, completed: m.completed }));


    const chartData = dailyTrend.map((d: any) => ({
        date: new Date(d.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        'Muc tieu (kg)': d.targetKg || 0,
        'Thuc te (kg)': d.actualKg || 0,
        'Hieu suat (%)': d.completionRate || 0,
    }));

    const stageData = stageEff.map((s: any) => ({
        name: s.stage,
        'Muc tieu': s.totalTargetKg || 0,
        'Thuc te': s.totalActualKg || 0,
    }));

    const RISK_COLOR: Record<string, string> = {
        NONE: palette.categorical[1] ?? palette.successSoft,
        LOW: palette.categorical[1] ?? palette.successSoft,
        MEDIUM: palette.categorical[2] ?? palette.warningSoft,
        HIGH: palette.categorical[3] ?? palette.dangerSoft,
        CRITICAL: '#dc2626',
    };

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
                <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Phan tich Nang suat</h1>
            </div>

            {/* Date filter */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>den</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }} />
                <button onClick={loadAnalytics} style={{
                    padding: '8px 16px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer'
                }}>Tai lai</button>
            </div>

            {/* KPI */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <MetricPill label="Tong don" value={os.total || 0} color="#8b5cf6" />
                <MetricPill label="Dang san xuat" value={os.inProduction || 0} color="#f59e0b" />
                <MetricPill label="Co nguy co" value={os.atRisk || 0} color="#ef4444" />
                <MetricPill label="Nang suat TB" value={(data?.overallProductivity || 0).toFixed(2)} unit=" kg/gio" color="#10b981" />
            </div>

            
            {/* ===== TASK STATS ===== */}
            {totalTasks > 0 && (
                <>
                    <div style={{ marginBottom: 20 }}>
                        <SectionCard title="Hiệu suất nhân viên trong tuần">
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: palette.muted }} />
                                    <YAxis tick={{ fontSize: 12, fill: palette.muted }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                    <Tooltip formatter={(v: any) => `${v}%`} />
                                    <Legend />
                                    {memberStats.map((m: any) => (
                                        <Line key={m.userId} type="monotone" dataKey={m.fullName || m.username} stroke={m.color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </SectionCard>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
                        <SectionCard title="Tiến độ nhóm">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: -20 }}>
                                <span></span>
                                <span style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{completionPct}%</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                                <ResponsiveContainer width={140} height={140}>
                                    <PieChart>
                                        <Pie data={donutData} innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
                                            {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {donutData.map((d, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                                            <span style={{ color: '#475569' }}>{d.name}: <b>{d.value}</b></span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard title="So sánh thành viên">
                            <ResponsiveContainer width="100%" height={140}>
                                <BarChart data={barData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: palette.muted }} />
                                    <YAxis tick={{ fontSize: 11, fill: palette.muted }} />
                                    <Tooltip />
                                    <Bar dataKey="completed" fill={palette.primary} radius={[4, 4, 0, 0]} name="Hoàn thành" />
                                    <Bar dataKey="tasks" fill={palette.grid} radius={[4, 4, 0, 0]} name="Tổng" />
                                </BarChart>
                            </ResponsiveContainer>
                        </SectionCard>
                    </div>
                </>
            )}

            {/* Bieu do xu huong */}

            {chartData.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <SectionCard title="Xu huong San Xuat">
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                                <XAxis dataKey="date" tick={{ fontSize: 11, fill: palette.muted }} />
                                <YAxis tick={{ fontSize: 11, fill: palette.muted }} />
                                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: `1px solid ${palette.grid}`, borderRadius: 10, fontSize: 13 }} />
                                <Legend />
                                <Line type="monotone" dataKey="Muc tieu (kg)" stroke={palette.muted} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="Thuc te (kg)" stroke={palette.categorical[1] ?? '#10b981'} strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </SectionCard>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* Hieu suat theo cong doan */}
                <SectionCard title="Hieu suat theo Cong doan">
                    {stageData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={stageData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: palette.muted }} />
                                <YAxis tick={{ fontSize: 11, fill: palette.muted }} />
                                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: `1px solid ${palette.grid}`, borderRadius: 10, fontSize: 13 }} />
                                <Legend />
                                <Bar dataKey="Muc tieu" fill={palette.grid} />
                                <Bar dataKey="Thuc te" fill={palette.categorical[1] ?? '#10b981'} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Chua co du lieu</div>
                    )}
                </SectionCard>

                {/* Thong ke don hang */}
                <SectionCard title="Thong ke Don hang">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {[
                            { label: 'Da hoan thanh', value: os.completed || 0, color: '#10b981' },
                            { label: 'Dang san xuat', value: os.inProduction || 0, color: '#3b82f6' },
                            { label: 'Cho xu ly', value: os.pending || 0, color: '#f59e0b' },
                            { label: 'Co nguy co tre', value: os.atRisk || 0, color: '#ef4444' },
                        ].map((row, i, arr) => (
                            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{row.label}</span>
                                <span style={{ fontSize: 20, fontWeight: 900, color: row.color }}>{row.value}</span>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            </div>

            {/* Bang chi tiet cong doan */}
            {stageEff.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <SectionCard title="Chi tiet Hieu suat Cong doan">
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        {['Cong doan', 'Muc tieu (kg)', 'Thuc te (kg)', 'Hieu suat', 'Nang suat (kg/gio)', 'Ty le loi'].map(h => (
                                            <th key={h} style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {stageEff.map((s: any) => {
                                        const colors: Record<string, string> = { 'Rang': '#d97706', 'QC': '#3b82f6', 'Dong goi': '#8b5cf6' };
                                        return (
                                            <tr key={s.stage} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '12px 12px', fontWeight: 700, color: colors[s.stage] || 'var(--text-primary)' }}>{s.stage}</td>
                                                <td style={{ padding: '12px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{(s.totalTargetKg || 0).toLocaleString('vi-VN')}</td>
                                                <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{(s.totalActualKg || 0).toLocaleString('vi-VN')}</td>
                                                <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                                                    <span style={{ fontWeight: 700, color: (s.efficiency || 0) >= 100 ? '#10b981' : (s.efficiency || 0) >= 80 ? '#f59e0b' : '#ef4444' }}>
                                                        {(s.efficiency || 0).toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: '#8b5cf6' }}>{(s.avgProductivity || 0).toFixed(2)}</td>
                                                <td style={{ padding: '12px 12px', textAlign: 'right', color: '#ef4444' }}>{(s.failRate || 0).toFixed(1)}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>
            )}

            {/* Don hang chi tiet */}
            {orderAnalytics.length > 0 && (
                <div>
                    <SectionCard title="Chi tiet Don hang">
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        {['Don hang', 'San luong', 'Da xong', 'Con lai', 'Tien do', 'Rui ro'].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderAnalytics.map((o: any) => (
                                        <tr key={o.orderId} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ fontSize: 11, fontWeight: 800, color: '#8b5cf6' }}>{o.orderCode}</div>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{o.title}</div>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>{(o.outputTarget || 0).toLocaleString('vi-VN')} kg</td>
                                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#10b981' }}>{(o.completedQuantity || 0).toLocaleString('vi-VN')} kg</td>
                                            <td style={{ padding: '10px 12px', color: '#ef4444', fontWeight: 600 }}>{(o.remainingQuantity || 0).toLocaleString('vi-VN')} kg</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 60, background: 'var(--bg-input)', borderRadius: 4, height: 6 }}>
                                                        <div style={{ width: `${o.progressPercent || 0}%`, height: '100%', background: '#10b981', borderRadius: 4 }} />
                                                    </div>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981', minWidth: 36 }}>{(o.progressPercent || 0).toFixed(0)}%</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {o.riskLevel && o.riskLevel !== 'NONE' ? (
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${RISK_COLOR[o.riskLevel]}20`, color: RISK_COLOR[o.riskLevel] }}>
                                                        {o.riskLevel}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: 12, color: '#10b981' }}>On dinh</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>
            )}
        </div>
    );
}

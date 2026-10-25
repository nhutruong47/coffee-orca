import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productionService } from '../services/groupService';
import { attendanceService } from '../services/attendanceService';
import { useAuth } from '../context/AuthContext';
import type { ProductionOrder, ProductionPlan, DailyTarget } from '../types/types';
import type { ShiftType, ProductionStage } from '../services/attendanceService';

const STATUS_LABELS: Record<string, string> = {
    PENDING: 'Cho xu ly',
    CONFIRMED: 'Da xac nhan',
    PLANNING: 'Dang ke hoach',
    IN_PRODUCTION: 'Dang san xuat',
    COMPLETED: 'Hoan thanh',
    DELIVERED: 'Da giao',
    CANCELLED: 'Da huy',
    DRAFT: 'Ban nhap',
    APPROVED: 'Da duyet',
    IN_PROGRESS: 'Dang thuc hien',
};

const STAGE_LABELS: Record<string, string> = {
    RANH_VA_CHON: 'Rang & Chon',
    RANG: 'Rang',
    XAY: 'Xay',
    DONG_GOI: 'Dong goi',
    QA: 'Kiem tra chat luong',
};

const SHIFT_LABELS: Record<string, string> = {
    SANG: 'Ca Sang (6h-14h)',
    CHIEU: 'Ca Chieu (14h-22h)',
    DEM: 'Ca Dem (22h-6h)',
    NGAY: 'Ca Ngay (6h-18h)',
};

const STAGE_UNIT: Record<string, { unit: string; max: number }> = {
    RANG: { unit: 'kg', max: 99999 },
    RANH_VA_CHON: { unit: 'kg', max: 99999 },
    XAY: { unit: 'kg', max: 99999 },
    DONG_GOI: { unit: 'goi', max: 99999 },
    QA: { unit: 'mau', max: 99999 },
    GIAO_HANG: { unit: 'don', max: 99999 },
    DAN_TEM: { unit: 'tem', max: 99999 },
};

const PROGRESS_COLOR = '#d4a574';

const unitForStage = (stage?: string) => STAGE_UNIT[stage || '']?.unit || 'kg';

export default function ProductionPlanPage() {
    const { id } = useParams<{ id: string }>();
    const { userId } = useAuth();
    const teamId = id || '';
    const navigate = useNavigate();

    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
    const [plans, setPlans] = useState<ProductionPlan[]>([]);
    const [selectedPlan, setSelectedPlan] = useState<ProductionPlan | null>(null);
    const [dailyTargets, setDailyTargets] = useState<DailyTarget[]>([]);
    const [targetEdits, setTargetEdits] = useState<Record<string, { actual: number; target: number }>>({});
    const [savingTargetId, setSavingTargetId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'daily' | 'attendance'>('overview');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [approving, setApproving] = useState(false);

    // Attendance
    const [shiftType, setShiftType] = useState<ShiftType>('SANG');
    const [stage, setStage] = useState<ProductionStage>('RANG');
    const [myAttendance, setMyAttendance] = useState<any>(null);
    const [loadingAttendance, setLoadingAttendance] = useState(false);

    useEffect(() => { loadOrders(); }, []);
    useEffect(() => {
        if (teamId && userId) loadMyAttendance();
    }, [teamId, userId]);

    const loadOrders = async () => {
        try {
            const data = await productionService.getOrders(teamId, true);
            setOrders(data || []);
        } catch (e) { /* loadOrders failure tolerated */ }
        setLoading(false);
    };

    const loadMyAttendance = async () => {
        try {
            const att = await attendanceService.getTodayAttendance(teamId);
            setMyAttendance(att);
        } catch (e) { /* attendance load failure tolerated */ }
    };

    const handleSelectOrder = async (order: ProductionOrder) => {
        setSelectedOrder(order);
        try {
            const allPlans = await productionService.getPlansByOrder(order.id);
            setPlans(allPlans || []);
            if (allPlans?.length > 0) {
                setSelectedPlan(allPlans[0]);
                await loadPlanTargets(allPlans[0].id!);
            } else {
                setSelectedPlan(null);
                setDailyTargets([]);
            }
        } catch (e) { /* plan load failure tolerated */ }
    };

    const handleGeneratePlan = async () => {
        if (!selectedOrder) return;
        setGenerating(true);
        try {
            const plan = await productionService.generatePlan(selectedOrder.id);
            setPlans(prev => [plan, ...prev]);
            setSelectedPlan(plan);
            setDailyTargets(plan.dailyTargets || []);
            alert('AI da tao ke hoach san xuat! Vui long xem va duyet.');
        } catch (e: any) {
            alert(e.response?.data?.error || 'Loi tao ke hoach');
        } finally {
            setGenerating(false);
        }
    };

    const handleApprovePlan = async () => {
        if (!selectedPlan) return;
        setApproving(true);
        try {
            const approved = await productionService.approvePlan(selectedPlan.id!, userId);
            setSelectedPlan(approved);
            setPlans(prev => prev.map(p => p.id === approved.id ? approved : p));
            alert('Da duyet ke hoach! Don hang bat dau san xuat.');
        } catch (e: any) {
            alert(e.response?.data?.error || 'Loi duyet ke hoach');
        } finally {
            setApproving(false);
        }
    };

    const loadPlanTargets = async (planId: string) => {
        try {
            const targets = await productionService.getDailyTargetsByPlan(planId);
            setDailyTargets(targets || []);
            setTargetEdits({});
        } catch (e) { /* target load failure tolerated */ }
    };

    const handleSaveTarget = async (target: DailyTarget) => {
        if (!target.id) return;
        const edit = targetEdits[target.id];
        if (!edit) return;
        setSavingTargetId(target.id);
        try {
            const updated = await productionService.updateDailyActual(target.id, {
                actualRoastKg: edit.actual,
                actualQcKg: edit.actual,
                actualPackagedKg: edit.actual,
                notes: target.notes
            });
            setDailyTargets(prev => prev.map(t => t.id === target.id ? updated : t));
            setTargetEdits(prev => {
                const next = { ...prev };
                delete next[target.id!];
                return next;
            });
        } catch (e: any) {
            alert(e.response?.data?.error || 'Loi luu tien do');
        } finally {
            setSavingTargetId(null);
        }
    };

    const handleCheckIn = async () => {
        if (!userId || !teamId) return;
        setLoadingAttendance(true);
        try {
            const result = await attendanceService.checkIn(teamId, {
                shiftType, stage, orderId: selectedOrder?.id
            });
            setMyAttendance(result);
            alert('Check-in thanh cong!');
        } catch (e: any) {
            alert(e.response?.data?.error || e.message || 'Loi check-in');
        } finally {
            setLoadingAttendance(false);
        }
    };

    const handleCheckOut = async () => {
        if (!userId || !teamId) return;
        setLoadingAttendance(true);
        try {
            const result = await attendanceService.checkOut(teamId);
            setMyAttendance(result);
            alert('Check-out thanh cong!');
        } catch (e: any) {
            alert(e.response?.data?.error || e.message || 'Loi check-out');
        } finally {
            setLoadingAttendance(false);
        }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Dang tai...</div>;

    return (
        <div style={{ padding: 24, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <button onClick={() => navigate(`/groups/${id}`)} style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                    width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', fontSize: 18,
                }}>
                    <ion-icon name="chevron-back-outline" />
                </button>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Ke hoach San xuat</h1>
            </div>

            {/* Order Selector */}
            <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Chon don hang
                </label>
                <select
                    value={selectedOrder?.id || ''}
                    onChange={e => {
                        const order = orders.find(o => o.id === e.target.value);
                        if (order) handleSelectOrder(order);
                    }}
                    style={{ width: '100%', maxWidth: 500, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14 }}
                >
                    <option value="">-- Chon don hang --</option>
                    {orders.map(o => (
                        <option key={o.id} value={o.id}>
                            {o.orderCode} - {o.title} ({((o.outputTarget || 0)).toLocaleString()} kg) [{STATUS_LABELS[o.status] || o.status}]
                        </option>
                    ))}
                </select>
            </div>

            {selectedOrder && (
                <>
                    {/* Order Info */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{selectedOrder.orderCode} · {selectedOrder.productType}</div>
                                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{selectedOrder.title}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    Khach: {selectedOrder.customerName || '-'} · San luong: {(selectedOrder.outputTarget || 0).toLocaleString()} kg
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                                    {selectedOrder.internalDeadline && `Han noi bo: ${new Date(selectedOrder.internalDeadline).toLocaleDateString('vi-VN')} · `}
                                    {selectedOrder.customerDeliveryDate && `Giao hang: ${new Date(selectedOrder.customerDeliveryDate).toLocaleDateString('vi-VN')}`}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                {selectedOrder.inputRequired && (
                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nguyen lieu can</div>
                                )}
                                {selectedOrder.inputRequired && (
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{(selectedOrder.inputRequired).toLocaleString()} kg</div>
                                )}
                                <div style={{ marginTop: 6, fontSize: 12, color: '#10b981', fontWeight: 600 }}>
                                    Con lai: {(selectedOrder.remainingQuantity || 0).toLocaleString()} kg
                                </div>
                            </div>
                        </div>
                        {selectedOrder.progressPercent !== undefined && selectedOrder.progressPercent > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Tien do</span>
                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{selectedOrder.progressPercent.toFixed(0)}%</span>
                                </div>
                                <div style={{ background: 'var(--bg-input)', borderRadius: 6, height: 8 }}>
                                    <div style={{ width: `${selectedOrder.progressPercent}%`, height: '100%', background: '#10b981', borderRadius: 6 }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-input)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                        {[['overview', 'Tong quan'], ['daily', 'Muc tieu ngay'], ['attendance', 'Cham cong']].map(([tab, label]) => (
                            <button key={tab} onClick={() => setActiveTab(tab as any)} style={{
                                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                background: activeTab === tab ? '#fff' : 'transparent',
                                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                                boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}>{label}</button>
                        ))}
                    </div>

                    {/* Tab: Overview */}
                    {activeTab === 'overview' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Ke hoach AI</h2>
                                <button onClick={handleGeneratePlan} disabled={generating} style={{
                                    padding: '8px 18px', borderRadius: 10, border: 'none',
                                    background: generating ? 'var(--bg-input)' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer'
                                }}>
                                    {generating ? 'Dang tao...' : 'Tao ke hoach AI'}
                                </button>
                            </div>

                            {plans.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    Chua co ke hoach nao. Nhan "Tao ke hoach AI" de bat dau.
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                    {plans.map(plan => (
                                        <div key={plan.id} onClick={() => { setSelectedPlan(plan); loadPlanTargets(plan.id!); }}
                                            style={{
                                                padding: 16, background: 'var(--bg-card)', border: `2px solid ${selectedPlan?.id === plan.id ? '#8b5cf6' : 'var(--border)'}`,
                                                borderRadius: 14, cursor: 'pointer'
                                            }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>{plan.planCode}</span>
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: plan.status === 'APPROVED' ? '#10b98120' : '#8b5cf620', color: plan.status === 'APPROVED' ? '#10b981' : '#8b5cf6' }}>
                                                    {STATUS_LABELS[plan.status] || plan.status}
                                                </span>
                                            </div>
                                            {plan.dailyTargets && (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                                                    {plan.dailyTargets.length} ngay ke hoach
                                                </div>
                                            )}
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                Muc tieu ngay: <strong style={{ color: 'var(--text-primary)' }}>{(plan.dailyTargetKg || 0).toLocaleString()} kg</strong>
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                Ngay lam viec: <strong style={{ color: 'var(--text-primary)' }}>{plan.totalWorkingDays}</strong>
                                            </div>
                                            {plan.riskFactors && (
                                                <div style={{ marginTop: 8, fontSize: 12, color: '#f59e0b', padding: '6px 10px', background: 'rgba(245,158,11,0.1)', borderRadius: 8 }}>
                                                    ⚠️ {plan.riskFactors}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Selected Plan Details */}
                            {selectedPlan && (
                                <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h3 style={{ fontSize: 15, fontWeight: 700 }}>Chi tiet ke hoach: {selectedPlan.planCode}</h3>
                                        {selectedPlan.status === 'DRAFT' && (
                                            <button onClick={handleApprovePlan} disabled={approving} style={{
                                                padding: '8px 20px', borderRadius: 10, border: 'none',
                                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                                color: '#fff', fontSize: 13, fontWeight: 700, cursor: approving ? 'not-allowed' : 'pointer'
                                            }}>
                                                {approving ? 'Dang duyet...' : 'Duyet ke hoach'}
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                                        {[
                                            ['Ngay lam viec', selectedPlan.totalWorkingDays + ' ngay'],
                                            ['Muc tieu/ngay', `${(selectedPlan.dailyTargetKg || 0).toLocaleString()} kg`],
                                            ['Tong rang', `${(selectedPlan.totalRoastKg || 0).toLocaleString()} kg`],
                                            ['Tong QC', `${(selectedPlan.totalQcKg || 0).toLocaleString()} kg`],
                                            ['Tong dong goi', `${(selectedPlan.totalPackagedKg || 0).toLocaleString()} kg`],
                                            ['Tong goi', selectedPlan.totalPackages + ' goi'],
                                            ['Nguyen lieu can', `${(selectedPlan.totalInputKg || 0).toLocaleString()} kg`],
                                            ['Rui ro', selectedPlan.riskFactors || 'Khong co'],
                                        ].map(([label, value]) => (
                                            <div key={label as string} style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '12px 14px' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {selectedPlan.aiRecommendations && (
                                        <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: 14 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>AI De xuat</div>
                                            <pre style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                                                {selectedPlan.aiRecommendations}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab: Daily Target */}
                    {activeTab === 'daily' && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Muc tieu theo ngay</h2>
                            {dailyTargets.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                    Tao ke hoach AI truoc de xem muc tieu ngay
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {dailyTargets.map(target => {
                                        const isToday = target.targetDate === new Date().toISOString().split('T')[0];
                                        const stage = (selectedOrder?.productType as string) || 'RANG';
                                        const unit = unitForStage(stage);
                                        const edit = target.id ? targetEdits[target.id] : undefined;
                                        const targetQty = edit?.target ?? (target.targetQuantity || target.targetRoastKg || 0);
                                        const actualQty = edit?.actual ?? (target.actualQuantity || target.actualRoastKg || 0);
                                        const cappedActual = Math.min(actualQty, targetQty);
                                        const livePct = targetQty > 0 ? Math.min(100, Math.round((cappedActual / targetQty) * 100)) : 0;

                                        const updateField = (field: 'actual' | 'target', value: number) => {
                                            if (!target.id) return;
                                            const current = edit || { actual: actualQty, target: targetQty };
                                            const next = { ...current, [field]: value };
                                            if (field === 'actual' && value > current.target) next.actual = current.target;
                                            if (field === 'target' && current.actual > value) next.actual = value;
                                            setTargetEdits(prev => ({ ...prev, [target.id!]: next }));
                                        };

                                        return (
                                            <div key={target.id} style={{
                                                padding: 16, background: isToday ? 'rgba(139,92,246,0.05)' : 'var(--bg-card)',
                                                border: `1px solid ${isToday ? 'rgba(139,92,246,0.3)' : 'var(--border)'}`,
                                                borderRadius: 14, borderLeft: isToday ? '4px solid #8b5cf6' : '4px solid var(--border)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                                    <div>
                                                        <span style={{ fontSize: 14, fontWeight: 700 }}>
                                                            {new Date(target.targetDate!).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                                        </span>
                                                        {isToday && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: 4 }}>Hom nay</span>}
                                                        {target.isHoliday && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, background: 'var(--bg-input)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 4 }}>Ngay nghi</span>}
                                                    </div>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: PROGRESS_COLOR }}>{livePct}%</span>
                                                </div>

                                                <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
                                                        <span style={{ color: 'var(--text-secondary)' }}>So luong hien tai:</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={targetQty}
                                                            value={actualQty}
                                                            onChange={e => updateField('actual', Math.max(0, Number(e.target.value) || 0))}
                                                            disabled={target.isHoliday}
                                                            style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 13, textAlign: 'right' }}
                                                        />
                                                        <span style={{ color: 'var(--text-secondary)' }}>/</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={targetQty}
                                                            onChange={e => updateField('target', Math.max(0, Number(e.target.value) || 0))}
                                                            disabled={target.isHoliday}
                                                            style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 13, textAlign: 'right' }}
                                                        />
                                                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</span>
                                                    </div>

                                                    <div style={{ position: 'relative', height: 18, marginTop: 10 }}>
                                                        <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 4, background: 'var(--border)', borderRadius: 2 }} />
                                                        <div style={{ position: 'absolute', left: 0, top: 7, height: 4, width: `${livePct}%`, background: PROGRESS_COLOR, borderRadius: 2, transition: 'width 0.15s ease' }} />
                                                        <input
                                                            type="range"
                                                            min={0}
                                                            max={Math.max(targetQty, 1)}
                                                            value={cappedActual}
                                                            onChange={e => updateField('actual', Math.max(0, Number(e.target.value) || 0))}
                                                            disabled={target.isHoliday}
                                                            style={{ position: 'absolute', left: 0, right: 0, top: 0, width: '100%', height: 18, margin: 0, accentColor: PROGRESS_COLOR, cursor: target.isHoliday ? 'not-allowed' : 'pointer', background: 'transparent' }}
                                                        />
                                                    </div>

                                                    {edit && !target.isHoliday && (
                                                        <div style={{ marginTop: 10, textAlign: 'right' }}>
                                                            <button onClick={() => handleSaveTarget(target)} disabled={savingTargetId === target.id} style={{
                                                                padding: '6px 14px', borderRadius: 8, border: 'none',
                                                                background: PROGRESS_COLOR, color: '#fff', fontSize: 12, fontWeight: 700,
                                                                cursor: savingTargetId === target.id ? 'not-allowed' : 'pointer',
                                                                opacity: savingTargetId === target.id ? 0.6 : 1
                                                            }}>
                                                                {savingTargetId === target.id ? 'Dang luu...' : 'Luu tien do'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {target.notes && (
                                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Ghi chu: {target.notes}</div>
                                                )}
                                                {target.issues && (
                                                    <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                                                        Van de: {target.issues}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab: Attendance */}
                    {activeTab === 'attendance' && (
                        <div>
                            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Cham cong</h2>
                            {!myAttendance ? (
                                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 28 }}>
                                    <div style={{ marginBottom: 20 }}>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Chon ca lam viec</label>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {(Object.entries(SHIFT_LABELS) as [ShiftType, string][]).map(([key, label]) => (
                                                <button key={key} onClick={() => setShiftType(key)}
                                                    style={{
                                                        padding: '8px 16px', borderRadius: 10, border: `2px solid ${shiftType === key ? '#10b981' : 'var(--border)'}`,
                                                        background: shiftType === key ? 'rgba(16,185,129,0.1)' : 'var(--bg-input)',
                                                        color: shiftType === key ? '#10b981' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                                                    }}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 20 }}>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Cong doan lam viec</label>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            {(Object.entries(STAGE_LABELS) as [ProductionStage, string][]).map(([key, label]) => (
                                                <button key={key} onClick={() => setStage(key)}
                                                    style={{
                                                        padding: '8px 16px', borderRadius: 10, border: `2px solid ${stage === key ? '#3b82f6' : 'var(--border)'}`,
                                                        background: stage === key ? 'rgba(59,130,246,0.1)' : 'var(--bg-input)',
                                                        color: stage === key ? '#3b82f6' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                                                    }}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: 12 }}>
                                        Thời gian nghỉ được xưởng cấu hình và hệ thống tự trừ khi tính công.
                                    </div>

                                    <button onClick={handleCheckIn} disabled={loadingAttendance}
                                        style={{
                                            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                                            background: 'linear-gradient(135deg, #10b981, #059669)',
                                            color: '#fff', fontSize: 16, fontWeight: 800, cursor: loadingAttendance ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                        }}>
                                        {loadingAttendance ? 'Dang xu ly...' : 'Check-in'}
                                    </button>
                                </div>
                            ) : (
                                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Trang thai hom nay</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {[
                                            ['Ca lam', SHIFT_LABELS[myAttendance.shiftType] || myAttendance.shiftType],
                                            ['Cong doan', STAGE_LABELS[myAttendance.productionStage] || myAttendance.productionStage],
                                            ['Check-in', myAttendance.checkInTime ? new Date(myAttendance.checkInTime).toLocaleTimeString('vi-VN') : '-'],
                                            ['Don hang', myAttendance.orderTitle || 'Khong lien ket'],
                                            ['Gio nghi', `${myAttendance.breakMinutes} phut`],
                                        ].map(([label, value]) => (
                                            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
                                                <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {!myAttendance.checkOutTime ? (
                                        <button onClick={handleCheckOut} disabled={loadingAttendance}
                                            style={{
                                                width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none',
                                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                                color: '#fff', fontSize: 16, fontWeight: 800, cursor: loadingAttendance ? 'not-allowed' : 'pointer'
                                            }}>
                                            {loadingAttendance ? 'Dang xu ly...' : 'Check-out'}
                                        </button>
                                    ) : (
                                        <div style={{ marginTop: 16, background: 'rgba(16,185,129,0.08)', borderRadius: 12, padding: 16 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 12 }}>Ca lam viec da hoan thanh</div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                {[
                                                    ['Gio thuong', `${myAttendance.regularHours}h`],
                                                    ['Gio tang ca', `${myAttendance.overtimeHours}h`],
                                                    ['Tong gio', `${myAttendance.actualWorkHours}h`],
                                                    ['Check-out', new Date(myAttendance.checkOutTime).toLocaleTimeString('vi-VN')],
                                                ].map(([label, value]) => (
                                                    <div key={label as string} style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: '8px 12px' }}>
                                                        <div style={{ fontSize: 11, color: '#059669', marginBottom: 2 }}>{label}</div>
                                                        <div style={{ fontSize: 15, fontWeight: 800, color: '#10b981' }}>{value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

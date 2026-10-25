import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { productionService } from '../services/groupService';
import type { ProductionOrder } from '../types/types';



const PRODUCT_TYPES = [
    'Arabica',
    'Robusta',
    'Liberica',
    'Excelsa',
    'Blend',
    'Arabica Specialty',
    'Fine Robusta',
    'Culi / Peaberry',
    'Moka',
    'Catimor',
    'Bourbon',
    'Typica',
    'Caturra',
    'Gesha / Geisha',
    'Ethiopia Heirloom',
    'Colombia Supremo',
    'Brazil Santos',
    'Vietnam Robusta',
    'Ca phe nhan xanh',
    'Ca phe rang nguyen hat',
    'Ca phe rang xay',
    'Ca phe hoa tan',
    'Khac',
];
const PROCESS_TYPES = [
    'Rang nguyen hat',
    'Rang xay',
    'Rang sample / profile test',
    'Gia cong OEM',
    'Dong goi',
    'Xay ca phe',
    'Private Label',
    'QC / Cupping',
    'Phoi tron blend',
    'Khac',
];
const ROAST_LEVELS = ['Light', 'Medium Light', 'Medium', 'Medium-Dark', 'Dark', 'Espresso Roast', 'Theo profile rieng'];
const PACKAGE_SIZES = ['100g', '250g', '500g', '1kg', '2kg', '5kg', '10kg', '20kg', '25kg', '50kg', 'Drip bag', 'Capsule / Pod', 'Bulk', 'Custom'];
const STATUS_OPTIONS = [
    { value: 'PENDING', label: 'Cho xu ly', color: '#94a3b8' },
    { value: 'CONFIRMED', label: 'Da xac nhan', color: '#3b82f6' },
    { value: 'PLANNING', label: 'Dang ke hoach', color: '#8b5cf6' },
    { value: 'IN_PRODUCTION', label: 'Dang san xuat', color: '#f59e0b' },
    { value: 'COMPLETED', label: 'Hoan thanh', color: '#10b981' },
    { value: 'DELIVERED', label: 'Da giao', color: '#059669' },
    { value: 'CANCELLED', label: 'Da huy', color: '#ef4444' },
];

const createDefaultForm = () => ({
    title: '',
    description: '',
    customerName: '',
    productType: 'Robusta',
    processType: 'Rang nguyen hat',
    roastLevel: 'Medium',
    packageSize: '1kg',
    totalPackages: 0,
    outputTarget: 0,
    expectedYield: 0.85,
    expectedLoss: 0,
    unit: 'kg',
    orderDate: new Date().toISOString().split('T')[0],
    confirmDate: '',
    productionStartDate: new Date().toISOString().split('T')[0],
    customerDeliveryDate: '',
    safetyBufferDays: 2,
    recipientName: '',
    recipientPhone: '',
    shippingNote: '',
});

const toDateInput = (value?: string) => value ? value.substring(0, 10) : '';

export default function ProductionOrderPage() {
    const { id } = useParams<{ id: string }>();
    const teamId = id || '';
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
    const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
    const customerDeliveryDateRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState(createDefaultForm);

    useEffect(() => {
        loadOrders();
        if (searchParams.get('mode') === 'create') {
            startCreate();
        }
    }, [teamId]);

    const loadOrders = async () => {
        try {
            const data = await productionService.getOrders(teamId);
            setOrders(data || []);
        } catch (e) {
            // tolerate order load failure
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field: string, value: any) => {
        if (fieldErrors[field]) {
            setFieldErrors(prev => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
        if (error) setError('');
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const startCreate = () => {
        setEditingOrderId(null);
        setForm(createDefaultForm());
        setError('');
        setFieldErrors({});
        setActiveTab('create');
    };

    const startEdit = (order: ProductionOrder) => {
        setEditingOrderId(order.id);
        setForm({
            title: order.title || '',
            description: order.description || '',
            customerName: order.customerName || '',
            productType: order.productType || 'Robusta',
            processType: order.processType || 'Rang nguyen hat',
            roastLevel: order.roastLevel || 'Medium',
            packageSize: order.packageSize || '1kg',
            totalPackages: order.totalPackages || 0,
            outputTarget: order.outputTarget || 0,
            expectedYield: order.expectedYield || 0.85,
            expectedLoss: order.expectedLoss || 0,
            unit: order.unit || 'kg',
            orderDate: toDateInput(order.orderDate) || new Date().toISOString().split('T')[0],
            confirmDate: toDateInput(order.confirmDate),
            productionStartDate: toDateInput(order.productionStartDate) || new Date().toISOString().split('T')[0],
            customerDeliveryDate: toDateInput(order.customerDeliveryDate),
            safetyBufferDays: order.safetyBufferDays ?? 2,
            recipientName: order.recipientName || '',
            recipientPhone: order.recipientPhone || '',
            shippingNote: order.shippingNote || '',
        });
        setError('');
        setFieldErrors({});
        setActiveTab('create');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelForm = () => {
        setEditingOrderId(null);
        setForm(createDefaultForm());
        setError('');
        setFieldErrors({});
        setActiveTab('list');
    };

    const focusField = (field: string) => {
        const refs: Record<string, React.RefObject<HTMLInputElement | null>> = {
            customerDeliveryDate: customerDeliveryDateRef,
        };
        window.setTimeout(() => {
            refs[field]?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            refs[field]?.current?.focus({ preventScroll: true });
        }, 0);
    };

    const setFieldErrorAndFocus = (field: string, message: string) => {
        setFieldErrors({ [field]: message });
        setError('');
        focusField(field);
    };

    const isSameOrBefore = (value: string, compareTo: string) => {
        return new Date(`${value}T00:00:00`).getTime() <= new Date(`${compareTo}T00:00:00`).getTime();
    };

    const calculateInput = () => {
        const target = parseFloat(form.outputTarget as any) || 0;
        const yield_ = parseFloat(form.expectedYield as any) || 1;
        if (target > 0 && yield_ > 0) {
            return Math.ceil((target / yield_) * 100) / 100;
        }
        return 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setFieldErrors({});
        setSaving(true);
        try {
            const payload: any = { ...form };
            if (!payload.productionStartDate) payload.productionStartDate = undefined;
            if (!payload.confirmDate) payload.confirmDate = undefined;
            if (!payload.customerDeliveryDate) {
                setFieldErrorAndFocus('customerDeliveryDate', 'Vui lòng chọn ngày giao hàng cho khách.');
                setSaving(false);
                return;
            }
            if (payload.productionStartDate && isSameOrBefore(payload.customerDeliveryDate, payload.productionStartDate)) {
                setFieldErrorAndFocus('customerDeliveryDate', 'Ngày giao hàng phải sau ngày bắt đầu sản xuất.');
                setSaving(false);
                return;
            }
            if (editingOrderId) {
                await productionService.updateOrder(editingOrderId, payload);
            } else {
                await productionService.createOrder(teamId, payload);
            }
            setEditingOrderId(null);
            setForm(createDefaultForm());
            setActiveTab('list');
            loadOrders();
        } catch (e: any) {
            const message = e.response?.data?.error || e.message || 'Loi luu don hang';
            if (message.toLowerCase().includes('ngay giao') || message.toLowerCase().includes('delivery')) {
                setFieldErrorAndFocus('customerDeliveryDate', message);
            } else {
                setError(message);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (order: ProductionOrder) => {
        if (!confirm(`Xoa don san xuat "${order.title}"? Hanh dong nay se xoa ke hoach san xuat lien quan neu co.`)) return;
        setSaving(true);
        try {
            await productionService.deleteOrder(order.id);
            if (editingOrderId === order.id) {
                cancelForm();
            }
            await loadOrders();
        } catch (e: any) {
            setError(e.response?.data?.error || e.message || 'Loi xoa don hang');
        } finally {
            setSaving(false);
        }
    };

    const getStatusColor = (status: string) =>
        STATUS_OPTIONS.find(s => s.value === status)?.color || '#94a3b8';

    const getStatusLabel = (status: string) =>
        STATUS_OPTIONS.find(s => s.value === status)?.label || status;

    const inputRequired = calculateInput();

    return (
        <div style={{ padding: 24, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate(`/groups/${teamId}`)} style={{
                        background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                        width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', fontSize: 18, flexShrink: 0
                    }} title="Quay lại nhóm">
                        <ion-icon name="chevron-back-outline" />
                    </button>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Don hang San xuat</h1>
                </div>
                <button
                    onClick={startCreate}
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                    + Tao don hang moi
                </button>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
                    {error}
                </div>
            )}

            {/* Tab */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-input)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                {[['list', 'Danh sach'], ['create', 'Tao don hang']].map(([tab, label]) => (
                    <button key={tab} onClick={() => tab === 'create' ? startCreate() : cancelForm()} style={{
                        padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        background: activeTab === tab ? '#fff' : 'transparent',
                        color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                        boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}>{tab === 'create' && editingOrderId ? 'Sua don hang' : label}</button>
                ))}
            </div>

            {/* List */}
            {activeTab === 'list' && (
                loading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Dang tai...</div>
                ) : orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Chua co don hang nao</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Tao don hang dau tien de bat dau san xuat</div>
                        <button onClick={startCreate} style={{
                            background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none',
                            borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                        }}>Tao don hang</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {orders.map(order => (
                            <div key={order.id} style={{
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 14, padding: 20, borderLeft: `5px solid ${getStatusColor(order.status)}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{order.orderCode}</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${getStatusColor(order.status)}20`, color: getStatusColor(order.status) }}>
                                                {getStatusLabel(order.status)}
                                            </span>
                                            {order.productType && (
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-input)', borderRadius: 4 }}>
                                                    {order.productType}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>{order.title}</div>
                                        {order.customerName && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Khach hang: {order.customerName}</div>}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {(order.outputTarget || 0).toLocaleString('vi-VN')} kg
                                        </div>
                                        {order.completedQuantity != null && (
                                            <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                                                Da xong: {(order.completedQuantity).toLocaleString('vi-VN')} kg ({order.progressPercent?.toFixed(0)}%)
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                            <button
                                                onClick={() => startEdit(order)}
                                                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                            >
                                                <ion-icon name="create-outline" /> Sua
                                            </button>
                                            <button
                                                onClick={() => handleDelete(order)}
                                                disabled={saving}
                                                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.10)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                                            >
                                                <ion-icon name="trash-outline" /> Xoa
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                                    {[
                                        ['Ngay dat', order.orderDate],
                                        ['Bat dau', order.productionStartDate],
                                        ['Han noi bo', order.internalDeadline],
                                        ['Giao hang', order.customerDeliveryDate],
                                    ].map(([label, val]) => val && (
                                        <div key={label as string}>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {new Date(val).toLocaleDateString('vi-VN')}
                                            </div>
                                        </div>
                                    ))}
                                    {order.inputRequired && (
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Nguyen lieu can</div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{order.inputRequired.toLocaleString('vi-VN')} kg</div>
                                        </div>
                                    )}
                                    {order.expectedYield && (
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Ty le thu hoi</div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{((order.expectedYield as number) * 100).toFixed(0)}%</div>
                                        </div>
                                    )}
                                </div>

                                {(order.recipientName || order.recipientPhone) && (
                                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Nguoi nhan hang</div>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{order.recipientName}</div>
                                            <div style={{ color: 'var(--primary)', fontSize: 13 }}>{order.recipientPhone}</div>
                                            {order.shippingNote && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{order.shippingNote}</div>}
                                        </div>
                                        {order.recipientPhone && (
                                            <a href={`tel:${order.recipientPhone}`}
                                                style={{ padding: '6px 14px', background: '#10b981', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                                Gọi ngay
                                            </a>
                                        )}
                                    </div>
                                )}

                                {order.progressPercent !== undefined && order.progressPercent > 0 && (
                                    <div style={{ marginTop: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Tien do san xuat</span>
                                            <span style={{ fontWeight: 700, color: getStatusColor(order.status) }}>{order.progressPercent.toFixed(0)}%</span>
                                        </div>
                                        <div style={{ background: 'var(--bg-input)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                                            <div style={{ width: `${order.progressPercent}%`, height: '100%', background: getStatusColor(order.status), borderRadius: 6, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Create Form */}
            {activeTab === 'create' && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>
                        {editingOrderId ? 'Sua don hang san xuat' : 'Tao don hang san xuat moi'}
                    </h2>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            {/* Thong tin co ban */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Thong tin don hang</h3>
                            </div>

                            
                            <Field label="Tieu de don hang" required>
                                <input value={form.title} onChange={e => handleChange('title', e.target.value)} required
                                    placeholder="VD: Don hang Caphe Highlands 06/2026"
                                    style={inputStyle} />
                            </Field>

                            <Field label="Ten khach hang">
                                <input value={form.customerName} onChange={e => handleChange('customerName', e.target.value)}
                                    placeholder="VD: Highlands Coffee"
                                    style={inputStyle} />
                            </Field>

                            <Field label="Mo ta">
                                <textarea value={form.description} onChange={e => handleChange('description', e.target.value)}
                                    placeholder="Ghi chu them ve don hang..."
                                    rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                            </Field>

                            
                            {/* San pham */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Thong tin san pham</h3>
                            </div>

                            <Field label="Loai san pham">
                                <select value={form.productType} onChange={e => handleChange('productType', e.target.value)} style={inputStyle}>
                                    {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>

                            <Field label="Quy trinh">
                                <select value={form.processType} onChange={e => handleChange('processType', e.target.value)} style={inputStyle}>
                                    {PROCESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>

                            <Field label="Muc rang">
                                <select value={form.roastLevel} onChange={e => handleChange('roastLevel', e.target.value)} style={inputStyle}>
                                    {ROAST_LEVELS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>

                            <Field label="Quy cach dong goi">
                                <select value={form.packageSize} onChange={e => handleChange('packageSize', e.target.value)} style={inputStyle}>
                                    {PACKAGE_SIZES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>

                            {/* So luong */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>So luong &amp; San luong</h3>
                            </div>

                            <Field label="San luong can lam (kg)" required>
                                <input type="number" value={form.outputTarget} onChange={e => handleChange('outputTarget', parseFloat(e.target.value) || 0)} required
                                    placeholder="VD: 10000" min="0" step="0.01" style={inputStyle} />
                            </Field>

                            <Field label="Ty le thu hoi (%)">
                                <input type="number" value={(form.expectedYield as any) * 100}
                                    onChange={e => handleChange('expectedYield', (parseFloat(e.target.value) || 0) / 100)}
                                    min="0" max="100" step="0.1" style={inputStyle} />
                            </Field>

                            {inputRequired > 0 && (
                                <div style={{ gridColumn: '1 / -1', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>Nguyen lieu can mua:</span>
                                    <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{inputRequired.toLocaleString('vi-VN')} kg</span>
                                </div>
                            )}

                            <Field label="Tong so goi">
                                <input type="number" value={form.totalPackages} onChange={e => handleChange('totalPackages', parseInt(e.target.value) || 0)}
                                    placeholder="VD: 10000" min="0" style={inputStyle} />
                            </Field>

                            <Field label="Don vi">
                                <select value={form.unit} onChange={e => handleChange('unit', e.target.value)} style={inputStyle}>
                                    <option value="kg">kg</option>
                                    <option value="tui">Tui</option>
                                    <option value="bao">Bao</option>
                                </select>
                            </Field>

                            {/* Ngay thang */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Lich trinh</h3>
                            </div>

                            <Field label="Ngay nhan don">
                                <input type="date" value={form.orderDate} onChange={e => handleChange('orderDate', e.target.value)} style={inputStyle} />
                            </Field>

                            <Field label="Ngay xac nhan">
                                <input type="date" value={form.confirmDate} onChange={e => handleChange('confirmDate', e.target.value)} style={inputStyle} />
                            </Field>

                            <Field label="Ngay bat dau san xuat">
                                <input type="date" value={form.productionStartDate} onChange={e => handleChange('productionStartDate', e.target.value)} style={inputStyle} />
                            </Field>

                            <Field label="Ngay giao cho khach" required error={fieldErrors.customerDeliveryDate}>
                                <input
                                    ref={customerDeliveryDateRef}
                                    type="date"
                                    value={form.customerDeliveryDate}
                                    onChange={e => handleChange('customerDeliveryDate', e.target.value)}
                                    style={{
                                        ...inputStyle,
                                        borderColor: fieldErrors.customerDeliveryDate ? '#ef4444' : 'var(--border)',
                                        boxShadow: fieldErrors.customerDeliveryDate ? '0 0 0 3px rgba(239, 68, 68, 0.16)' : 'none',
                                    }}
                                />
                            </Field>

                            <Field label="So ngay du phong">
                                <input type="number" value={form.safetyBufferDays} onChange={e => handleChange('safetyBufferDays', parseInt(e.target.value) || 2)}
                                    min="0" max="10" style={inputStyle} />
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                    Han noi bo se tu dong = Ngay giao - Du phong
                                </div>
                            </Field>

                            {/* Giao hang */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Thong tin giao hang</h3>
                            </div>

                            <Field label="Nguoi nhan hang">
                                <input value={form.recipientName} onChange={e => handleChange('recipientName', e.target.value)}
                                    placeholder="Ten nguoi nhan" style={inputStyle} />
                            </Field>

                            <Field label="SDT nguoi nhan">
                                <input value={form.recipientPhone} onChange={e => handleChange('recipientPhone', e.target.value)}
                                    placeholder="0912 345 678" style={inputStyle} />
                            </Field>

                            <div style={{ gridColumn: '1 / -1' }}>
                                <Field label="Ghi chu giao hang">
                                    <textarea value={form.shippingNote} onChange={e => handleChange('shippingNote', e.target.value)}
                                        placeholder="VD: Giao vao buoi sang, lien he truoc khi giao..."
                                        rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                                </Field>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
                            <button type="button" onClick={cancelForm}
                                style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                Huy
                            </button>
                            <button type="submit" disabled={saving}
                                style={{ padding: '10px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                                {saving ? 'Dang luu...' : editingOrderId ? 'Luu thay doi' : 'Tao don hang'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 4 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
            </label>
            {children}
            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 12, fontWeight: 650, marginTop: 6 }}>
                    <ion-icon name="alert-circle-outline" style={{ fontSize: 15 }} />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14,
    outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
};

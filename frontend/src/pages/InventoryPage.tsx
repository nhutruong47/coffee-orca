import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { inventoryService } from '../services/groupService';
import { teamService } from '../services/groupService';
import { useToast } from '../context/ToastContext';
import type { InventoryItem, Team } from '../types/types';

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
    'Vietnam Robusta',
];

const PRODUCT_STATES = [
    { value: 'GREEN', label: 'Hạt xanh' },
    { value: 'ROASTED', label: 'Đã rang' },
    { value: 'GROUND', label: 'Xay' },
    { value: 'PACKAGED', label: 'Đóng gói' },
];

const UNITS = ['kg', 'g', 'tấn', 'bao', 'gói', 'túi'];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    'IN_STOCK': { label: 'Còn hàng', color: '#10b981' },
    'LOW_STOCK': { label: 'Sắp hết', color: '#f59e0b' },
    'OUT_OF_STOCK': { label: 'Hết hàng', color: '#ef4444' },
};

export default function InventoryPage() {
    const { id } = useParams<{ id: string }>();
    const teamId = id || '';
    const navigate = useNavigate();
    const toast = useToast();

    const [items, setItems] = useState<InventoryItem[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>(teamId);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal states
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [form, setForm] = useState({
        productType: '',
        productState: 'GREEN',
        displayName: '',
        quantity: 0,
        unit: 'kg',
        lowStockThreshold: 100,
        price: '',
        description: '',
        origin: '',
        roastLevel: '',
        processing: '',
        tasteNotes: '',
    });

    const loadTeams = async () => {
        try {
            const data = await teamService.getMyTeams();
            setTeams(data);
            if (data.length > 0 && !selectedTeamId) {
                setSelectedTeamId(data[0].id);
            }
        } catch (err) {
            console.error('Failed to load teams:', err);
        }
    };

    const loadInventory = async () => {
        if (!selectedTeamId) {
            setItems([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const data = await inventoryService.getByTeam(selectedTeamId);
            setItems(data || []);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || 'Không thể tải danh sách kho.');
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTeams();
    }, []);

    useEffect(() => {
        if (selectedTeamId) {
            loadInventory();
        }
    }, [selectedTeamId]);

    // Group items by product type
    const groupedItems = useMemo(() => {
        const groups: Record<string, InventoryItem[]> = {};
        items.forEach(item => {
            const key = item.productType || item.name || 'Khác';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return groups;
    }, [items]);

    // Stats
    const stats = useMemo(() => {
        const totalItems = items.length;
        const lowStock = items.filter(i => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK').length;
        const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
        return { totalItems, lowStock, totalQuantity };
    }, [items]);

    const resetForm = () => {
        setForm({
            productType: '',
            productState: 'GREEN',
            displayName: '',
            quantity: 0,
            unit: 'kg',
            lowStockThreshold: 100,
            price: '',
            description: '',
            origin: '',
            roastLevel: '',
            processing: '',
            tasteNotes: '',
        });
    };

    const openAddModal = () => {
        resetForm();
        setEditingItem(null);
        setShowAddModal(true);
    };

    const openEditModal = (item: InventoryItem) => {
        setForm({
            productType: item.productType || item.name || '',
            productState: (item as any).productState || 'GREEN',
            displayName: item.displayName || item.name || '',
            quantity: item.quantity || 0,
            unit: item.unit || 'kg',
            lowStockThreshold: item.lowStockThreshold || 100,
            price: item.price || '',
            description: item.description || '',
            origin: item.origin || '',
            roastLevel: item.roastLevel || '',
            processing: item.processing || '',
            tasteNotes: item.tasteNotes || '',
        });
        setEditingItem(item);
        setShowAddModal(true);
    };

    const closeAddModal = () => {
        setShowAddModal(false);
        setEditingItem(null);
        resetForm();
    };

    const handleAddOrUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTeamId) {
            alert('Vui lòng chọn xưởng trước.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const payload: any = {
                teamId: selectedTeamId,
                productType: form.productType || form.displayName,
                productState: form.productState,
                displayName: form.displayName || form.productType,
                quantity: form.quantity,
                unit: form.unit,
                lowStockThreshold: form.lowStockThreshold,
            };

            if (form.price) payload.price = form.price;
            if (form.description) payload.description = form.description;
            if (form.origin) payload.origin = form.origin;
            if (form.roastLevel) payload.roastLevel = form.roastLevel;
            if (form.processing) payload.processing = form.processing;
            if (form.tasteNotes) payload.tasteNotes = form.tasteNotes;

            if (editingItem) {
                await inventoryService.update(editingItem.id, payload);
                toast.success('Cập nhật thành công!');
            } else {
                await inventoryService.create(payload);
                toast.success('Thêm mới thành công!');
            }

            closeAddModal();
            loadInventory();
        } catch (err: any) {
            toast.error('Có lỗi xảy ra', err?.response?.data?.error || err?.message || 'Vui lòng thử lại sau.');
        } finally {
            setSaving(false);
        }
    };

    const handleImportStock = async (item: InventoryItem, additionalQty: number) => {
        try {
            const newQty = (item.quantity || 0) + additionalQty;
            await inventoryService.updateQuantity(item.id, newQty);
            toast.success('Nhập kho thành công!');
            loadInventory();
        } catch (err: any) {
            toast.error('Có lỗi xảy ra', err?.response?.data?.error || err?.message || 'Vui lòng thử lại sau.');
        }
    };

    const handleDelete = async (item: InventoryItem) => {
        if (!confirm(`Xóa "${item.displayName || item.name}" khỏi kho?`)) return;
        try {
            await inventoryService.delete(item.id);
            toast.success('Đã xóa thành công!');
            loadInventory();
        } catch (err: any) {
            toast.error('Có lỗi xảy ra', err?.response?.data?.error || err?.message || 'Vui lòng thử lại sau.');
        }
    };

    const openImportModal = () => {
        setShowImportModal(true);
    };

    const closeImportModal = () => {
        setShowImportModal(false);
    };

    return (
        <div style={{ padding: 24, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate(`/groups/${teamId}`)} style={{
                        background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10,
                        width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', fontSize: 18,
                    }}>
                        <ion-icon name="chevron-back-outline" />
                    </button>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Kho nguyên liệu</h1>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {teams.length > 1 && (
                        <select
                            value={selectedTeamId}
                            onChange={(e) => setSelectedTeamId(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-input)',
                                color: 'var(--text-primary)',
                                fontSize: 14,
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">Chọn xưởng...</option>
                            {teams.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    )}
                    <button onClick={openImportModal} style={{
                        background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                        borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <ion-icon name="cloud-upload-outline" />
                        Nhập kho
                    </button>
                    <button onClick={openAddModal} style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none',
                        borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}>
                        + Thêm nguyên liệu
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#ef4444', fontSize: 13
                }}>
                    {error}
                </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Tổng mặt hàng</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{stats.totalItems}</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Sắp hết / Hết</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: stats.lowStock > 0 ? '#ef4444' : '#10b981' }}>{stats.lowStock}</div>
                </div>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Tổng số lượng</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {stats.totalQuantity.toLocaleString('vi-VN')}
                    </div>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    <div className="btn-spinner" style={{ margin: '0 auto 16px' }} />
                    Đang tải...
                </div>
            ) : items.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '72px 20px', background: 'var(--bg-card)',
                    borderRadius: 16, border: '2px dashed var(--border)'
                }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>
                        <ion-icon name="cube-outline" style={{ fontSize: 64, color: 'var(--text-muted)' }} />
                    </div>
                    <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Chưa có nguyên liệu trong kho</h3>
                    <p style={{ color: 'var(--text-muted)', margin: '0 0 24px' }}>
                        Bắt đầu bằng cách thêm nguyên liệu hoặc nhập kho cho xưởng của bạn.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                        <button onClick={openImportModal} className="btn btn-secondary">
                            <ion-icon name="cloud-upload-outline" style={{ marginRight: 6 }} />
                            Nhập kho
                        </button>
                        <button onClick={openAddModal} className="btn btn-primary">
                            <ion-icon name="add-circle-outline" style={{ marginRight: 6 }} />
                            Thêm nguyên liệu
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {Object.entries(groupedItems).map(([productType, productItems]) => (
                        <div key={productType} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 16, overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '14px 20px', background: 'var(--bg-input)',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {productType}
                                </h3>
                                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                    {productItems.length} trạng thái
                                </span>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-input)' }}>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Trạng thái</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Số lượng</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Đơn vị</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Ngưỡng</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Trạng thái kho</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productItems.map((item, idx) => {
                                        const stateLabel = PRODUCT_STATES.find(s => s.value === (item as any).productState)?.label || (item as any).productState || '';
                                        const statusInfo = STATUS_LABELS[item.status || 'IN_STOCK'] || STATUS_LABELS['IN_STOCK'];
                                        return (
                                            <tr key={item.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                                                <td style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-primary)' }}>
                                                    {stateLabel}
                                                </td>
                                                <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {item.quantity?.toLocaleString('vi-VN') || 0}
                                                </td>
                                                <td style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-secondary)' }}>
                                                    {item.unit || 'kg'}
                                                </td>
                                                <td style={{ padding: '14px 16px', fontSize: 14, color: 'var(--text-muted)' }}>
                                                    {item.lowStockThreshold || 100}
                                                </td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12,
                                                        background: `${statusInfo.color}20`, color: statusInfo.color
                                                    }}>
                                                        {statusInfo.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => openImportModal()}
                                                            style={{
                                                                padding: '6px 10px', fontSize: 12, borderRadius: 6,
                                                                border: '1px solid var(--border)', background: 'transparent',
                                                                color: 'var(--text-primary)', cursor: 'pointer'
                                                            }}
                                                            title="Nhập kho"
                                                        >
                                                            <ion-icon name="add-outline" />
                                                        </button>
                                                        <button
                                                            onClick={() => openEditModal(item)}
                                                            style={{
                                                                padding: '6px 10px', fontSize: 12, borderRadius: 6,
                                                                border: '1px solid var(--border)', background: 'transparent',
                                                                color: 'var(--text-primary)', cursor: 'pointer'
                                                            }}
                                                            title="Sửa"
                                                        >
                                                            <ion-icon name="create-outline" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(item)}
                                                            style={{
                                                                padding: '6px 10px', fontSize: 12, borderRadius: 6,
                                                                border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
                                                                color: '#ef4444', cursor: 'pointer'
                                                            }}
                                                            title="Xóa"
                                                        >
                                                            <ion-icon name="trash-outline" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <ImportModal
                    items={items}
                    onImport={handleImportStock}
                    onClose={closeImportModal}
                />
            )}

            {/* Add/Edit Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={closeAddModal}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2>{editingItem ? 'Sửa nguyên liệu' : 'Thêm nguyên liệu mới'}</h2>
                            <button onClick={closeAddModal} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <ion-icon name="close-outline" />
                            </button>
                        </div>
                        <form onSubmit={handleAddOrUpdate}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                                        Loại sản phẩm *
                                    </label>
                                    <select
                                        className="form-input"
                                        value={form.productType}
                                        onChange={e => setForm(f => ({ ...f, productType: e.target.value, displayName: e.target.value }))}
                                        required
                                    >
                                        <option value="">Chọn loại...</option>
                                        {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                                        Trạng thái *
                                    </label>
                                    <select
                                        className="form-input"
                                        value={form.productState}
                                        onChange={e => setForm(f => ({ ...f, productState: e.target.value }))}
                                        required
                                    >
                                        {PRODUCT_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                                        Số lượng *
                                    </label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.quantity}
                                        onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                                        min={0}
                                        step={0.1}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                                        Đơn vị *
                                    </label>
                                    <select
                                        className="form-input"
                                        value={form.unit}
                                        onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                                        required
                                    >
                                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                                    Ngưỡng báo động
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={form.lowStockThreshold}
                                    onChange={e => setForm(f => ({ ...f, lowStockThreshold: parseFloat(e.target.value) || 0 }))}
                                    min={0}
                                />
                            </div>

                            <details style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Thông tin bổ sung
                                </summary>
                                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Giá (VND)</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={form.price}
                                            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                                            placeholder="VD: 150000"
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Xuất xứ</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={form.origin}
                                            onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
                                            placeholder="VD: Đà Lạt"
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Mức rang</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={form.roastLevel}
                                            onChange={e => setForm(f => ({ ...f, roastLevel: e.target.value }))}
                                            placeholder="VD: Medium"
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Cách xử lý</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={form.processing}
                                            onChange={e => setForm(f => ({ ...f, processing: e.target.value }))}
                                            placeholder="VD: Washed"
                                        />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Mô tả</label>
                                        <textarea
                                            className="form-input"
                                            value={form.description}
                                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                            placeholder="Mô tả nguyên liệu..."
                                            rows={2}
                                        />
                                    </div>
                                </div>
                            </details>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={closeAddModal} disabled={saving}>
                                    Hủy
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Thêm mới')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// Import Modal Component
function ImportModal({ items, onImport, onClose }: {
    items: InventoryItem[];
    onImport: (item: InventoryItem, qty: number) => void;
    onClose: () => void;
}) {
    const [selectedItemId, setSelectedItemId] = useState('');
    const [quantity, setQuantity] = useState(0);
    const [importing, setImporting] = useState(false);

    const selectedItem = items.find(i => i.id === selectedItemId);

    const handleImport = async () => {
        if (!selectedItemId || quantity <= 0) {
            alert('Vui lòng chọn nguyên liệu và nhập số lượng.');
            return;
        }
        setImporting(true);
        try {
            await onImport(selectedItem!, quantity);
            onClose();
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%' }}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2>Nhập kho</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <ion-icon name="close-outline" />
                    </button>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                        Chọn nguyên liệu
                    </label>
                    <select
                        className="form-input"
                        value={selectedItemId}
                        onChange={e => setSelectedItemId(e.target.value)}
                    >
                        <option value="">-- Chọn --</option>
                        {items.map(item => (
                            <option key={item.id} value={item.id}>
                                {item.displayName || item.name} ({item.productType}) - Hiện có: {item.quantity} {item.unit}
                            </option>
                        ))}
                    </select>
                </div>

                {selectedItem && (
                    <div style={{
                        background: 'var(--bg-input)', borderRadius: 8, padding: 12, marginBottom: 16,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>Tồn kho hiện tại</div>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                {(selectedItem as any).productState} - {selectedItem.quantity} {selectedItem.unit}
                            </div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>
                            {selectedItem.quantity} {selectedItem.unit}
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
                        Số lượng nhập thêm
                    </label>
                    <input
                        type="number"
                        className="form-input"
                        value={quantity}
                        onChange={e => setQuantity(parseFloat(e.target.value) || 0)}
                        min={0.1}
                        step={0.1}
                        style={{ fontSize: 18, textAlign: 'center' }}
                    />
                </div>

                {selectedItem && quantity > 0 && (
                    <div style={{
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        borderRadius: 8, padding: 12, marginBottom: 16, textAlign: 'center'
                    }}>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Sau khi nhập</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>
                            {(selectedItem.quantity + quantity).toLocaleString('vi-VN')} {selectedItem.unit}
                        </div>
                    </div>
                )}

                <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={importing}>
                        Hủy
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleImport}
                        disabled={importing || !selectedItemId || quantity <= 0}
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                        {importing ? 'Đang nhập...' : 'Nhập kho'}
                    </button>
                </div>
            </div>
        </div>
    );
}

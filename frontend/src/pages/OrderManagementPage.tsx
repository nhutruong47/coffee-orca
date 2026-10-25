// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { teamService } from '../services/groupService';
import { interGroupOrderService } from '../services/interGroupOrderService';
import type { Team, InterGroupOrder } from '../types/types';

const PERSONAL_BUYER = '__personal__';

const DEFAULT_MANUAL_ORDER_FORM = {
    title: '',
    description: '',
    quantity: 1,
    deadline: new Date().toISOString().split('T')[0],
    customerName: '',
    contactPhone: '',
    deliveryAddress: '',
    deliveryNote: '',
};
import { disputeService } from '../services/disputeService';
import DisputeModal from '../components/DisputeModal';
import BuyerConfirmDeliveryModal from '../components/BuyerConfirmDeliveryModal';
import DeliverOrderModal from '../components/DeliverOrderModal';
import ContractModal from '../components/ContractModal';
import { exportToExcel } from '../utils/excelExport';
export default function OrderManagementPage() {
    const { user } = useAuth();
    const [myTeams, setMyTeams] = useState<Team[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<string>(PERSONAL_BUYER);
    const [activeTab, setActiveTab] = useState<'outbound' | 'inbound'>('outbound');

    const [disputeOrderId, setDisputeOrderId] = useState<string | null>(null);
    const [confirmDeliveryOrderId, setConfirmDeliveryOrderId] = useState<string | null>(null);
    const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null);
    const [contractOrderId, setContractOrderId] = useState<string | null>(null);

    const [orders, setOrders] = useState<InterGroupOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [unreadOutboundCount, setUnreadOutboundCount] = useState(0);

    const [quoteOrderId, setQuoteOrderId] = useState<string | null>(null);
    const [quotePrice, setQuotePrice] = useState('');
    const [quoteNote, setQuoteNote] = useState('');

    const [showManualOrderForm, setShowManualOrderForm] = useState(false);
    const [manualCreateLoading, setManualCreateLoading] = useState(false);
    const [manualCreateError, setManualCreateError] = useState('');
    const [manualOrderForm, setManualOrderForm] = useState(DEFAULT_MANUAL_ORDER_FORM);

    const [searchKeyword, setSearchKeyword] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 20;
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

    useEffect(() => {
        const fetchTeams = async () => {
            try {
                const teams = await teamService.getMyTeams();
                // We only care about teams where the user is the owner (can manage orders)
                const ownedTeams = teams.filter(t => t.ownerId === user?.id);
                setMyTeams(ownedTeams);
                if (ownedTeams.length > 0) {
                    setSelectedTeam(ownedTeams[0].id);
                } else {
                    setSelectedTeam('');
                }
            } catch (err) {
                // tolerate teams load failure
            }
        };
        fetchTeams();
    }, [user]);

    useEffect(() => {
        if (activeTab === 'inbound' && (selectedTeam === PERSONAL_BUYER || selectedTeam === '')) {
            setOrders([]);
            setLoading(false);
            return;
        }

        const fetchOrders = async () => {
            setLoading(true);
            try {
                if (activeTab === 'outbound') {
                    const data = (selectedTeam === PERSONAL_BUYER || selectedTeam === '')
                        ? await interGroupOrderService.getMyOutboundOrders()
                        : await interGroupOrderService.getOutboundOrders(selectedTeam);
                    
                    const unreadIds = data.filter(o => o.buyerViewed === false).map(o => o.id);
                    if (unreadIds.length > 0) {
                        interGroupOrderService.markViewed(unreadIds, 'BUYER').catch(() => { /* mark viewed best-effort */ });
                        data.forEach(o => { if (unreadIds.includes(o.id)) o.buyerViewed = true; });
                    }
                    setOrders(data);
                } else {
                    const data = await interGroupOrderService.getInboundOrders(selectedTeam);
                    const unreadIds = data.filter(o => o.sellerViewed === false).map(o => o.id);
                    if (unreadIds.length > 0) {
                        interGroupOrderService.markViewed(unreadIds, 'SELLER').catch(() => { /* mark viewed best-effort */ });
                        data.forEach(o => { if (unreadIds.includes(o.id)) o.sellerViewed = true; });
                    }
                    setOrders(data);
                }
            } catch (err) {
                // tolerate order load failure
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, [selectedTeam, activeTab]);

    useEffect(() => {
        const fetchUnreadCounts = async () => {
            if (!user) return;
            try {
                const outb = (selectedTeam === PERSONAL_BUYER || selectedTeam === '')
                    ? await interGroupOrderService.getMyOutboundOrders()
                    : await interGroupOrderService.getOutboundOrders(selectedTeam);
                setUnreadOutboundCount(outb.filter(o => o.buyerViewed === false).length);
            } catch (err) {}
        };
        fetchUnreadCounts();
    }, [selectedTeam, orders, user]);

    const handleAccept = async (orderId: string) => {
        if (!confirm('Chấp nhận đơn hàng này? Một mục tiêu (Goal) mới sẽ được tạo tự động trong xưởng của bạn.')) return;
        try {
            await interGroupOrderService.acceptOrder(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'ACCEPTED' } : o));
            alert('Đã chấp nhận đơn hàng và tạo Mục tiêu thành công!');
        } catch (err: any) {
            alert('Có lỗi xảy ra khi chấp nhận đơn: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleReject = async (orderId: string) => {
        if (!confirm('Từ chối đơn hàng này?')) return;
        try {
            await interGroupOrderService.rejectOrder(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'REJECTED' } : o));
        } catch (err) {
            alert('Có lỗi xảy ra khi từ chối đơn.');
        }
    };

    const handleQuoteSubmit = async () => {
        if (!quoteOrderId || !quotePrice) return;
        const targetOrder = orders.find(o => o.id === quoteOrderId);
        try {
            if (targetOrder && (targetOrder.status === 'QUOTED' || targetOrder.status === 'REJECTED' || targetOrder.status === 'REQUOTED')) {
                await interGroupOrderService.requoteOrder(quoteOrderId, { price: Number(quotePrice), note: quoteNote });
                setOrders(orders.map(o => o.id === quoteOrderId ? { ...o, status: 'REQUOTED', quotedPrice: Number(quotePrice), quotedNote: quoteNote, quotedAt: new Date().toISOString() } : o));
                alert('Đã gửi báo giá lại thành công!');
            } else {
                await interGroupOrderService.quoteOrder(quoteOrderId, { price: Number(quotePrice), note: quoteNote });
                setOrders(orders.map(o => o.id === quoteOrderId ? { ...o, status: 'QUOTED', quotedPrice: Number(quotePrice), quotedNote: quoteNote, quotedAt: new Date().toISOString() } : o));
                alert('Đã gửi báo giá thành công!');
            }
            setQuoteOrderId(null);
            setQuotePrice('');
            setQuoteNote('');
        } catch (err: any) {
            alert('Lỗi khi gửi báo giá: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleConfirmQuote = async (orderId: string) => {
        if (!confirm('Đồng ý chốt đơn với báo giá này?')) return;
        try {
            await interGroupOrderService.confirmQuote(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'CONFIRMED' } : o));
            alert('Đã chốt đơn thành công!');
        } catch (err: any) {
            alert('Có lỗi xảy ra: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleBuyerAcceptRequote = async (orderId: string) => {
        if (!confirm('Chấp nhận mức giá mới này? Xưởng sẽ cần xác nhận lại để chốt đơn.')) return;
        try {
            await interGroupOrderService.buyerAcceptRequote(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'REQUOTE_ACCEPTED' } : o));
            alert('Đã chấp nhận báo giá lại!');
        } catch (err: any) {
            alert('Có lỗi xảy ra: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleBuyerRejectRequote = async (orderId: string) => {
        if (!confirm('Từ chối mức giá này? Đơn hàng sẽ tự động bị hủy!')) return;
        try {
            await interGroupOrderService.buyerRejectRequote(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'CANCELED' } : o));
            alert('Đã từ chối báo giá và hủy đơn!');
        } catch (err: any) {
            alert('Có lỗi xảy ra: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleSellerConfirmRequote = async (orderId: string) => {
        if (!confirm('Khách đã đồng ý báo giá mới. Xác nhận chốt đơn?')) return;
        try {
            await interGroupOrderService.sellerConfirmRequote(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'CONFIRMED' } : o));
            alert('Đã chốt đơn thành công!');
        } catch (err: any) {
            alert('Có lỗi xảy ra: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleCancel = async (orderId: string) => {
        if (!confirm('Hủy đơn hàng này? Điều này sẽ ảnh hưởng đến độ uy tín của bạn.')) return;
        try {
            await interGroupOrderService.cancelOrder(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'CANCELED' } : o));
        } catch (err) {
            alert('Có lỗi xảy ra khi hủy đơn.');
        }
    };

    const handleShip = async (orderId: string) => {
        if (!confirm('Xác nhận bắt đầu giao đơn hàng này?')) return;
        try {
            await interGroupOrderService.shipOrder(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'SHIPPING' } : o));
        } catch (err) {
            alert('Có lỗi xảy ra.');
        }
    };

    const handleDeliver = (orderId: string) => {
        setDeliverOrderId(orderId);
    };

    const submitDeliverOrder = async (proofImages: { imageUrl: string; latitude: number | null; longitude: number | null; capturedAt: string }[]) => {
        if (!deliverOrderId) return;
        try {
            await interGroupOrderService.deliverOrder(deliverOrderId, {
                deliveryNote: '',
                proofImages,
            });
            setOrders(orders.map(o => o.id === deliverOrderId ? { ...o, status: 'DELIVERED' } : o));
            setDeliverOrderId(null);
        } catch (err) {
            throw err;
        }
    };

    const handleConfirmDelivery = (orderId: string) => {
        setConfirmDeliveryOrderId(orderId);
    };

    const submitConfirmDelivery = async (payload: { deliveryStatus: 'ON_TIME' | 'LATE' | 'NOT_DELIVERED'; rating: number; comment: string; proofImageUrls?: string[] }) => {
        if (!confirmDeliveryOrderId) return;
        try {
            await interGroupOrderService.buyerConfirmDelivery(confirmDeliveryOrderId, payload);
            if (payload.deliveryStatus === 'NOT_DELIVERED') {
                // Should not reach here due to backend throwing error, but just in case
            } else {
                setOrders(orders.map(o => o.id === confirmDeliveryOrderId ? { ...o, status: 'COMPLETED' } : o));
            }
            setConfirmDeliveryOrderId(null);
        } catch (err) {
            throw err;
        }
    };

    const handleDispute = (orderId: string) => {
        setDisputeOrderId(orderId);
    };

    const handleContract = (orderId: string) => {
        setContractOrderId(orderId);
    };

    const submitDispute = async (reason: string, evidenceUrls: string[], amount: number) => {
        if (!disputeOrderId) return;
        try {
            await disputeService.createDispute(disputeOrderId, {
                reason,
                evidenceUrls,
                requestedCompensationAmount: amount
            });
            setOrders(orders.map(o => o.id === disputeOrderId ? { ...o, status: 'DISPUTED' } : o));
            setDisputeOrderId(null);
            alert('Đã gửi khiếu nại thành công!');
        } catch (err) {
            throw err;
        }
    };

    const handleApproveCancel = async (orderId: string) => {
        if (!confirm('Bạn có chắc chắn muốn đồng ý hủy đơn hàng này?')) return;
        try {
            await interGroupOrderService.approveCancelOrder(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'CANCELED', cancelRequested: false, cancelledBy: 'BUYER' } : o));
        } catch (err) {
            alert('Có lỗi xảy ra.');
        }
    };

    const handleRejectCancel = async (orderId: string) => {
        if (!confirm('Từ chối yêu cầu hủy đơn này? Đơn hàng sẽ tiếp tục trạng thái bình thường.')) return;
        try {
            await interGroupOrderService.rejectCancelOrder(orderId);
            setOrders(orders.map(o => o.id === orderId ? { ...o, cancelRequested: false } : o));
        } catch (err) {
            alert('Có lỗi xảy ra.');
        }
    };

    const handleManualOrderChange = (field: keyof typeof DEFAULT_MANUAL_ORDER_FORM, value: string | number) => {
        setManualOrderForm(prev => ({ ...prev, [field]: value }));
    };

    const handleCreateManualInboundOrder = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedTeam || selectedTeam === PERSONAL_BUYER) {
            setManualCreateError('Vui lòng chọn xưởng nhận đơn trước khi tạo.');
            return;
        }
        if (!manualOrderForm.title.trim()) {
            setManualCreateError('Vui lòng nhập tên đơn hàng.');
            return;
        }
        if (!manualOrderForm.customerName.trim()) {
            setManualCreateError('Vui lòng nhập tên khách/xưởng đặt.');
            return;
        }

        setManualCreateLoading(true);
        setManualCreateError('');
        try {
            const descriptionParts = [
                manualOrderForm.description.trim(),
                manualOrderForm.customerName.trim() ? `Khách/xưởng đặt: ${manualOrderForm.customerName.trim()}` : '',
            ].filter(Boolean);

            const created = await interGroupOrderService.placeOrder({
                sellerTeamId: selectedTeam,
                title: manualOrderForm.title.trim(),
                description: descriptionParts.join('\n'),
                quantity: Number(manualOrderForm.quantity) || 1,
                deadline: manualOrderForm.deadline,
                contactPhone: manualOrderForm.contactPhone.trim() || undefined,
                deliveryAddress: manualOrderForm.deliveryAddress.trim() || undefined,
                deliveryNote: manualOrderForm.deliveryNote.trim() || undefined,
            });

            setOrders(prev => [created, ...prev]);
            setActiveTab('inbound');
            setShowManualOrderForm(false);
            setManualOrderForm(DEFAULT_MANUAL_ORDER_FORM);
        } catch (err: any) {
            setManualCreateError(err?.response?.data?.message || err?.response?.data?.error || 'Không thể tạo đơn thủ công.');
        } finally {
            setManualCreateLoading(false);
        }
    };

    const filteredOrders = orders
        .filter(o => (o.title || '').toLowerCase().includes(searchKeyword.toLowerCase()))
        .filter(o => statusFilter ? o.status === statusFilter : true)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        
    const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
    const paginatedOrders = filteredOrders.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedOrderIds(paginatedOrders.map(o => o.id));
        } else {
            setSelectedOrderIds([]);
        }
    };

    const handleSelectOrder = (id: string) => {
        setSelectedOrderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleExportExcel = () => {
        const dataToExport = orders.filter(o => selectedOrderIds.includes(o.id)).map(o => ({
            "Mã Đơn": o.id,
            "Tên Đơn": o.title,
            "Người Đặt": o.buyerTeamName || o.buyerUserName || 'N/A',
            "Người Bán": o.sellerTeamName,
            "Số Lượng": o.quantity,
            "Trạng Thái": o.status,
            "Ngày Tạo": new Date(o.createdAt || 0).toLocaleString('vi-VN'),
            "Hạn Chót": new Date(o.deadline || 0).toLocaleDateString('vi-VN')
        }));
        if (dataToExport.length === 0) return alert('Vui lòng chọn ít nhất 1 đơn hàng để xuất Excel');
        exportToExcel(dataToExport, 'DonHang_Export');
    };

    const getStatusBadge = (order: InterGroupOrder) => {
        const getStyle = (type: 'yellow' | 'green' | 'red' | 'blue' | 'orange') => {
            switch (type) {
                case 'yellow': return { background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid rgba(217, 119, 6, 0.24)' };
                case 'green': return { background: 'var(--success-soft)', color: 'var(--success)', border: '1px solid rgba(5, 150, 105, 0.22)' };
                case 'red': return { background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid rgba(220, 38, 38, 0.22)' };
                case 'blue': return { background: 'var(--info-soft)', color: 'var(--info)', border: '1px solid rgba(37, 99, 235, 0.22)' };
                case 'orange': return { background: 'var(--warning-soft)', color: 'var(--warning)', border: '1px solid rgba(217, 119, 6, 0.24)' };
                default: return {};
            }
        };

        if (order.cancelRequested) return <span className="status-badge order-status-badge" style={getStyle('red')}><ion-icon name="alert-circle-outline"></ion-icon> Yêu cầu hủy</span>;
        
        switch (order.status) {
            case 'RFQ_CREATED': return <span className="status-badge order-status-badge" style={getStyle('yellow')}><ion-icon name="document-text-outline"></ion-icon> Yêu cầu báo giá</span>;
            case 'QUOTED': return <span className="status-badge order-status-badge" style={getStyle('blue')}><ion-icon name="pricetag-outline"></ion-icon> Đã báo giá</span>;
            case 'PENDING': return <span className="status-badge order-status-badge" style={getStyle('yellow')}><ion-icon name="time-outline"></ion-icon> Chờ xử lý</span>;
            case 'ACCEPTED': return <span className="status-badge order-status-badge" style={getStyle('green')}><ion-icon name="checkmark-circle-outline"></ion-icon> Đã nhận làm</span>;
            case 'CONFIRMED': return <span className="status-badge order-status-badge" style={getStyle('green')}><ion-icon name="checkmark-done-circle-outline"></ion-icon> Đã xác nhận</span>;
            case 'IN_PRODUCTION': return <span className="status-badge order-status-badge" style={getStyle('blue')}><ion-icon name="construct-outline"></ion-icon> Đang sản xuất</span>;
            case 'QC': return <span className="status-badge order-status-badge" style={getStyle('orange')}><ion-icon name="flask-outline"></ion-icon> Kiểm định QC</span>;
            case 'COMPLETED': return <span className="status-badge order-status-badge" style={getStyle('green')}><ion-icon name="checkmark-circle-outline"></ion-icon> Hoàn thành</span>;
            case 'CANCELED': return <span className="status-badge order-status-badge" style={getStyle('red')}><ion-icon name="ban-outline"></ion-icon> Đã hủy</span>;
            case 'REJECTED': return <span className="status-badge order-status-badge" style={getStyle('red')}><ion-icon name="close-circle-outline"></ion-icon> Bị từ chối</span>;
            case 'SHIPPING': return <span className="status-badge order-status-badge" style={getStyle('blue')}><ion-icon name="car-outline"></ion-icon> Đang giao</span>;
            case 'DELIVERED': return <span className="status-badge order-status-badge" style={getStyle('green')}><ion-icon name="cube-outline"></ion-icon> Đã giao</span>;
            default: return <span className="status-badge order-status-badge" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}>{order.status}</span>;
        }
    };

    const trustInfo = (score?: number) => {
        const safeScore = Math.max(0, Math.min(100, Math.round(score ?? 100)));
        if (safeScore >= 80) return { score: safeScore, label: 'Tốt', tone: 'good' };
        if (safeScore >= 50) return { score: safeScore, label: 'Trung bình', tone: 'medium' };
        return { score: safeScore, label: 'Rủi ro', tone: 'risk' };
    };

    const selectedBuyerTeam = myTeams.find(team => team.id === selectedTeam);
    const ownTrust = trustInfo(
        activeTab === 'outbound'
            ? (selectedBuyerTeam?.trustScore ?? orders[0]?.buyerTrustScore ?? 100)
            : undefined
    );
    const ownTrustTotalOrders = selectedBuyerTeam?.totalOrders ?? orders.length;
    const ownTrustCompletedOrders = selectedBuyerTeam?.completedOrders;
    const inboundAverageTrust = orders.length
        ? Math.round(orders.reduce((sum, order) => sum + (order.buyerTrustScore ?? 100), 0) / orders.length)
        : 100;
    const inboundTrust = trustInfo(inboundAverageTrust);

    const renderTrustBadge = (score?: number, compact = false) => {
        const info = trustInfo(score);
        return (
            <span className={`order-trust-badge ${info.tone} ${compact ? 'compact' : ''}`}>
                <ion-icon name={info.tone === 'good' ? 'shield-checkmark-outline' : info.tone === 'medium' ? 'shield-half-outline' : 'warning-outline'}></ion-icon>
                <strong>{info.score}%</strong>
                <span>{info.label}</span>
            </span>
        );
    };



    return (
        <div className="page-container">
            <header className="page-header glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', marginBottom: 24 }}>
                <div>
                    <h1 className="page-title text-glow-active" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="icon-container glow" style={{ width: 32, height: 32, fontSize: 20 }}><ion-icon name="cube-outline"></ion-icon></span> Quản lý đơn hàng
                    </h1>
                    <p className="page-subtitle">Theo dõi đơn đi đặt tại xưởng khác và đơn nhận gia công.</p>
                </div>
            </header>

            <div className="tabs-container glass-panel" style={{ marginBottom: '20px', display: 'inline-block', padding: 4 }}>
                <div className="tabs-header" style={{ gap: 8 }}>
                    <button
                        className={`tab-btn ${activeTab === 'outbound' ? 'active' : ''}`}
                        onClick={() => setActiveTab('outbound')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <ion-icon name="arrow-up-outline" style={{ fontSize: '15px' }}></ion-icon> Đơn đã đi đặt (Mua)
                        {unreadOutboundCount > 0 && <span className="nav-badge" style={{ background: '#E53935', color: '#fff', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '10px', marginLeft: 4 }}>{unreadOutboundCount}</span>}
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'inbound' ? 'active' : ''}`}
                        onClick={() => {
                            setActiveTab('inbound');
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <ion-icon name="arrow-down-outline" style={{ fontSize: '15px' }}></ion-icon> Đơn xưởng khác đặt (Bán/Gia công)
                    </button>
                </div>
            </div>

            {activeTab === 'outbound' && (
                <div className="order-trust-panel glass-panel">
                    <div>
                        <span className="order-trust-eyebrow">Uy tín của bạn khi đi đặt hàng</span>
                        <h2>Điểm uy tín người đặt: {ownTrust.score}%</h2>
                        <p>
                            Điểm này được bên gia công nhìn thấy khi bạn gửi RFQ/đơn hàng. Hủy đơn hoặc giao dịch không hoàn tất sẽ làm điểm giảm.
                        </p>
                    </div>
                    <div className="order-trust-panel-side">
                        {renderTrustBadge(ownTrust.score)}
                        <small>
                            {selectedBuyerTeam
                                ? `${ownTrustCompletedOrders ?? 0}/${ownTrustTotalOrders || 0} đơn hoàn tất`
                                : `${ownTrustTotalOrders || 0} đơn đang theo dõi`}
                        </small>
                    </div>
                </div>
            )}

            {activeTab === 'inbound' && (
                <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: 20, border: '1px solid rgba(217, 156, 95, 0.28)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>Đơn xưởng khác đặt</h2>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                                Quản lý đơn bán/gia công cho xưởng đang chọn. Cột uy tín cho biết bên đặt có đáng tin để nhận đơn hay không.
                            </p>
                        </div>
                        {orders.length > 0 && (
                            <div className="order-trust-panel-side compact">
                                {renderTrustBadge(inboundTrust.score, true)}
                                <small>Trung bình bên đặt</small>
                            </div>
                        )}
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setShowManualOrderForm(true);
                                setManualCreateError('');
                            }}
                        >
                            <ion-icon name="add-circle-outline" style={{ fontSize: 16 }}></ion-icon>
                            Tạo đơn hàng thủ công
                        </button>
                    </div>
                </div>
            )}

            {showManualOrderForm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(8px)', zIndex: 10000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: 24, padding: '40px',
                        maxWidth: 1000, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
                        maxHeight: '90vh', overflowY: 'auto', position: 'relative'
                    }}>
                        <button
                            type="button"
                            onClick={() => setShowManualOrderForm(false)}
                            style={{ position: 'absolute', top: 24, right: 32, background: 'transparent', border: 'none', fontSize: 32, color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', transition: 'all 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            &times;
                        </button>
                        
                        <div style={{ marginBottom: 32 }}>
                            <h2 style={{ margin: 0, fontSize: 28, color: 'var(--text-primary)', fontWeight: 800 }}>Đơn xưởng khác đặt</h2>
                            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 16 }}>
                                Tạo nhanh đơn bán/gia công thủ công cho xưởng đang chọn.
                            </p>
                        </div>
                        
                        <form onSubmit={handleCreateManualInboundOrder} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 32px' }}>
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Tên đơn hàng *</label>
                                <input
                                    value={manualOrderForm.title}
                                    onChange={event => handleManualOrderChange('title', event.target.value)}
                                    placeholder="VD: Đơn gia công rang 20kg Robusta"
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Khách / xưởng đặt *</label>
                                <input
                                    value={manualOrderForm.customerName}
                                    onChange={event => handleManualOrderChange('customerName', event.target.value)}
                                    placeholder="Tên khách hoặc xưởng đặt"
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Số điện thoại</label>
                                <input
                                    value={manualOrderForm.contactPhone}
                                    onChange={event => handleManualOrderChange('contactPhone', event.target.value)}
                                    placeholder="SĐT liên hệ"
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Số lượng</label>
                                <input
                                    type="text"
                                    value={manualOrderForm.quantity ? new Intl.NumberFormat('vi-VN').format(manualOrderForm.quantity) : ''}
                                    onChange={event => {
                                        const numericValue = event.target.value.replace(/\D/g, '');
                                        handleManualOrderChange('quantity', numericValue ? Number(numericValue) : 0);
                                    }}
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Hạn chót</label>
                                <input
                                    type="date"
                                    value={manualOrderForm.deadline}
                                    onChange={event => handleManualOrderChange('deadline', event.target.value)}
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none' }}
                                />
                            </div>
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Mô tả đơn</label>
                                <textarea
                                    value={manualOrderForm.description}
                                    onChange={event => handleManualOrderChange('description', event.target.value)}
                                    placeholder="Mặt hàng, quy cách, yêu cầu gia công/bán hàng..."
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none', minHeight: 120, resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Địa chỉ giao hàng</label>
                                <input
                                    value={manualOrderForm.deliveryAddress}
                                    onChange={event => handleManualOrderChange('deliveryAddress', event.target.value)}
                                    placeholder="Địa chỉ nhận/giao"
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 16, color: 'var(--text-primary)', marginBottom: 10, fontWeight: 600 }}>Ghi chú</label>
                                <input
                                    value={manualOrderForm.deliveryNote}
                                    onChange={event => handleManualOrderChange('deliveryNote', event.target.value)}
                                    placeholder="Giao giờ hành chính, gọi trước..."
                                    style={{ width: '100%', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 16, outline: 'none' }}
                                />
                            </div>
                            {manualCreateError && <div style={{ gridColumn: '1/-1', color: '#ef4444', fontSize: 16, fontWeight: 500, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}>{manualCreateError}</div>}
                            <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 16 }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setShowManualOrderForm(false);
                                        setManualCreateError('');
                                    }}
                                    style={{ padding: '14px 28px', fontSize: 16 }}
                                >
                                    Hủy
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={manualCreateLoading} style={{ opacity: manualCreateLoading ? 0.65 : 1, padding: '14px 28px', fontSize: 16 }}>
                                    {manualCreateLoading ? 'Đang tạo...' : 'Tạo đơn thủ công'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                    <p>Đang tải đơn hàng...</p>
                </div>
            ) : orders.length === 0 ? (
                <div className="empty-state glass-panel" style={{ padding: '80px 20px', borderStyle: 'dashed' }}>
                    <div className="empty-icon"><span className="icon-container glow" style={{ width: 64, height: 64, fontSize: 40 }}><ion-icon name="cube-outline"></ion-icon></span></div>
                    <p>Chưa có đơn hàng nào trong thư mục này.</p>
                </div>
            ) : (
                <div className="table-responsive glass-panel" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input 
                            type="text" 
                            placeholder="Tìm kiếm tên đơn hàng..." 
                            value={searchKeyword}
                            onChange={e => { setSearchKeyword(e.target.value); setCurrentPage(1); }}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', minWidth: 250 }}
                        />
                        <select 
                            value={statusFilter} 
                            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                        >
                            <option value="">Tất cả trạng thái</option>
                            <option value="PENDING">Chờ xử lý</option>
                            <option value="ACCEPTED">Đã nhận làm</option>
                            <option value="SHIPPING">Đang giao</option>
                            <option value="DELIVERED">Đã giao</option>
                            <option value="COMPLETED">Hoàn tất</option>
                            <option value="CANCELED">Đã hủy</option>
                            <option value="REJECTED">Từ chối</option>
                            <option value="DISPUTED">Khiếu nại</option>
                        </select>
                        
                        {selectedOrderIds.length > 0 && (
                            <button className="btn btn-primary" onClick={handleExportExcel}>
                                <ion-icon name="download-outline" style={{ marginRight: 5 }}></ion-icon> Xuất Excel ({selectedOrderIds.length})
                            </button>
                        )}
                    </div>
                    <table className="goals-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '12px', width: 40 }}>
                                    <input type="checkbox" onChange={handleSelectAll} checked={paginatedOrders.length > 0 && selectedOrderIds.length === paginatedOrders.length} />
                                </th>
                                <th style={{ textAlign: 'left', padding: '12px' }}>Đơn hàng</th>
                                <th style={{ textAlign: 'left', padding: '12px' }}>{activeTab === 'outbound' ? 'Nhà cung cấp (Bán)' : 'Người đặt (Mua)'}</th>
                                {activeTab === 'inbound' && <th style={{ textAlign: 'center', padding: '12px' }}>Uy tín</th>}
                                <th style={{ textAlign: 'center', padding: '12px' }}>Số lượng</th>
                                <th style={{ textAlign: 'left', padding: '12px' }}>Hạn chót</th>
                                <th style={{ textAlign: 'left', padding: '12px' }}>Trạng thái</th>
                                <th style={{ textAlign: 'right', padding: '12px' }}>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedOrders.map(order => (
                                <React.Fragment key={order.id}>
                                <tr style={{ borderBottom: expandedOrderId === order.id ? 'none' : '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px', width: 40 }} onClick={(e) => e.stopPropagation()}>
                                        <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => handleSelectOrder(order.id)} />
                                    </td>
                                    <td style={{ padding: '12px', cursor: 'pointer' }} onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <ion-icon name={expandedOrderId === order.id ? 'chevron-down-outline' : 'chevron-forward-outline'} style={{ fontSize: '14px', color: 'var(--text-secondary)', flexShrink: 0 }}></ion-icon>
                                            <div>
                                                <strong>{order.title}</strong>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    {order.description}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="group-icon" style={{ fontSize: '1rem', padding: '4px' }}><ion-icon name="business-outline" style={{ fontSize: '16px' }}></ion-icon></span>
                                            {activeTab === 'outbound' ? order.sellerTeamName : (order.buyerTeamName || order.buyerUserName || 'Khách thuê gia công')}
                                        </div>
                                    </td>
                                    {activeTab === 'inbound' && (
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            {renderTrustBadge(order.buyerTrustScore, true)}
                                        </td>
                                    )}
                                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                                        {order.quantity}
                                    </td>
                                    <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                                        {order.deadline ? new Date(order.deadline).toLocaleDateString('vi-VN') : 'Không có'}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {getStatusBadge(order)}
                                    </td>
                                    <td className="order-actions-cell" style={{ padding: '12px', textAlign: 'right' }}>
                                        <div className="order-actions" onClick={e => e.stopPropagation()}>
                                            {/* Inbound PENDING: Accept/Reject */}
                                            {activeTab === 'inbound' && (order.status === 'PENDING' || order.status === 'RFQ_CREATED') && !order.cancelRequested && (
                                                <>
                                                    <button className="btn btn-secondary" onClick={() => handleReject(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Từ chối</button>
                                                    <button className="btn btn-primary" onClick={() => { setQuoteOrderId(order.id); setQuotePrice(order.budget != null ? String(order.budget) : ''); }} style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'var(--accent-color)', color: '#fff', border: 'none' }}>Báo giá</button>
                                                    <button className="btn btn-primary" onClick={() => handleAccept(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Chấp nhận</button>
                                                </>
                                            )}
                                            {/* Inbound QUOTED/REJECTED/REQUOTED: Báo giá lại */}
                                            {activeTab === 'inbound' && (order.status === 'QUOTED' || order.status === 'REJECTED' || order.status === 'REQUOTED') && !order.cancelRequested && (
                                                <button className="btn btn-primary" onClick={() => { setQuoteOrderId(order.id); setQuotePrice(order.quotedPrice != null ? String(order.quotedPrice) : ''); }} style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'var(--accent-color)', color: '#fff', border: 'none' }}>Báo giá lại</button>
                                            )}
                                            {/* Inbound REQUOTE_ACCEPTED: Xác nhận chốt đơn */}
                                            {activeTab === 'inbound' && order.status === 'REQUOTE_ACCEPTED' && !order.cancelRequested && (
                                                <button className="btn btn-primary" onClick={() => handleSellerConfirmRequote(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#10b981', color: '#fff', border: 'none' }}>Xác nhận chốt đơn</button>
                                            )}
                                            {/* Outbound QUOTED: Confirm/Reject */}
                                            {activeTab === 'outbound' && order.status === 'QUOTED' && !order.cancelRequested && (
                                                <>
                                                    <button className="btn btn-secondary" onClick={() => handleReject(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Từ chối báo giá</button>
                                                    <button className="btn btn-primary" onClick={() => handleConfirmQuote(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#10b981', color: '#fff', border: 'none' }}>Đồng ý chốt đơn</button>
                                                </>
                                            )}
                                            {/* Outbound REQUOTED: Accept/Reject Requote Banner */}
                                            {activeTab === 'outbound' && order.status === 'REQUOTED' && !order.cancelRequested && (
                                                <div style={{ display: 'inline-flex', gap: '8px', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--info)', fontWeight: '500' }}>Xưởng đã báo giá lại. Xác nhận:</span>
                                                    <button className="btn btn-secondary" onClick={() => handleBuyerRejectRequote(order.id)} style={{ padding: '2px 8px', fontSize: '0.75rem' }}>Từ chối</button>
                                                    <button className="btn btn-primary" onClick={() => handleBuyerAcceptRequote(order.id)} style={{ padding: '2px 8px', fontSize: '0.75rem', background: '#10b981', color: '#fff', border: 'none' }}>Chấp nhận</button>
                                                </div>
                                            )}
                                            {/* Inbound ACCEPTED: Mark as Shipping */}
                                            {activeTab === 'inbound' && (order.status === 'ACCEPTED' || order.status === 'CONFIRMED') && !order.cancelRequested && (
                                                <button className="btn btn-primary" onClick={() => handleShip(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}><ion-icon name="car-outline" style={{ fontSize: '13px', verticalAlign: 'middle', marginRight: 2 }}></ion-icon> Giao hàng</button>
                                            )}
                                            {/* Inbound ACCEPTED/CONFIRMED... Contract */}
                                            {activeTab === 'inbound' && (order.status === 'ACCEPTED' || order.status === 'CONFIRMED' || order.status === 'DELIVERED' || order.status === 'COMPLETED') && !order.cancelRequested && (
                                                <button className="btn" onClick={() => handleContract(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#3b82f6', color: 'white', border: 'none', marginLeft: '5px' }}><ion-icon name="document-text-outline" style={{ fontSize: '13px', verticalAlign: 'middle', marginRight: 2 }}></ion-icon> Hợp đồng</button>
                                            )}
                                            {/* Inbound PROCESSING: Delivery */}
                                            {activeTab === 'inbound' && order.status === 'PROCESSING' && !order.cancelRequested && (
                                                <button className="btn btn-primary" onClick={() => handleDeliver(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}><ion-icon name="cube-outline" style={{ fontSize: '13px', verticalAlign: 'middle', marginRight: 2 }}></ion-icon> Đã giao hàng</button>
                                            )}
                                            {/* Outbound ACCEPTED/CONFIRMED... Contract */}
                                            {activeTab === 'outbound' && (order.status === 'ACCEPTED' || order.status === 'CONFIRMED' || order.status === 'DELIVERED' || order.status === 'COMPLETED') && !order.cancelRequested && (
                                                <button className="btn" onClick={() => handleContract(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#3b82f6', color: 'white', border: 'none', marginLeft: '5px' }}><ion-icon name="document-text-outline" style={{ fontSize: '13px', verticalAlign: 'middle', marginRight: 2 }}></ion-icon> Hợp đồng</button>
                                            )}
                                            {/* Outbound DELIVERED: Confirm Delivery */}
                                            {activeTab === 'outbound' && order.status === 'DELIVERED' && !order.cancelRequested && (
                                                <button className="btn btn-primary" onClick={() => handleConfirmDelivery(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}><ion-icon name="checkmark-done-outline" style={{ fontSize: '13px', verticalAlign: 'middle', marginRight: 2 }}></ion-icon> Xác nhận đã nhận hàng</button>
                                            )}
                                            {/* Outbound DELIVERED/COMPLETED: Dispute */}
                                            {activeTab === 'outbound' && (order.status === 'DELIVERED' || order.status === 'COMPLETED') && !order.cancelRequested && (
                                                <button className="btn" onClick={() => handleDispute(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#f59e0b', color: 'white', border: 'none' }}><ion-icon name="warning-outline" style={{ fontSize: '13px', verticalAlign: 'middle', marginRight: 2 }}></ion-icon> Mở khiếu nại</button>
                                            )}
                                            {/* Inbound CANCEL_REQUESTED: Approve/Reject Cancel */}
                                            {activeTab === 'inbound' && order.cancelRequested && (
                                                <>
                                                    <button className="btn btn-secondary" onClick={() => handleRejectCancel(order.id)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Từ chối hủy</button>
                                                    <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem', background: '#d32f2f' }} onClick={() => handleApproveCancel(order.id)}>Đồng ý hủy</button>
                                                </>
                                            )}
                                            {/* Both: Cancel (PENDING or ACCEPTED) */}
                                            {(order.status === 'PENDING' || order.status === 'RFQ_CREATED' || order.status === 'ACCEPTED' || order.status === 'CONFIRMED') && !order.cancelRequested && (
                                                <button className="order-cancel-btn" onClick={() => handleCancel(order.id)}><ion-icon name="ban-outline"></ion-icon> {activeTab === 'outbound' ? 'Xin hủy' : 'Hủy'}</button>
                                            )}
                                            {/* Show canceller */}
                                            {order.status === 'CANCELED' && order.cancelledBy && (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Bởi: {order.cancelledBy === 'BUYER' ? 'Bên mua' : 'Bên bán'}</span>
                                            )}
                                            <button className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); window.open(`/orders/${order.id}`, '_blank'); }} style={{ padding: '4px 8px', fontSize: '0.8rem', marginLeft: 5 }}>
                                                <ion-icon name="open-outline" style={{ fontSize: '13px', verticalAlign: 'middle', marginRight: 2 }}></ion-icon> Chi tiết
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {/* Expandable delivery detail row */}
                                {expandedOrderId === order.id && (
                                    <tr key={`${order.id}-detail`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td colSpan={activeTab === 'inbound' ? 7 : 6} style={{ padding: '0 12px 16px 40px' }}>
                                            <div style={{
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border)',
                                                borderLeft: '4px solid var(--primary)',
                                                borderRadius: '12px',
                                                padding: '24px',
                                                marginTop: '8px',
                                                boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
                                                animation: 'fadeIn 0.2s ease-out',
                                                maxWidth: '850px'
                                            }}>
                                                {activeTab === 'inbound' && (
                                                    <div className="order-buyer-trust-detail" style={{ marginBottom: '20px' }}>
                                                        <div>
                                                            <span className="order-trust-eyebrow">Độ tin cậy bên đặt</span>
                                                            <p>Tham khảo trước khi chấp nhận đơn. Điểm thấp nghĩa là bên đặt từng hủy hoặc chưa hoàn tất nhiều giao dịch.</p>
                                                        </div>
                                                        {renderTrustBadge(order.buyerTrustScore)}
                                                    </div>
                                                )}
                                                <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                                                    <div style={{ background: 'var(--primary-soft)', color: 'var(--primary)', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <ion-icon name="location-outline" style={{ fontSize: '18px' }}></ion-icon>
                                                    </div>
                                                    Thông tin giao nhận hàng
                                                </h4>
                                                {(!order.contactPhone && !order.deliveryAddress) ? (
                                                    <div style={{ padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                        <ion-icon name="information-circle-outline" style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}></ion-icon>
                                                        <p style={{ margin: 0, fontSize: '0.95rem' }}>Chưa có thông tin giao hàng cho đơn này.</p>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px 32px' }}>
                                                        {order.contactPhone && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>SĐT liên hệ</span>
                                                                <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <ion-icon name="call-outline" style={{ color: 'var(--primary)', opacity: 0.8 }}></ion-icon>
                                                                    {order.contactPhone}
                                                                </strong>
                                                            </div>
                                                        )}
                                                        {order.contactPhoneAlt && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>SĐT phụ</span>
                                                                <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <ion-icon name="call-outline" style={{ color: 'var(--primary)', opacity: 0.8 }}></ion-icon>
                                                                    {order.contactPhoneAlt}
                                                                </strong>
                                                            </div>
                                                        )}
                                                        {order.deliveryAddress && (
                                                            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Địa chỉ giao hàng</span>
                                                                <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                                                                    <ion-icon name="map-outline" style={{ color: 'var(--primary)', marginTop: '2px', opacity: 0.8 }}></ion-icon>
                                                                    {order.deliveryAddress}
                                                                </strong>
                                                            </div>
                                                        )}
                                                        {formatDeliveryTime(order.preferredDeliveryFrom, order.preferredDeliveryTo) && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Giờ giao mong muốn</span>
                                                                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <ion-icon name="time-outline" style={{ color: 'var(--primary)', opacity: 0.8 }}></ion-icon>
                                                                    {formatDeliveryTime(order.preferredDeliveryFrom, order.preferredDeliveryTo)}
                                                                </strong>
                                                            </div>
                                                        )}
                                                        {order.deliveryFailureAction && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Nếu không giao được</span>
                                                                <strong style={{ fontSize: '0.95rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <ion-icon name="alert-circle-outline"></ion-icon>
                                                                    {deliveryFailureLabel(order.deliveryFailureAction)}
                                                                </strong>
                                                            </div>
                                                        )}
                                                        {order.deliveryNote && (
                                                            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px', borderLeft: '3px solid var(--primary)', paddingLeft: '16px', marginTop: '8px' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Ghi chú giao hàng</span>
                                                                <span style={{ fontSize: '1rem', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: '1.5' }}>"{order.deliveryNote}"</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {order.quotedPrice !== null && order.quotedPrice !== undefined && (
                                                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <ion-icon name="pricetag-outline" style={{ fontSize: '16px' }}></ion-icon> Thông tin báo giá
                                                        </h4>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
                                                            <div>
                                                                <span style={{ color: 'var(--text-secondary)' }}>Giá đề xuất:</span>
                                                                <strong style={{ marginLeft: 6, color: 'var(--accent-color)', fontSize: '1rem' }}>{order.quotedPrice.toLocaleString('vi-VN')} ₫</strong>
                                                            </div>
                                                            {order.quotedNote && (
                                                                <div style={{ gridColumn: 'span 2' }}>
                                                                    <span style={{ color: 'var(--text-secondary)' }}>Ghi chú báo giá:</span>
                                                                    <span style={{ marginLeft: 6 }}>{order.quotedNote}</span>
                                                                </div>
                                                            )}
                                                            {order.quotedAt && (
                                                                <div style={{ gridColumn: 'span 2' }}>
                                                                    <span style={{ color: 'var(--text-secondary)' }}>Thời gian báo giá:</span>
                                                                    <span style={{ marginLeft: 6 }}>{new Date(order.quotedAt).toLocaleString('vi-VN')}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                    
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
                            <button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                Trước
                            </button>
                            <span style={{ padding: '8px 12px' }}>Trang {currentPage} / {totalPages}</span>
                            <button className="btn btn-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                Sau
                            </button>
                        </div>
                    )}
                </div>
            )}

            {quoteOrderId && (
                <div className="mp-publish-sheet-overlay" onClick={() => setQuoteOrderId(null)}>
                    <div className="mp-publish-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', margin: 'auto', marginTop: '10vh', height: 'auto', borderRadius: '12px', background: '#ffffff', color: '#1f2937', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                        <div className="mp-publish-header" style={{ borderBottom: '1px solid #f3f4f6', padding: '16px 20px', display: 'flex', alignItems: 'center' }}>
                            <button className="mp-publish-back" onClick={() => setQuoteOrderId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, marginRight: '12px', display: 'flex' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>close</span>
                            </button>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>Báo giá đơn hàng</h2>
                        </div>
                        <div className="mp-publish-content" style={{ padding: '24px' }}>
                            <div className="form-group" style={{ marginBottom: 20 }}>
                                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>Giá đề xuất (VND)</label>
                                <input type="text" className="form-control" value={quotePrice ? new Intl.NumberFormat('vi-VN').format(Number(quotePrice.replace(/\D/g, ''))) : ''} onChange={e => {
                                    const numericValue = e.target.value.replace(/\D/g, '');
                                    setQuotePrice(numericValue);
                                }} placeholder="Nhập giá báo cho khách" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 24 }}>
                                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}>Ghi chú báo giá</label>
                                <textarea className="form-control" rows={3} value={quoteNote} onChange={e => setQuoteNote(e.target.value)} placeholder="Ghi chú thêm về giá (chi phí vận chuyển, đóng gói...)" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' }}></textarea>
                            </div>
                            <button className="btn btn-primary" onClick={handleQuoteSubmit} style={{ width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 600, background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', transition: 'background-color 0.2s', boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)' }}>Gửi báo giá</button>
                        </div>
                    </div>
                </div>
            )}

            <DisputeModal
                isOpen={!!disputeOrderId}
                onClose={() => setDisputeOrderId(null)}
                onSubmit={submitDispute}
            />
            
            <BuyerConfirmDeliveryModal
                isOpen={!!confirmDeliveryOrderId}
                onClose={() => setConfirmDeliveryOrderId(null)}
                onSubmit={submitConfirmDelivery}
            />

            <DeliverOrderModal
                isOpen={!!deliverOrderId}
                onClose={() => setDeliverOrderId(null)}
                onSubmit={submitDeliverOrder}
            />

            <ContractModal
                isOpen={!!contractOrderId}
                onClose={() => setContractOrderId(null)}
                orderId={contractOrderId || ''}
            />
        </div>
    );
}

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { paymentService } from '../services/paymentService';
import type { SubscriptionPlan } from '../types/types';
import { PAYMENT_SUCCESS_MESSAGE, PAYMENT_SUCCESS_TITLE } from '../utils/paymentNotifications';
import './UpgradePlanPage.css';

export default function UpgradePlanPage() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const { fetchUser } = useAuth();
    const { success: showSuccessToast, error: showErrorToast } = useToast();

    useEffect(() => {
        paymentService.getPlans()
            .then(data => {
                // Sắp xếp theo giá tăng dần
                setPlans(data.sort((a, b) => a.price - b.price));
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
    }, []);

    const handleSelectPlan = async (plan: SubscriptionPlan) => {
        if (!plan.id || plan.price === 0) {
            return;
        }
        localStorage.setItem('orca-ai-plan-pending', plan.id);
        localStorage.setItem('orca-payment-method', 'PAYOS');
        
        try {
            const res = await paymentService.createPayosPayment(plan.id);
            window.location.href = res.checkoutUrl;
        } catch {
            showErrorToast('Không thể tạo link thanh toán', 'Vui lòng thử lại PayOS sau ít phút.');
        }
    };

    if (loading) {
        return <div className="pricing-page"><p style={{textAlign: 'center', marginTop: 100}}>Đang tải gói dịch vụ...</p></div>;
    }

    const formatPrice = (price: number) => {
        if (price === 0) {
            return 'Free';
        }
        return price.toLocaleString('vi-VN') + 'đ';
    };

    const getThemeForIndex = (index: number) => {
        if (index === 0) return 'light';
        if (index === 1) return 'beige';
        return 'dark';
    };

    return (
        <div className="pricing-page">
            <section className="pricing-header">
                <h1>Giải pháp AI cho sản xuất</h1>
                <p>Chọn gói phù hợp để tối ưu quy trình và nâng cao năng suất nhà máy của bạn.</p>
            </section>

            <section className="pricing-grid">
                {plans.map((plan, index) => {
                    const theme = getThemeForIndex(index);
                    const isFeatured = index === 1; // Highlight gói ở giữa
                    const features = plan.features ? plan.features.split(',').map(f => f.trim()) : [];
                    
                    return (
                        <article
                            key={plan.id}
                            className={`pricing-card theme-${theme} ${isFeatured ? 'featured' : ''}`}
                        >
                            {isFeatured && <span className="pricing-ribbon">★ Phổ biến nhất</span>}
                            
                            <h2>{plan.name}</h2>
                            
                            <div className="pricing-price">
                                <strong>{formatPrice(plan.price)}</strong>
                                {plan.price > 0 && <span>/{plan.period || 'Tháng'}</span>}
                            </div>

                            <div className="pricing-subtitle">
                                <strong>Giới hạn: {plan.users} NV, {plan.workshops} Xưởng</strong>
                            </div>

                            <button
                                type="button"
                                className="pricing-action"
                                onClick={() => handleSelectPlan(plan)}
                            >
                                {plan.price === 0 ? 'Gói mặc định' : 'Nâng cấp ngay'}
                            </button>

                            <ul className="pricing-features">
                                {features.map((feature, idx) => (
                                    <li key={idx}>
                                        <CheckCircle2 className="check-icon" size={18} />
                                        <span>{feature}</span>
                                    </li>
                                ))}
                                <li>
                                    <CheckCircle2 className="check-icon" size={18} />
                                    <span>Tối đa {plan.orders} đơn hàng/tháng</span>
                                </li>
                            </ul>
                            
                                                        {/* Nút Test (Hiện ở cả 3 gói) */}
                            <div 
                                style={{ 
                                    width: '16px', 
                                    height: '16px', 
                                    borderRadius: '50%', 
                                    backgroundColor: 'transparent',
                                    border: '1.5px solid #fde047',
                                    margin: '16px auto 0',
                                    cursor: 'pointer', 
                                    opacity: 0.8,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                                }}
                                title="Mô phỏng thanh toán PayOS thành công"
                                onClick={async () => {
                                    if (!plan.id) {
                                        return;
                                    }
                                    try {
                                            const res = await paymentService.createVirtualQrPayment(plan.id, 'PAYOS');
                                            if (res.txnRef) {
                                                const paymentResult = await paymentService.confirmVirtualQrPayment(res.txnRef);
                                                localStorage.setItem('orca-ai-plan', paymentResult.planId || res.planId || plan.id);
                                                localStorage.removeItem('orca-ai-plan-pending');
                                                await fetchUser();
                                                showSuccessToast(PAYMENT_SUCCESS_TITLE, PAYMENT_SUCCESS_MESSAGE);
                                            }
                                        } catch (e: any) {
                                            console.error(e);
                                            showErrorToast('Lỗi mô phỏng thanh toán', e?.response?.data?.error || e.message);
                                        }
                                }}
                            />
                        </article>
                    );
                })}
            </section>
        </div>
    );
}

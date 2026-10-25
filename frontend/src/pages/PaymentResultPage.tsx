import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleAlert, ReceiptText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PAYMENT_SUCCESS_MESSAGE, PAYMENT_SUCCESS_TITLE } from '../utils/paymentNotifications';
import './PaymentResultPage.css';

export default function PaymentResultPage() {
    const [searchParams] = useSearchParams();
    const { fetchUser } = useAuth();
    const { success: showSuccessToast } = useToast();
    const status = searchParams.get('status');
    const txnRef = searchParams.get('txnRef') || searchParams.get('orderCode');
    const planId = searchParams.get('planId') || localStorage.getItem('orca-ai-plan-pending') || localStorage.getItem('orca-ai-plan');
    const message = searchParams.get('message');
    const cancel = searchParams.get('cancel');
    const code = searchParams.get('code');
    
    const success = status === 'SUCCESS' || status === 'PAID' || (code === '00' && cancel !== 'true');

    useEffect(() => {
        if (success) {
            fetchUser();
            if (!sessionStorage.getItem(`payment_alert_${txnRef}`)) {
                showSuccessToast(PAYMENT_SUCCESS_TITLE, PAYMENT_SUCCESS_MESSAGE);
                sessionStorage.setItem(`payment_alert_${txnRef}`, 'true');
            }
        }
    }, [success, fetchUser, txnRef, showSuccessToast]);

    return (
        <div className="payment-result-page">
            <section className={`payment-result-card ${success ? 'success' : 'failed'}`}>
                <div className="payment-result-icon">
                    {success ? <CheckCircle2 size={34} /> : <CircleAlert size={34} />}
                </div>
                <span className="payment-result-kicker">PAYOS</span>
                <h1>{success ? 'Thanh toán thành công' : 'Thanh toán chưa hoàn tất'}</h1>
                <p>{message || (success ? 'Gói AI của bạn đã được kích hoạt.' : 'Giao dịch bị hủy hoặc không hợp lệ.')}</p>

                <img
                    className="payment-result-photo"
                    src="https://images.pexels.com/photos/30427274/pexels-photo-30427274.jpeg?auto=compress&cs=tinysrgb&w=900"
                    alt="Cà phê espresso mới pha"
                />

                <div className="payment-result-details">
                    <div>
                        <span>Mã giao dịch</span>
                        <strong>{txnRef || '-'}</strong>
                    </div>
                    <div>
                        <span>Gói AI</span>
                        <strong>{planId || '-'}</strong>
                    </div>
                    <div>
                        <span>Trạng thái</span>
                        <strong>{status || '-'}</strong>
                    </div>
                </div>

                <div className="payment-result-actions">
                    <Link to="/upgrade" className="payment-result-primary">
                        <ReceiptText size={16} />
                        Quay lại gói AI
                    </Link>
                    <Link to="/dashboard" className="payment-result-secondary">
                        Về dashboard
                    </Link>
                </div>
            </section>
        </div>
    );
}

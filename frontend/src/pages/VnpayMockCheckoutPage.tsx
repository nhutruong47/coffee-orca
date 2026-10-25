import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, Copy, ExternalLink, QrCode, Smartphone, X } from 'lucide-react';
import QRCode from 'qrcode';
import { paymentService, type PaymentMethod, type VirtualQrPaymentResponse } from '../services/paymentService';
import './VnpayMockCheckoutPage.css';

const planMap: Record<string, { name: string; amount: number }> = {
    free: { name: 'Free', amount: 0 },
    plus: { name: 'Plus', amount: 129000 },
    professional: { name: 'Plus', amount: 129000 },
    enterprise: { name: 'Doanh nghiệp', amount: 249000 },
};

const methodConfig: Record<PaymentMethod, {
    label: string;
    shortLabel: string;
    className: string;
    instruction: string;
}> = {
    MB_BANK: {
        label: 'Thanh toán chuyển khoản MB Bank',
        shortLabel: 'MB Bank',
        className: 'mb-bank',
        instruction: 'Mở ứng dụng ngân hàng, quét mã VietQR và xác nhận chuyển khoản.',
    },
    VNPAY: {
        label: 'Cổng thanh toán VNPay QR',
        shortLabel: 'VNPay',
        className: 'vnpay',
        instruction: 'Mở mobile banking hoặc ví hỗ trợ VNPay QR để quét mã thử nghiệm.',
    },
    PAYOS: {
        label: 'Thanh toán qua PayOS',
        shortLabel: 'PayOS',
        className: 'payos',
        instruction: 'Quét mã VietQR trên cổng PayOS để thanh toán.',
    },
};

function formatCurrency(value: number) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
    }).format(value);
}

function RealQr({ payload, label }: { payload: string; label: string }) {
    const [dataUrl, setDataUrl] = useState('');

    useEffect(() => {
        let mounted = true;
        setDataUrl('');

        QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'Q',
            margin: 2,
            width: 216,
            color: {
                dark: '#111827',
                light: '#ffffff',
            },
        })
            .then(url => {
                if (mounted) setDataUrl(url);
            })
            .catch(() => {
                if (mounted) setDataUrl('');
            });

        return () => {
            mounted = false;
        };
    }, [payload]);

    if (!dataUrl) {
        return <div className="qr-render-error">Không thể render QR</div>;
    }

    return <img className="real-qr" src={dataUrl} alt={`QR thanh toán ${label}`} />;
}

export default function VnpayMockCheckoutPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const planId = searchParams.get('planId') || 'plus';
    const plan = planMap[planId] ?? planMap.plus;
    const methodParam = searchParams.get('method')?.toUpperCase();
    const method: PaymentMethod =
        methodParam === 'MB_BANK' || methodParam === 'PAYOS' ? methodParam : 'VNPAY';
    const config = methodConfig[method];
    const [qrPayment, setQrPayment] = useState<VirtualQrPaymentResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const openPaymentUrl = qrPayment?.deeplink || qrPayment?.payUrl || '';

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        setError('');
        setQrPayment(null);

        paymentService.createVirtualQrPayment(planId, method)
            .then(response => {
                if (!mounted) return;
                setQrPayment(response);
            })
            .catch(err => {
                if (!mounted) return;
                const maybeAxios = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
                setError(maybeAxios.response?.data?.message || maybeAxios.response?.data?.error || maybeAxios.message || 'Không thể tạo mã QR thanh toán.');
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => {
            mounted = false;
        };
    }, [method, planId]);

    const handleCopy = async () => {
        if (!qrPayment) return;
        await navigator.clipboard.writeText(qrPayment.txnRef);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };

    const handleConfirm = async () => {
        if (!qrPayment || confirming) return;
        setConfirming(true);
        setError('');
        try {
            const response = await paymentService.confirmVirtualQrPayment(qrPayment.txnRef);
            if (response.status === 'SUCCESS' || response.status === 'PAID') {
                localStorage.setItem('orca-ai-plan', response.planId);
            }
            const params = new URLSearchParams({
                status: response.status,
                txnRef: response.txnRef,
                planId: response.planId,
                message: response.message || `Thanh toán qua ${config.shortLabel} thành công`,
            });
            navigate(`/payment-result?${params.toString()}`);
        } catch (err) {
            const maybeAxios = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
            setError(maybeAxios.response?.data?.message || maybeAxios.response?.data?.error || maybeAxios.message || 'Không thể xác nhận giao dịch.');
            setConfirming(false);
        }
    };

    return (
        <div className={`vnpay-mock-page ${config.className}`}>
            <header className="vnpay-mock-header">
                <Link to="/upgrade" className="vnpay-back">
                    <ArrowLeft size={18} />
                    <span>Quay lại</span>
                </Link>
                <div className="vnpay-brand">
                    <span>{config.shortLabel}</span>
                    <strong>QR</strong>
                </div>
                <button type="button" className="vnpay-close" onClick={() => navigate('/upgrade')} title="Hủy thanh toán">
                    <X size={20} />
                </button>
            </header>

            <main className="vnpay-mock-shell">
                <section className="payment-order-card">
                    <aside className="payment-order-info">
                        <span className="payment-provider">{config.label}</span>
                        <h1>Thông tin đơn hàng</h1>
                        <dl>
                            <div>
                                <dt>Nhà cung cấp</dt>
                                <dd>ORCA AI</dd>
                            </div>
                            <div>
                                <dt>Gói nâng cấp</dt>
                                <dd>{plan.name}</dd>
                            </div>
                            <div>
                                <dt>Mã đơn hàng</dt>
                                <dd>{qrPayment?.txnRef || 'Đang tạo...'}</dd>
                            </div>
                            <div>
                                <dt>Số tiền</dt>
                                <dd className="payment-amount">{formatCurrency(qrPayment?.amount ?? plan.amount)}</dd>
                            </div>
                        </dl>
                        <button type="button" className="copy-txn" onClick={handleCopy} disabled={!qrPayment}>
                            <Copy size={15} />
                            {copied ? 'Đã sao chép' : 'Sao chép mã đơn'}
                        </button>
                    </aside>

                    <section className="payment-qr-panel">
                        <div className="payment-qr-head">
                            <QrCode size={22} />
                            <h2>Quét mã QR để thanh toán</h2>
                        </div>

                        {loading && <div className="qr-placeholder">Đang tạo QR...</div>}
                        {!loading && qrPayment && (
                            <>
                                <div className="payment-qr-frame">
                                    <RealQr payload={qrPayment.qrPayload} label={config.shortLabel} />
                                </div>
                                <p className="scan-copy">
                                    <Smartphone size={16} />
                                    {config.instruction}
                                </p>
                                <div className="payment-expiry">
                                    <Clock3 size={15} />
                                    Hết hạn sau 15 phút
                                </div>
                                {openPaymentUrl && (
                                    <a className="open-wallet-link" href={openPaymentUrl}>
                                        <ExternalLink size={15} />
                                        Mở {config.shortLabel}
                                    </a>
                                )}
                            </>
                        )}

                        {error && <div className="vnpay-error">{error}</div>}

                        <button type="button" className="vnpay-confirm" onClick={handleConfirm} disabled={!qrPayment || confirming}>
                            {confirming ? 'Đang cập nhật database...' : (method === 'PAYOS' ? 'Xác nhận thanh toán (Test dòng tiền Admin)' : `Tôi đã thanh toán qua ${config.shortLabel}`)}
                        </button>
                        <button type="button" className="vnpay-cancel" onClick={() => navigate('/upgrade')}>
                            Hủy thanh toán
                        </button>
                    </section>
                </section>

                <section className="payment-mobile-steps" aria-label="Các bước thanh toán">
                    {['Mở ứng dụng trên điện thoại', 'Quét QR trên màn hình', 'Xác nhận để ORCA cập nhật gói'].map((step, index) => (
                        <div key={step}>
                            <CheckCircle2 size={16} />
                            <span>{index + 1}</span>
                            <strong>{step}</strong>
                        </div>
                    ))}
                </section>
            </main>
        </div>
    );
}

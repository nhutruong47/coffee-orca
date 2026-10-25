import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { jwtDecode } from 'jwt-decode';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';

interface InviteTokenPayload {
    email?: string;
    teamId?: string;
    role?: string;
    exp?: number;
}

export default function InviteAcceptPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const { code: inviteCode } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated } = useAuth();

    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tokenInfo, setTokenInfo] = useState<InviteTokenPayload | null>(null);
    const [joinedTeamName] = useState('');

    const isCodeMode = !!inviteCode;

    useEffect(() => {
        if (isCodeMode) return; // Code mode doesn't need token validation
        if (!token) {
            setError('Đường dẫn không hợp lệ — thiếu token.');
            return;
        }
        try {
            const decoded = jwtDecode<InviteTokenPayload>(token);
            if (decoded.exp && decoded.exp * 1000 < Date.now()) {
                setError('Link mời đã hết hạn (sau 7 ngày).');
                return;
            }
            setTokenInfo(decoded);
        } catch {
            setError('Token không hợp lệ hoặc đã bị chỉnh sửa.');
        }
    }, [token, isCodeMode]);

    const handleAccept = async () => {
        if (!isAuthenticated) {
            navigate(`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`);
            return;
        }
        try {
            setLoading(true);
            const jwt = sessionStorage.getItem('token');
            const headers = { Authorization: `Bearer ${jwt}` };

            if (isCodeMode) {
                setError('Luồng tham gia bằng mã mời chung đã bị vô hiệu hóa. Vui lòng yêu cầu chủ nhóm gửi lời mời qua email.');
                return;
            } else {
                // Join by token
                await axios.post(
                    `${API}/api/teams/invites/accept`,
                    { token },
                    { headers }
                );
            }
            setDone(true);
            setTimeout(() => navigate('/groups'), 2500);
        } catch (err: any) {
            setError(err.response?.data?.message || err.response?.data?.error || 'Không thể tham gia nhóm. Vui lòng thử lại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: "'Inter', sans-serif"
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: 24,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                maxWidth: 480,
                width: '100%',
                padding: '48px 40px',
                textAlign: 'center',
                animation: 'fadeInUp 0.4s ease',
                color: '#1a1a1a'
            }}>
                {/* Icon */}
                <div style={{ marginBottom: 28 }}>
                    <div style={{
                        width: 72, height: 72,
                        borderRadius: '50%',
                        background: error ? 'rgba(239,68,68,0.1)' : done ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px',
                        fontSize: 36
                    }}>
                        {error ? <ion-icon name="close-circle-outline" style={{ fontSize: '36px', color: '#ef4444' }}></ion-icon>
                            : done ? <ion-icon name="checkmark-circle-outline" style={{ fontSize: '36px', color: '#10b981' }}></ion-icon>
                            : <ion-icon name="people-outline" style={{ fontSize: '36px', color: '#d4a574' }}></ion-icon>}
                    </div>

                    {done ? (
                        <>
                            <h1 style={{ color: '#111827', fontSize: 26, fontWeight: 800, margin: '0 0 12px' }}>
                                Tham gia thành công! 🎉
                            </h1>
                            <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                                {joinedTeamName
                                    ? <>Bạn đã gia nhập nhóm <strong style={{ color: '#d4a574' }}>{joinedTeamName}</strong>.</>
                                    : 'Bạn đã được thêm vào nhóm.'}
                                <br />Đang chuyển về trang Nhóm xưởng...
                            </p>
                        </>
                    ) : error ? (
                        <>
                            <h1 style={{ color: '#ef4444', fontSize: 26, fontWeight: 800, margin: '0 0 12px' }}>
                                Không thể tham gia
                            </h1>
                            <p style={{ color: '#6b7280', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
                                {error}
                            </p>
                        </>
                    ) : (
                        <>
                            <h1 style={{ color: '#111827', fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>
                                Lời mời tham gia nhóm
                            </h1>
                            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
                                Bạn được mời tham gia nhóm trên hệ thống{' '}
                                <span style={{ color: '#d4a574', fontWeight: 700 }}>ORCA</span>.
                            </p>

                            {/* Invite Code Display (boxy style) */}
                            {isCodeMode && inviteCode && (
                                <div style={{
                                    background: '#f8fafc', borderRadius: 16, padding: '24px 16px',
                                    border: '1px solid #e2e8f0', marginBottom: 24
                                }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>
                                        Mã mời
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                                        {inviteCode.split('').map((char, idx) => (
                                            <div key={idx} style={{
                                                width: 44, height: 54, background: '#fff', borderRadius: 12,
                                                border: '1px solid #e2e8f0',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 24, fontWeight: 800, color: '#4f46e5',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                            }}>
                                                {char}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Token info display */}
                            {!isCodeMode && tokenInfo?.email && (
                                <div style={{
                                    marginBottom: 20, padding: '12px 16px',
                                    background: '#f8fafc', borderRadius: 12,
                                    border: '1px solid #e2e8f0', fontSize: 13, color: '#6b7280'
                                }}>
                                    Gửi đến: <strong style={{ color: '#d4a574' }}>{tokenInfo.email}</strong>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Buttons */}
                {!done && !error && (
                    <>
                        {!isAuthenticated && (
                            <p style={{
                                fontSize: 13, color: '#6b7280', marginBottom: 20,
                                padding: '12px', background: '#fef3c7', borderRadius: 12,
                                border: '1px dashed #f59e0b'
                            }}>
                                ⚠️ Bạn cần <strong>đăng nhập</strong> hoặc <strong>tạo tài khoản</strong> trước khi tham gia nhóm.
                            </p>
                        )}

                        <button
                            onClick={handleAccept}
                            disabled={loading}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                                background: loading ? '#e2e8f0' : '#d4a574',
                                color: loading ? '#9ca3af' : '#ffffff',
                                fontWeight: 700, fontSize: 15,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s', marginBottom: 12,
                                boxShadow: loading ? 'none' : '0 10px 15px -3px rgba(212,165,116,0.3)'
                            }}
                        >
                            {loading
                                ? <><ion-icon name="sync-outline" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: 6 }}></ion-icon> Đang xử lý...</>
                                : isAuthenticated
                                    ? <><ion-icon name="checkmark-circle-outline" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: 6 }}></ion-icon> Chấp nhận & Tham gia</>
                                    : <><ion-icon name="log-in-outline" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: 6 }}></ion-icon> Đăng nhập để tham gia</>}
                        </button>

                        {!isAuthenticated && (
                            <button
                                onClick={() => navigate(`/register?returnUrl=${encodeURIComponent(location.pathname + location.search)}`)}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: 12,
                                    border: '1px solid #e2e8f0', background: '#f8fafc',
                                    color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                                }}
                            >
                                <ion-icon name="person-add-outline" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: 6 }}></ion-icon> Chưa có tài khoản? Đăng ký ngay
                            </button>
                        )}
                    </>
                )}

                {error && (
                    <button
                        onClick={() => navigate('/login')}
                        style={{
                            width: '100%', padding: '14px', borderRadius: 12,
                            border: 'none', background: '#b97820',
                            color: '#ffffff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                            boxShadow: '0 10px 15px -3px rgba(185,120,32,0.24)'
                        }}
                    >
                        <ion-icon name="arrow-back-outline" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: 6 }}></ion-icon> Về trang đăng nhập
                    </button>
                )}

                <p style={{ marginTop: 24, fontSize: 11, color: '#9ca3af' }}>
                    ORCA — Quản lý xưởng cà phê
                </p>
            </div>

            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

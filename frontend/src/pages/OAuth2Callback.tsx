import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';

/**
 * OAuth2 Callback Page
 * Nhận token từ backend redirect, lưu vào localStorage, fetch user info
 */
export default function OAuth2Callback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            const token = searchParams.get('token');
            const username = searchParams.get('username');
            const role = searchParams.get('role');

            if (token) {
                // Lưu token
                sessionStorage.setItem('token', token);

                try {
                    // Fetch full user info
                    const userInfo = await authService.getMe();
                    sessionStorage.setItem('user', JSON.stringify(userInfo));
                } catch {
                    // Fallback: dùng info từ URL params
                    sessionStorage.setItem('user', JSON.stringify({
                        username: username || '',
                        role: role || 'MEMBER',
                    }));
                }

                // Redirect về dashboard
                navigate('/dashboard', { replace: true });
            } else {
                // Không có token → redirect về login
                navigate('/login', { replace: true });
            }
        };

        handleCallback();
    }, [searchParams, navigate]);

    return (
        <div className="loading-screen">
            <div className="loading-spinner" />
            <p>Đang đăng nhập bằng Google...</p>
        </div>
    );
}

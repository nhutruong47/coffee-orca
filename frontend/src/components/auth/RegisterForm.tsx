import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthField from './AuthField';
import AuthPasswordToggle from './AuthPasswordToggle';
import AuthRememberRow from './AuthRememberRow';
import AuthError from './AuthError';
import AuthSubmitButton from './AuthSubmitButton';

const ICON_USER = (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
    </svg>
);

const ICON_LOCK = (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
        <path
            fillRule="evenodd"
            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
            clipRule="evenodd"
        />
    </svg>
);

const ICON_SHIELD = (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
        <path
            fillRule="evenodd"
            d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
        />
    </svg>
);

interface RegisterFormProps {
    returnUrl: string;
}

const friendlyRegisterError = (message?: string) => {
    const text = (message || '').toLowerCase();
    if (text.includes('tồn tại') || text.includes('unique') || text.includes('constraint') || text.includes('duplicate')) {
        return 'Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.';
    }
    if (text.includes('sql') || text.includes('could not execute statement') || text.includes('public.')) {
        return 'Không thể đăng ký tài khoản. Vui lòng thử lại với tên đăng nhập khác.';
    }
    return message || 'Đăng ký thất bại. Vui lòng thử lại.';
};

export default function RegisterForm({ returnUrl }: RegisterFormProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const remembered = localStorage.getItem('orca_remember_username');
        if (remembered) {
            setUsername(remembered);
            setRememberMe(true);
        }
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
            setError('Vui lòng nhập đầy đủ thông tin!');
            return;
        }

        if (username.trim().length < 3) {
            setError('Tên đăng nhập phải có ít nhất 3 ký tự!');
            return;
        }

        if (password.length < 6) {
            setError('Mật khẩu phải có ít nhất 6 ký tự!');
            return;
        }

        if (password !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp!');
            return;
        }

        setIsLoading(true);
        try {
            await register({ username, password });
            if (rememberMe) {
                localStorage.setItem('orca_remember_username', username.trim());
            } else {
                localStorage.removeItem('orca_remember_username');
            }
            const savedUserStr = sessionStorage.getItem('user');
            const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
            let finalUrl = returnUrl;
            if (finalUrl.startsWith('/admin') && savedUser?.role !== 'ADMIN') {
                finalUrl = '/dashboard';
            }
            navigate(finalUrl);
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosErr = err as { response?: { data?: { error?: string, fields?: Record<string, string> } } };
                if (axiosErr.response?.data?.fields && Object.keys(axiosErr.response.data.fields).length > 0) {
                    const firstFieldErr = Object.values(axiosErr.response.data.fields)[0];
                    setError(firstFieldErr);
                } else {
                    setError(friendlyRegisterError(axiosErr.response?.data?.error));
                }
            } else {
                setError('Không thể kết nối đến server!');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="login-form">
            <AuthField
                id="register-username"
                label="Tài khoản"
                value={username}
                placeholder="Nhập tên đăng nhập"
                autoComplete="username"
                icon={ICON_USER}
                onChange={setUsername}
            />

            <AuthField
                id="register-password"
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="Ít nhất 6 ký tự"
                autoComplete="new-password"
                icon={ICON_LOCK}
                rightSlot={
                    <AuthPasswordToggle
                        visible={showPassword}
                        onToggle={() => setShowPassword(prev => !prev)}
                        label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    />
                }
                onChange={setPassword}
            />

            <AuthField
                id="register-confirm-password"
                label="Xác nhận mật khẩu"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                placeholder="Nhập lại mật khẩu"
                autoComplete="new-password"
                icon={ICON_SHIELD}
                rightSlot={
                    <AuthPasswordToggle
                        visible={showConfirmPassword}
                        onToggle={() => setShowConfirmPassword(prev => !prev)}
                        label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                    />
                }
                onChange={setConfirmPassword}
            />

            <AuthRememberRow
                checked={rememberMe}
                onChange={setRememberMe}
            />

            {error && <AuthError message={error} />}

            <AuthSubmitButton
                id="register-submit"
                isLoading={isLoading}
                loadingText="Đang đăng ký..."
            >
                Đăng ký
            </AuthSubmitButton>
        </form>
    );
}
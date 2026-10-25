import { useState, type FormEvent } from 'react';
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

interface LoginFormProps {
    returnUrl: string;
}

export default function LoginForm({ returnUrl }: LoginFormProps) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username.trim() || !password.trim()) {
            setError('Vui lòng nhập đầy đủ thông tin!');
            return;
        }

        setIsLoading(true);
        try {
            await login({ username, password });
            if (rememberMe) {
                localStorage.setItem('orca_remember_username', username.trim());
                localStorage.setItem('orca_remember_password', password.trim());
            } else {
                localStorage.removeItem('orca_remember_username');
                localStorage.removeItem('orca_remember_password');
            }
            const savedUserStr = sessionStorage.getItem('user');
            const savedUser = savedUserStr ? JSON.parse(savedUserStr) : null;
            let finalUrl = returnUrl;
            if (finalUrl.startsWith('/admin') && savedUser?.role !== 'ADMIN') {
                finalUrl = '/dashboard';
            }

            navigate(finalUrl, { replace: true });
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosErr = err as { response?: { data?: { error?: string } } };
                setError(axiosErr.response?.data?.error || 'Đăng nhập thất bại!');
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
                id="login-username"
                label="Tài khoản"
                value={username}
                placeholder="Nhập tên đăng nhập"
                autoComplete="username"
                icon={ICON_USER}
                onChange={setUsername}
            />

            <AuthField
                id="login-password"
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                value={password}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
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

            <AuthRememberRow
                checked={rememberMe}
                onChange={setRememberMe}
            />

            {error && <AuthError message={error} />}

            <AuthSubmitButton
                id="login-submit"
                isLoading={isLoading}
                loadingText="Đang đăng nhập..."
            >
                Đăng nhập
            </AuthSubmitButton>
        </form>
    );
}
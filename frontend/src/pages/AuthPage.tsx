import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthHero from '../components/auth/AuthHero';
import LoginForm from '../components/auth/LoginForm';
import RegisterForm from '../components/auth/RegisterForm';
import {
    COFFEE_BRANDS,
    COFFEE_BRAND_LOGOS,
    HERO_STATS,
    HERO_DESCRIPTION,
    HERO_TITLE,
} from '../components/auth/authData';
import orcaLogo from '../assets/orca-logo.png';

export type AuthMode = 'login' | 'register';

function detectMode(pathname: string): AuthMode {
    return pathname.startsWith('/register') ? 'register' : 'login';
}

function GoogleButton({ label }: { label: string }) {
    return (
        <button
            id="google-login"
            className="login-btn-google"
            onClick={() => {
                window.location.href = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081'}/oauth2/authorization/google`;
            }}
        >
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {label}
        </button>
    );
}

export default function AuthPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const locationState = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
    const stateReturnUrl = locationState?.from
        ? `${locationState.from.pathname || ''}${locationState.from.search || ''}${locationState.from.hash || ''}`
        : '';
    const returnUrl = searchParams.get('returnUrl') || stateReturnUrl || '/dashboard';

    const [mode, setMode] = useState<AuthMode>(() => detectMode(location.pathname));
    const isFirstRender = useRef(true);

    useEffect(() => {
        const detected = detectMode(location.pathname);
        if (detected !== mode) {
            if (isFirstRender.current) {
                isFirstRender.current = false;
                setMode(detected);
            } else {
                setMode(detected);
            }
        }
    }, [location.pathname, mode]);

    const switchMode = useCallback(
        (next: AuthMode) => {
            if (next === mode) return;
            setMode(next);
            const targetPath = next === 'login' ? '/login' : '/register';
            const targetSearch = returnUrl !== '/dashboard' ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
            navigate(`${targetPath}${targetSearch}`, { replace: true });
        },
        [mode, navigate, returnUrl]
    );

    const loginUrl = useMemo(
        () => `/login${returnUrl !== '/dashboard' ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`,
        [returnUrl]
    );
    const registerUrl = useMemo(
        () => `/register${returnUrl !== '/dashboard' ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}`,
        [returnUrl]
    );

    const isLogin = mode === 'login';

    return (
        <div className="login-split">
            <AuthHero
                brands={COFFEE_BRANDS}
                brandLogos={COFFEE_BRAND_LOGOS}
                stats={HERO_STATS}
                title={HERO_TITLE}
                description={HERO_DESCRIPTION}
            />

            <div className="login-form-side">
                <div className={`login-form-container ${isLogin ? '' : 'login-form-container--compact'}`}>
                    <div className="login-form-header">
                        <div className="login-logo-row">
                            <img src={orcaLogo} alt="ORCA" className="login-brand-full-logo" />
                        </div>

                        <div className="auth-tab-bar" role="tablist">
                            <button
                                type="button"
                                className={`auth-tab ${isLogin ? 'auth-tab--active' : ''}`}
                                role="tab"
                                aria-selected={isLogin}
                                onClick={() => switchMode('login')}
                            >
                                Đăng nhập
                            </button>
                            <button
                                type="button"
                                className={`auth-tab ${!isLogin ? 'auth-tab--active' : ''}`}
                                role="tab"
                                aria-selected={!isLogin}
                                onClick={() => switchMode('register')}
                            >
                                Đăng ký
                            </button>
                        </div>

                        <h2 className="login-form-title">
                            {isLogin ? 'Chào mừng trở lại!' : 'Tạo tài khoản mới'}
                        </h2>
                        <p className="login-form-subtitle">
                            {isLogin
                                ? 'Đăng nhập để quản lý xưởng cà phê của bạn'
                                : 'Đăng ký để bắt đầu quản lý xưởng cà phê của bạn'}
                        </p>
                    </div>

                    {isLogin ? <LoginForm returnUrl={returnUrl} /> : <RegisterForm returnUrl={returnUrl} />}

                    <div className="login-divider"><span>hoặc</span></div>

                    <GoogleButton label={isLogin ? 'Đăng nhập bằng Google' : 'Đăng ký bằng Google'} />

                    <div className="login-footer">
                        <p>
                            {isLogin ? (
                                <>Chưa có tài khoản? <Link to={registerUrl} className="login-link">Đăng ký ngay</Link></>
                            ) : (
                                <>Đã có tài khoản? <Link to={loginUrl} className="login-link">Đăng nhập</Link></>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
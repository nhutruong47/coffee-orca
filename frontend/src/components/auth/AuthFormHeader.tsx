import orcaLogo from '../../assets/orca-logo.png';

interface AuthFormHeaderProps {
    activeTab: 'login' | 'register';
    loginUrl: string;
    registerUrl: string;
    title: string;
    subtitle: string;
}

export default function AuthFormHeader({
    activeTab,
    loginUrl,
    registerUrl,
    title,
    subtitle,
}: AuthFormHeaderProps) {
    return (
        <div className="login-form-header">
            <div className="login-logo-row">
                <img src={orcaLogo} alt="ORCA" className="login-brand-full-logo" />
            </div>

            <div className="auth-tab-bar" role="tablist">
                {activeTab === 'login' ? (
                    <>
                        <span className="auth-tab auth-tab--active" role="tab" aria-selected="true">
                            Đăng nhập
                        </span>
                        <a className="auth-tab" role="tab" aria-selected="false" href={registerUrl}>
                            Đăng ký
                        </a>
                    </>
                ) : (
                    <>
                        <a className="auth-tab" role="tab" aria-selected="false" href={loginUrl}>
                            Đăng nhập
                        </a>
                        <span className="auth-tab auth-tab--active" role="tab" aria-selected="true">
                            Đăng ký
                        </span>
                    </>
                )}
            </div>

            <h2 className="login-form-title">{title}</h2>
            <p className="login-form-subtitle">{subtitle}</p>
        </div>
    );
}
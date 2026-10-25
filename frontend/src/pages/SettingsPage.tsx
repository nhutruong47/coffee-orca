import { useTheme, type ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import './SettingsPage.css';

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string; icon: string }[] = [
    { value: 'light', label: 'Sáng', description: 'Giao diện sáng, phù hợp ban ngày', icon: 'sunny-outline' },
    { value: 'dark', label: 'Tối', description: 'Giao diện tối, dễ chịu cho mắt', icon: 'moon-outline' },
    { value: 'system', label: 'Theo hệ thống', description: 'Tự động theo cài đặt thiết bị', icon: 'desktop-outline' },
];

export default function SettingsPage() {
    const { theme, resolvedTheme, setTheme } = useTheme();
    const { user } = useAuth();
    const displayName = user?.fullName || user?.username || 'ORCA Roaster';
    const displayEmail = user?.email || (user?.username ? `${user.username}@orca-roastery.vn` : 'member@orca-roastery.vn');
    const displayRole = user?.role === 'ADMIN' ? 'Master Roaster' : 'Roastery Member';

    return (
        <div className="settings-page">
            <section className="settings-hero">
                <span>Settings</span>
                <h1>Quản lý tài khoản</h1>
                <p>Cá nhân hóa trải nghiệm rang xay và quản lý các thiết lập bảo mật cho tài khoản ORCA của bạn.</p>
            </section>

            <div className="settings-account-layout">
                <section className="settings-profile-card">
                    <div className="settings-card-top">
                        <span className="settings-pill">Thông tin cá nhân</span>
                        <button type="button">
                            <span className="material-symbols-outlined">edit</span>
                            Chỉnh sửa
                        </button>
                    </div>
                    <h2>Thông tin cơ bản</h2>
                    <div className="settings-info-grid">
                        <div>
                            <span>Họ và tên</span>
                            <strong>{displayName}</strong>
                        </div>
                        <div>
                            <span>Email đăng ký</span>
                            <strong>{displayEmail}</strong>
                        </div>
                        <div>
                            <span>Số điện thoại</span>
                            <strong>+84 902 123 456</strong>
                        </div>
                        <div>
                            <span>Vai trò</span>
                            <strong className="settings-dot-role">{displayRole}</strong>
                        </div>
                    </div>
                    <div className="settings-verification">
                        <img src="/coffee-hero.png" alt="Roastery verification" />
                        <div>
                            <h3>Xác thực Roastery</h3>
                            <p>Chứng chỉ chuyên gia đã được xác minh vào tháng 12, 2025.</p>
                        </div>
                    </div>
                </section>

                <aside className="settings-side-stack">
                    <section className="settings-security-card">
                        <div className="settings-side-head">
                            <h2>Bảo mật</h2>
                            <span className="material-symbols-outlined">shield</span>
                        </div>
                        <button type="button" className="settings-security-row">
                            <span className="material-symbols-outlined">key</span>
                            <span>
                                <strong>Mật khẩu</strong>
                                <small>Cập nhật 3 tháng trước</small>
                            </span>
                            <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                        <button type="button" className="settings-security-row">
                            <span className="material-symbols-outlined">phonelink_lock</span>
                            <span>
                                <strong>Xác thực 2 lớp (2FA)</strong>
                                <small>Đang bật</small>
                            </span>
                            <span className="material-symbols-outlined">chevron_right</span>
                        </button>
                        <button type="button" className="settings-outline-btn">Đăng xuất tất cả thiết bị</button>
                    </section>

                    <section className="settings-plan-card">
                        <span>Gói dịch vụ</span>
                        <h2>Roastery Enterprise</h2>
                        <div className="settings-plan-meter">
                            <div>
                                <span>Dung lượng hồ sơ rang</span>
                                <strong>85%</strong>
                            </div>
                            <progress value="85" max="100" />
                        </div>
                        <button type="button">Nâng cấp gói</button>
                    </section>
                </aside>
            </div>

            <section className="settings-device-card">
                <div>
                    <span className="settings-pill">Thiết bị</span>
                    <h2>Thiết bị đăng nhập</h2>
                </div>
                <div className="settings-device-list">
                    <article>
                        <span className="material-symbols-outlined">desktop_windows</span>
                        <div>
                            <strong>Windows Workstation</strong>
                            <small>Đang hoạt động · Việt Nam</small>
                        </div>
                    </article>
                    <article>
                        <span className="material-symbols-outlined">smartphone</span>
                        <div>
                            <strong>Mobile Roastery App</strong>
                            <small>Đăng nhập gần đây</small>
                        </div>
                    </article>
                </div>
            </section>

            <section className="settings-device-card settings-theme-card">
                <div>
                    <span className="settings-pill">Giao diện</span>
                    <h2>Chế độ hiển thị</h2>
                    <p>
                        {theme === 'system'
                            ? `Đang theo hệ thống (${resolvedTheme === 'dark' ? 'tối' : 'sáng'})`
                            : theme === 'dark'
                                ? 'Đang dùng giao diện tối'
                                : 'Đang dùng giao diện sáng'}
                    </p>
                </div>
                <div className="settings-theme-options" role="radiogroup" aria-label="Chế độ hiển thị">
                    {THEME_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={theme === opt.value}
                            className={`settings-theme-option ${theme === opt.value ? 'active' : ''}`}
                            onClick={() => setTheme(opt.value)}>
                            <ion-icon name={opt.icon} style={{ fontSize: '18px' }}></ion-icon>
                            <span>
                                <strong>{opt.label}</strong>
                                <small>{opt.description}</small>
                            </span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

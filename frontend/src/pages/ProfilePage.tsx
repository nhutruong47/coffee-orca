import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { gsap } from 'gsap';
import '../components/Profile.css';

export default function ProfilePage() {
    const { user, fetchUser } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        fullName: user?.fullName || '',
        email: user?.email || '',
        avatar: user?.avatar || ''
    });
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [passwordMode, setPasswordMode] = useState<'change' | 'reset' | null>(null);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        username: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Webcam states
    const [showWebcam, setShowWebcam] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const pageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (pageRef.current) {
            gsap.fromTo(
                gsap.utils.toArray('.gsap-reveal'),
                { y: 30, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'power3.out' }
            );
        }
    }, [isEditing]);

    const profileFields = [
        { icon: <ion-icon name="person-outline" style={{ fontSize: '16px' }}></ion-icon>, label: 'Tên đăng nhập', value: user?.username || '—' },
        { icon: <ion-icon name="document-text-outline" style={{ fontSize: '16px' }}></ion-icon>, label: 'Họ tên', value: user?.fullName || <button type="button" className="empty-state-btn" onClick={() => setIsEditing(true)}><ion-icon name="add-circle-outline"></ion-icon> Thêm Họ tên</button> },
        { icon: <ion-icon name="mail-outline" style={{ fontSize: '16px' }}></ion-icon>, label: 'Email', value: user?.email || <button type="button" className="empty-state-btn" onClick={() => setIsEditing(true)}><ion-icon name="add-circle-outline"></ion-icon> Thêm Email</button> },
        { icon: <ion-icon name="ribbon-outline" style={{ fontSize: '16px' }}></ion-icon>, label: 'Vai trò', value: user?.role === 'ADMIN' ? 'Admin Nền Tảng' : user?.role === 'FACTORY_OWNER' ? 'Chủ xưởng' : 'Thành viên' },
    ];

    const handleSave = async () => {
        if (!formData.fullName.trim()) {
            setFeedback({ type: 'error', message: 'Họ và tên không được để trống.' });
            return;
        }
        setSaving(true);
        setFeedback(null);
        try {
            const response = await authService.updateProfile(formData);
            sessionStorage.setItem('token', response.token);
            await fetchUser();
            setIsEditing(false);
            setFeedback({ type: 'success', message: 'Cập nhật hồ sơ thành công.' });
        } catch (error) {
            const message = (error as any)?.response?.data?.error || 'Có lỗi xảy ra khi cập nhật hồ sơ.';
            setFeedback({ type: 'error', message });
        } finally {
            setSaving(false);
        }
    };

    const closePasswordForm = () => {
        setPasswordMode(null);
        setPasswordForm({
            currentPassword: '',
            username: '',
            newPassword: '',
            confirmPassword: ''
        });
    };

    const handlePasswordSubmit = async () => {
        if (passwordForm.newPassword.length < 6) {
            setFeedback({ type: 'error', message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setFeedback({ type: 'error', message: 'Mật khẩu nhập lại không khớp.' });
            return;
        }

        setPasswordSaving(true);
        setFeedback(null);
        try {
            if (passwordMode === 'change') {
                await authService.changePassword({
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword
                });
                setFeedback({ type: 'success', message: 'Đổi mật khẩu thành công.' });
            } else {
                await authService.resetPassword({
                    username: passwordForm.username,
                    newPassword: passwordForm.newPassword
                });
                setFeedback({ type: 'success', message: 'Đặt lại mật khẩu thành công.' });
            }
            closePasswordForm();
        } catch (error) {
            const message = (error as any)?.response?.data?.error || 'Không thể cập nhật mật khẩu.';
            setFeedback({ type: 'error', message });
        } finally {
            setPasswordSaving(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setUploadingAvatar(true);
            try {
                const res = await authService.uploadFile(e.target.files[0]);
                const updatedFormData = { ...formData, avatar: res.url };
                setFormData(updatedFormData);
                const profileRes = await authService.updateProfile(updatedFormData);
                sessionStorage.setItem('token', profileRes.token);
                await fetchUser();
            } catch (error) {
                alert('Có lỗi khi upload ảnh');
            } finally {
                setUploadingAvatar(false);
            }
        }
    };

    const startWebcam = async () => {
        setShowWebcam(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            alert("Không thể truy cập camera. Vui lòng cấp quyền.");
            setShowWebcam(false);
        }
    };

    const stopWebcam = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setShowWebcam(false);
    };

    const capturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(async (blob) => {
                    if (blob) {
                        stopWebcam();
                        setUploadingAvatar(true);
                        try {
                            const file = new File([blob], `webcam-${Date.now()}.png`, { type: 'image/png' });
                            const res = await authService.uploadFile(file);
                            const updatedFormData = { ...formData, avatar: res.url };
                            setFormData(updatedFormData);
                            const profileRes = await authService.updateProfile(updatedFormData);
                            sessionStorage.setItem('token', profileRes.token);
                            await fetchUser();
                        } catch (error) {
                            alert('Có lỗi khi upload ảnh từ camera');
                        } finally {
                            setUploadingAvatar(false);
                        }
                    }
                }, 'image/png');
            }
        }
    };

    useEffect(() => {
        if (!user) return;
        setFormData({
            fullName: user.fullName || '',
            email: user.email || '',
            avatar: user.avatar || ''
        });
        setPasswordForm(current => ({ ...current, username: user.username || '' }));
    }, [user]);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return (
        <div className="profile-page fade-in" ref={pageRef}>
            {feedback && (
                <div className={`profile-feedback ${feedback.type}`} role="status">
                    <ion-icon name={feedback.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline'}></ion-icon>
                    <span>{feedback.message}</span>
                    <button type="button" onClick={() => setFeedback(null)} aria-label="Đóng thông báo">
                        <ion-icon name="close-outline"></ion-icon>
                    </button>
                </div>
            )}
            <div className="profile-header-card gsap-reveal">
                <div className="profile-header-info">
                    <div className="profile-avatar-large" style={formData.avatar || user?.avatar ? { backgroundImage: `url(${formData.avatar || user?.avatar})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' } : {}}>
                        {!(formData.avatar || user?.avatar) && user?.username.charAt(0).toUpperCase()}

                        <div className="avatar-edit-overlay">
                            <label className="avatar-edit-btn" title="Tải ảnh lên">
                                <ion-icon name="cloud-upload-outline"></ion-icon>
                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                            </label>
                            <button className="avatar-edit-btn" title="Chụp từ Camera" onClick={startWebcam}>
                                <ion-icon name="camera-outline"></ion-icon>
                            </button>
                        </div>
                        {uploadingAvatar && <div className="avatar-uploading-spinner"><ion-icon name="sync-outline" className="spin"></ion-icon></div>}
                    </div>

                    <div className="profile-name-block">
                        <h1 className="profile-name">{formData.fullName || user?.fullName || user?.username}</h1>
                        <span className="role-badge large member"><ion-icon name="person-outline" style={{ fontSize: '14px' }}></ion-icon> Thành viên</span>
                    </div>
                </div>

                <button
                    className={isEditing ? "primary-button pulse" : "secondary-button"}
                    style={{ padding: '10px 20px', borderRadius: 20 }}
                    onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                    disabled={saving}
                >
                    {saving ? (
                        <><ion-icon name="sync-outline" className="spin"></ion-icon> Đang lưu...</>
                    ) : (
                        isEditing ? <><ion-icon name="checkmark-outline"></ion-icon> Lưu thay đổi</> : <><ion-icon name="create-outline"></ion-icon> Chỉnh sửa hồ sơ</>
                    )}
                </button>
            </div>

            {showWebcam && (
                <div className="webcam-modal-backdrop">
                    <div className="webcam-modal glass-panel">
                        <div className="webcam-header">
                            <h3>Chụp ảnh đại diện</h3>
                            <button onClick={stopWebcam} className="close-btn"><ion-icon name="close-outline"></ion-icon></button>
                        </div>
                        <div className="webcam-body">
                            <video ref={videoRef} autoPlay playsInline className="webcam-video" />
                        </div>
                        <div className="webcam-footer">
                            <button className="primary-button capture-btn" onClick={capturePhoto}>
                                <ion-icon name="aperture-outline"></ion-icon> Chụp ngay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="profile-section glass-panel gsap-reveal">
                <h2 className="section-title text-glow-active" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="icon-container glow" style={{ width: 32, height: 32, fontSize: 18 }}><ion-icon name="clipboard-outline"></ion-icon></span> Thông tin cá nhân
                    </div>
                </h2>

                {isEditing ? (
                    <div className="profile-edit-grid">
                        <div className="premium-input-group">
                            <input
                                type="text"
                                className="premium-input"
                                value={formData.fullName}
                                onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                                required
                            />
                            <label className="premium-label">Họ và tên</label>
                            <span className="premium-input-icon"><ion-icon name="person-outline"></ion-icon></span>
                        </div>
                        <div className="premium-input-group">
                            <input
                                type="email"
                                className="premium-input"
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                required
                            />
                            <label className="premium-label">Email liên hệ</label>
                            <span className="premium-input-icon"><ion-icon name="mail-outline"></ion-icon></span>
                        </div>
                    </div>
                ) : (
                    <div className="profile-fields">
                        {profileFields.map((field, index) => (
                            <div key={index} className="profile-field">
                                <div className="field-icon">{field.icon}</div>
                                <div className="field-content">
                                    <span className="field-label">{field.label}</span>
                                    <span className="field-value">{field.value}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="profile-section glass-panel gsap-reveal">
                <h2 className="section-title text-glow-active" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="icon-container glow" style={{ width: 32, height: 32, fontSize: 18 }}><ion-icon name="lock-closed-outline"></ion-icon></span> Bảo mật tài khoản
                </h2>
                <div className="security-info">
                    <div className="security-item">
                        <span className="security-icon"><ion-icon name="shield-checkmark-outline" style={{ fontSize: '16px' }}></ion-icon></span>
                        <div>
                            <span className="security-label">Mật khẩu</span>
                            <span className="security-value">Được bảo vệ bằng mã hóa chuẩn công nghiệp BCrypt</span>
                        </div>
                    </div>
                    <div className="security-item">
                        <span className="security-icon"><ion-icon name="finger-print-outline" style={{ fontSize: '16px' }}></ion-icon></span>
                        <div>
                            <span className="security-label">Phiên đăng nhập</span>
                            <span className="security-value">Xác thực bằng thẻ JWT bảo mật cao</span>
                        </div>
                    </div>
                </div>

                <div className="profile-security-actions">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                            setPasswordMode('change');
                            setFeedback(null);
                        }}
                    >
                        <ion-icon name="key-outline"></ion-icon>
                        Đổi mật khẩu
                    </button>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                            setPasswordMode('reset');
                            setPasswordForm(current => ({ ...current, username: user?.username || '' }));
                            setFeedback(null);
                        }}
                    >
                        <ion-icon name="refresh-outline"></ion-icon>
                        Đặt lại mật khẩu
                    </button>
                </div>

                {passwordMode && (
                    <div className="profile-password-panel">
                        <div className="profile-password-heading">
                            <div>
                                <h3>{passwordMode === 'change' ? 'Đổi mật khẩu' : 'Đặt lại mật khẩu'}</h3>
                                <p>
                                    {passwordMode === 'change'
                                        ? 'Nhập mật khẩu hiện tại để xác nhận thay đổi.'
                                        : 'Xác nhận tên đăng nhập của tài khoản đang đăng nhập.'}
                                </p>
                            </div>
                            <button type="button" className="profile-password-close" onClick={closePasswordForm}>
                                <ion-icon name="close-outline"></ion-icon>
                            </button>
                        </div>

                        <div className="profile-password-grid">
                            {passwordMode === 'change' ? (
                                <label>
                                    <span>Mật khẩu hiện tại</span>
                                    <input
                                        type="password"
                                        value={passwordForm.currentPassword}
                                        onChange={event => setPasswordForm(current => ({ ...current, currentPassword: event.target.value }))}
                                        autoComplete="current-password"
                                    />
                                </label>
                            ) : (
                                <label>
                                    <span>Xác nhận tên đăng nhập</span>
                                    <input
                                        type="text"
                                        value={passwordForm.username}
                                        onChange={event => setPasswordForm(current => ({ ...current, username: event.target.value }))}
                                        autoComplete="username"
                                    />
                                </label>
                            )}
                            <label>
                                <span>Mật khẩu mới</span>
                                <input
                                    type="password"
                                    value={passwordForm.newPassword}
                                    onChange={event => setPasswordForm(current => ({ ...current, newPassword: event.target.value }))}
                                    autoComplete="new-password"
                                />
                            </label>
                            <label>
                                <span>Nhập lại mật khẩu mới</span>
                                <input
                                    type="password"
                                    value={passwordForm.confirmPassword}
                                    onChange={event => setPasswordForm(current => ({ ...current, confirmPassword: event.target.value }))}
                                    autoComplete="new-password"
                                />
                            </label>
                        </div>

                        <div className="profile-password-actions">
                            <button type="button" className="btn-secondary" onClick={closePasswordForm}>
                                Hủy
                            </button>
                            <button type="button" className="btn-primary" onClick={handlePasswordSubmit} disabled={passwordSaving}>
                                {passwordSaving ? 'Đang cập nhật...' : 'Xác nhận'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

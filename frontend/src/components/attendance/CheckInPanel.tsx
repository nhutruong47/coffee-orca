import { useEffect, useRef, useState } from 'react';
import { attendanceService, type AttendanceDTO, type AttendanceSettingsDTO, type ProductionStage, type ShiftType } from '../../services/attendanceService';
import { apiError, locationLabel, resolveRegion, vietnamClock } from '../../utils/attendance';
import PhotoCapture from './PhotoCapture';
import './Attendance.css';
interface Props { teamId: string; orderId?: string; onChanged?: () => void }
export default function CheckInPanel({ teamId, orderId, onChanged }: Props) {
    const [settings, setSettings] = useState<AttendanceSettingsDTO | null>(null);
    const [attendance, setAttendance] = useState<AttendanceDTO | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [revision, setRevision] = useState(0);
    const [shift, setShift] = useState<ShiftType>('NGAY');
    const [stage, setStage] = useState<ProductionStage>('RANG');
    const [position, setPosition] = useState<{ latitude: number; longitude: number; accuracyMeters: number } | null>(null);
    const [locationReason, setLocationReason] = useState('Chưa cung cấp GPS');
    const [locating, setLocating] = useState(false);
    const [photo, setPhoto] = useState('');
    const [address, setAddress] = useState('');
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const getLocation = () => {
        setPosition(null); setAddress('');
        if (!navigator.geolocation) { setLocationReason('Thiết bị không hỗ trợ GPS'); return; }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(result => {
            if (!mounted.current) return;
            const { latitude, longitude, accuracy } = result.coords;
            setPosition({ latitude, longitude, accuracyMeters: accuracy });
            setLocationReason(''); setLocating(false);
            void resolveRegion(latitude, longitude).then(region => { if (mounted.current && region) setAddress(region); });
        }, err => {
            if (!mounted.current) return;
            setLocationReason(err.code === 1 ? 'Bạn đã từ chối quyền vị trí' : err.code === 3 ? 'Hết thời gian lấy GPS' : 'Không lấy được vị trí GPS');
            setLocating(false);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    };
    useEffect(() => {
        let active = true;
        setLoading(true); setSettings(null); setError('');
        Promise.all([attendanceService.getSettings(teamId), attendanceService.getTodayAttendance(teamId)]).then(([config, record]) => {
            if (active) { setSettings(config); setAttendance(record); }
        }).catch(err => { if (active) setError(apiError(err, 'Không tải được ca làm việc.')); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [teamId, revision]);
    const activeShift = Boolean(attendance?.checkInTime && !attendance?.checkOutTime);
    const distance = position && settings?.workshopLat != null && settings.workshopLng != null ? Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.sin((position.latitude - settings.workshopLat) * Math.PI / 360) ** 2 + Math.cos(settings.workshopLat * Math.PI / 180) * Math.cos(position.latitude * Math.PI / 180) * Math.sin((position.longitude - settings.workshopLng) * Math.PI / 360) ** 2))) : null;
    const status = !position ? 'UNVERIFIED' : distance == null ? 'NOT_CONFIGURED' : position.accuracyMeters > (settings?.allowedRadiusMeters || 200) ? 'LOW_ACCURACY' : distance + position.accuracyMeters <= (settings?.allowedRadiusMeters || 200) ? 'WITHIN_RADIUS' : distance - position.accuracyMeters > (settings?.allowedRadiusMeters || 200) ? 'OUTSIDE_RADIUS' : 'LOW_ACCURACY';
    const submit = async () => {
        setSaving(true); setError(''); setSuccess('');
        try {
            const evidence = { ...(position || { locationUnavailableReason: locationReason }), ...(photo ? { photoDataUrl: photo } : {}), ...(address.trim() ? { address: address.trim() } : {}) };
            const result = activeShift ? await attendanceService.checkOut(teamId, evidence) : await attendanceService.checkIn(teamId, { shiftType: shift, stage, ...(orderId ? { orderId } : {}), ...evidence });
            setAttendance(result); setPhoto(''); setPosition(null); setLocationReason('Chưa cung cấp GPS'); setAddress(''); setSuccess(activeShift ? 'Đã tan ca. Giờ công do máy chủ tính.' : 'Đã vào ca.'); onChanged?.();
        } catch (err) { setError(apiError(err, 'Không ghi được chấm công. Vui lòng thử lại.')); }
        finally { setSaving(false); }
    };
    return <section className="check-in" aria-label="Chấm công cá nhân"><h2>Ca làm của bạn</h2>
        {loading && <p role="status">Đang tải ca làm…</p>}
        {error && <div role="alert">{error} {!settings && <button onClick={() => setRevision(x => x + 1)}>Thử lại</button>}</div>}
        {!loading && settings && <>
            {attendance && <p>{attendance.date} · Vào {vietnamClock(attendance.checkInTime)} · {activeShift ? 'Đang làm — chưa tính lương' : `Tan ${vietnamClock(attendance.checkOutTime)}`}</p>}
            <p>Giờ xưởng {settings.workStartTime} – {settings.workEndTime} · Nghỉ {settings.breakMinutes} phút</p>
            {!activeShift && <div className="attendance-fields"><label>Ca<select value={shift} onChange={e => setShift(e.target.value as ShiftType)}><option value="NGAY">Cả ngày</option><option value="SANG">Sáng</option><option value="CHIEU">Chiều</option><option value="DEM">Đêm</option></select></label><label>Công đoạn<select value={stage} onChange={e => setStage(e.target.value as ProductionStage)}><option value="RANG">Rang</option><option value="QA">Kiểm tra chất lượng</option><option value="XAY">Xay</option><option value="DONG_GOI">Đóng gói</option><option value="RANH_VA_CHON">Rây và chọn</option></select></label></div>}
            <button type="button" disabled={locating || saving} onClick={getLocation}>{locating ? 'Đang lấy GPS…' : 'Lấy vị trí GPS'}</button>
            {position ? <p>GPS thiết bị: {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)} · Sai số ±{Math.round(position.accuracyMeters)} m{distance != null && ` · Cách xưởng ${distance} m`} · {locationLabel(status)}{address && ` · Vùng nhận diện: ${address}`}</p> : <p>Chưa xác minh vị trí · {locationReason}</p>}
            <label>Vùng / địa chỉ đang ở (nhận diện từ GPS hoặc tự nhập)<input value={address} maxLength={500} onChange={e => setAddress(e.target.value)} /></label>
            <PhotoCapture key={attendance?.id || 'new'} value={photo} onChange={setPhoto} disabled={saving} />
            {!photo && <p>Không có ảnh — chưa có bằng chứng ảnh.</p>}
            {settings.requirePhoto && <p>Bắt buộc ảnh thật để chấm công.</p>}
            {settings.requireLocation && <p>Bắt buộc vị trí GPS trong bán kính xưởng ({settings.allowedRadiusMeters} m).</p>}
            <button className="attendance-primary" onClick={() => void submit()} disabled={saving || locating || (settings.requireLocation && status !== 'WITHIN_RADIUS') || (settings.requirePhoto && !photo)}>{saving ? 'Đang lưu…' : activeShift ? 'Tan ca' : 'Vào ca'}</button>
            {success && <p role="status">{success}</p>}
        </>}
    </section>;
}

import { useEffect, useState } from 'react';
import { attendanceService, type AttendanceSettingsDTO } from '../../services/attendanceService';
import { apiError } from '../../utils/attendance';
export default function AttendanceSettings({ teamId }: { teamId: string }) {
    const [draft, setDraft] = useState<AttendanceSettingsDTO | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let active = true; setError(''); setDraft(null);
        attendanceService.getSettings(teamId).then(config => { if (active) setDraft(config); }).catch(err => { if (active) setError(apiError(err, 'Không tải được cài đặt.')); });
        return () => { active = false; };
    }, [teamId, revision]);
    const save = async () => {
        if (!draft) return;
        setError(''); setSaved(false);
        if ((draft.workshopLat == null) !== (draft.workshopLng == null) || (draft.requireLocation && draft.workshopLat == null)) { setError('Nhập cả vĩ độ và kinh độ xưởng trước khi bắt buộc GPS.'); return; }
        setSaving(true);
        try { setDraft(await attendanceService.updateSettings(teamId, draft)); setSaved(true); }
        catch (err) { setError(apiError(err, 'Không lưu được cài đặt.')); }
        finally { setSaving(false); }
    };
    const numericFields: { key: 'standardHours' | 'breakMinutes' | 'hourlyRateVnd' | 'overtimeMultiplier' | 'allowedRadiusMeters'; label: string; min: number; max: number; step: number }[] = [
        { key: 'standardHours', label: 'Giờ thường tối đa mỗi ca', min: 0.01, max: 12, step: 0.01 },
        { key: 'breakMinutes', label: 'Nghỉ giữa ca (phút)', min: 0, max: 240, step: 1 },
        { key: 'hourlyRateVnd', label: 'Đơn giá mặc định (đ/giờ)', min: 1000, max: 10000000, step: 1 },
        { key: 'overtimeMultiplier', label: 'Hệ số tăng ca', min: 1.5, max: 4, step: 0.1 },
        { key: 'allowedRadiusMeters', label: 'Bán kính GPS cho phép (m)', min: 25, max: 5000, step: 1 },
    ];
    return <>{error && <p role="alert">{error} {!draft && <button onClick={() => setRevision(x => x + 1)}>Thử lại</button>}</p>}{!draft ? !error && <p role="status">Đang tải cài đặt…</p> : <form className="attendance-settings" onSubmit={e => { e.preventDefault(); void save(); }}><h2>Cài đặt chấm công</h2><p>Áp dụng cho ca mới. Ca cũ giữ nguyên đơn giá, hệ số, giờ chuẩn và giờ nghỉ đã chốt. Giờ ra ≤ giờ vào được hiểu là ca qua đêm.</p>
        <label>Giờ vào ca<input required type="time" value={draft.workStartTime} onChange={e => setDraft({ ...draft, workStartTime: e.target.value })} /></label><label>Giờ tan ca<input required type="time" value={draft.workEndTime} onChange={e => setDraft({ ...draft, workEndTime: e.target.value })} /></label>
        {numericFields.map(field => <label key={field.key}>{field.label}<input type="number" required min={field.min} max={field.max} step={field.step} value={draft[field.key]} onChange={e => setDraft({ ...draft, [field.key]: Number(e.target.value) })} /></label>)}
        <label>Địa chỉ xưởng (mô tả, không thay thế GPS)<input maxLength={500} value={draft.workshopAddress || ''} onChange={e => setDraft({ ...draft, workshopAddress: e.target.value || null })} /></label>
        <label>Vĩ độ xưởng<input type="number" min={-90} max={90} step="any" value={draft.workshopLat ?? ''} onChange={e => setDraft({ ...draft, workshopLat: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label>Kinh độ xưởng<input type="number" min={-180} max={180} step="any" value={draft.workshopLng ?? ''} onChange={e => setDraft({ ...draft, workshopLng: e.target.value === '' ? null : Number(e.target.value) })} /></label>
        <label className="attendance-checkbox"><input type="checkbox" checked={draft.requireLocation} onChange={e => setDraft({ ...draft, requireLocation: e.target.checked })} />Bắt buộc GPS trong bán kính</label><label className="attendance-checkbox"><input type="checkbox" checked={draft.requirePhoto} onChange={e => setDraft({ ...draft, requirePhoto: e.target.checked })} />Bắt buộc ảnh thật</label>
        <p>GPS do thiết bị cung cấp, không chứng minh danh tính hoặc chống giả mạo. Khi không bắt buộc, thiếu bằng chứng luôn được ghi là chưa xác minh.</p><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu cài đặt'}</button>{saved && <p role="status">Đã lưu cài đặt.</p>}
    </form>}</>;
}

import { useEffect, useState } from 'react';
import { attendanceService, type AttendanceDTO, type AttendanceCorrectionDTO } from '../../services/attendanceService';
import { apiError, vietnamDate, vietnamClock } from '../../utils/attendance';
import AttendanceEvidence from './AttendanceEvidence';
interface Props { teamId: string; admin: boolean; initialDate?: string }
export default function AttendanceHistory({ teamId, admin, initialDate }: Props) {
    const [date, setDate] = useState(initialDate || vietnamDate());
    const [rows, setRows] = useState<AttendanceDTO[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let active = true; setLoading(true); setRows([]); setError('');
        (admin ? attendanceService.getTeamDaily(teamId, date) : attendanceService.getHistory(teamId)).then(data => { if (active) setRows(data); }).catch(err => { if (active) setError(apiError(err, 'Không tải được lịch sử chấm công.')); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [teamId, date, admin, revision]);
    return <section aria-label={admin ? 'Chấm công xưởng' : 'Lịch sử cá nhân'}><h2>{admin ? 'Chấm công xưởng' : 'Lịch sử cá nhân'}</h2>{admin && <label>Ngày (Việt Nam) <input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>}
        <button onClick={() => setRevision(x => x + 1)}>Làm mới lịch sử</button>
        {error && <p role="alert">{error} <button onClick={() => setRevision(x => x + 1)}>Thử lại</button></p>}{loading && <p role="status">Đang tải chấm công…</p>}
        {!loading && !error && rows.length === 0 && <p>Chưa có dữ liệu chấm công.</p>}
        {rows.map(row => <article className="attendance-card" key={row.id}><h3>{admin ? row.userName : 'Ca làm'} · {row.date}</h3><p>Vào {vietnamClock(row.checkInTime)} – Tan {vietnamClock(row.checkOutTime)}</p><p>{row.checkOutTime ? `Giờ thường ${row.regularHours ?? 0} · Tăng ca ${row.overtimeHours ?? 0}` : 'Ca chưa tan — chưa tính giờ và lương'}</p><h4>Bằng chứng vào ca</h4><AttendanceEvidence attendance={row} />{row.checkOutTime && <><h4>Bằng chứng tan ca</h4><AttendanceEvidence attendance={row} checkout /></>}<Correction row={row} admin={admin} onSaved={() => setRevision(x => x + 1)} /></article>)}
    </section>;
}
function Correction({ row, admin, onSaved }: { row: AttendanceDTO; admin: boolean; onSaved: () => void }) {
    const [open, setOpen] = useState(false);
    const [start, setStart] = useState(row.checkInTime?.slice(0, 16) || '');
    const [end, setEnd] = useState(row.checkOutTime?.slice(0, 16) || '');
    const [reason, setReason] = useState('');
    const [log, setLog] = useState<AttendanceCorrectionDTO[]>([]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!open) return;
        let active = true;
        attendanceService.getCorrections(row.id).then(data => { if (active) setLog(data); }).catch(err => { if (active) setError(apiError(err, 'Không tải được lịch sử sửa công.')); });
        return () => { active = false; };
    }, [open, row.id]);
    const save = async () => {
        setSaving(true); setError('');
        try { await attendanceService.updateAttendance(row.id, { checkInTime: start, checkOutTime: end, reason: reason.trim() }); setOpen(false); onSaved(); }
        catch (err) { setError(apiError(err, 'Không lưu được sửa công.')); }
        finally { setSaving(false); }
    };
    return <div><button onClick={() => setOpen(!open)} aria-expanded={open}>{admin ? 'Sửa công' : 'Lịch sử sửa công'}</button>{open && <>{admin && <form className="attendance-correction" onSubmit={e => { e.preventDefault(); void save(); }}><p>Giờ Việt Nam. Không thay đổi bằng chứng GPS/ảnh gốc.</p><label>Giờ vào (Việt Nam)<input type="datetime-local" value={start} required onChange={e => setStart(e.target.value)} /></label><label>Giờ ra (Việt Nam)<input type="datetime-local" value={end} required onChange={e => setEnd(e.target.value)} /></label><label>Lý do sửa công<input value={reason} required minLength={5} maxLength={500} onChange={e => setReason(e.target.value)} /></label><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu sửa công'}</button></form>}{error && <p role="alert">{error}</p>}<h4>Lịch sử sửa công</h4>{log.length === 0 && !error && <p>Chưa có lần sửa công.</p>}{log.map(entry => <p key={entry.id}>{entry.actorName} · {entry.createdAt} · {entry.reason}<br />{entry.oldCheckInTime || '—'} – {entry.oldCheckOutTime || '—'} → {entry.newCheckInTime} – {entry.newCheckOutTime}</p>)}</>}</div>;
}

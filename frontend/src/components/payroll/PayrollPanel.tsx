import { Fragment, useEffect, useRef, useState } from 'react';
import { payrollService } from '../../services/groupService';
import type { PayrollItem, PayrollReport } from '../../types/types';
import AttendanceEvidence from '../attendance/AttendanceEvidence';
import { vietnamDate, vietnamClock, apiError } from '../../utils/attendance';
import './PayrollPanel.css';

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const hours = (value: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)} giờ`;
interface PayrollPanelProps {
    teamId: string;
    defaultOpen?: boolean;
    workshopName?: string;
    onEditAttendance?: (memberId: string, date?: string) => void;
    onOpenCheckInModal?: () => void;
}
export default function PayrollPanel({ teamId, defaultOpen = false, onEditAttendance }: PayrollPanelProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [month, setMonth] = useState(() => vietnamDate().slice(0, 7));
    const [report, setReport] = useState<PayrollReport | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    const request = useRef(0);
    useEffect(() => {
        if (!open) return;
        const current = ++request.current;
        let active = true;
        setReport(null); setError(''); setLoading(true);
        payrollService.getReport(teamId, month).then(data => {
            if (active && current === request.current) setReport(data);
        }).catch(err => {
            if (active) setError(apiError(err, 'Không tải được bảng lương.'));
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [teamId, month, open, revision]);
    const exportExcel = async () => {
        setExporting(true); setError('');
        try {
            const response = await payrollService.exportExcel(teamId, month);
            const url = URL.createObjectURL(response.data);
            const anchor = document.createElement('a');
            anchor.href = url; anchor.download = `bang-luong-${month}.xlsx`; anchor.click();
            URL.revokeObjectURL(url);
        } catch (err) { setError(apiError(err, 'Không xuất được Excel.')); }
        finally { setExporting(false); }
    };
    return <section className="payroll" aria-label="Bảng lương">
        <header className="payroll__header"><div><h2>Bảng lương</h2><p>Bản nháp · Chỉ tính ca đã tan ca. Chưa thực hiện thanh toán.</p></div>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Ẩn bảng' : 'Xem bảng'}</button></header>
        {open && <div className="payroll__body">
            <div className="payroll__toolbar"><label>Tháng cần xem <input aria-label="Tháng cần xem" type="month" min="1900-01" max="2200-12" value={month} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value); }} /></label>
                <button onClick={() => setRevision(x => x + 1)} disabled={loading}>Làm mới</button>
                <button onClick={() => void exportExcel()} disabled={!report || loading || exporting}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button></div>
            {error && <div role="alert" className="payroll__notice">{error} <button onClick={() => setRevision(x => x + 1)}>Thử lại</button></div>}
            {loading && <p role="status">Đang tải bảng lương…</p>}
            {!loading && report && <>
                {report.summary.missingCheckoutCount > 0 && <p className="payroll__notice">{report.summary.missingCheckoutCount} ca chưa tan ca — chưa tính giờ và lương.</p>}
                <div className="payroll__summary"><div><small>Ngày công</small><strong>{report.summary.attendanceDays}</strong></div><div><small>Giờ thường</small><strong>{hours(report.summary.regularHours)}</strong></div><div><small>Tăng ca</small><strong>{hours(report.summary.overtimeHours)}</strong></div><div><small>Tổng thực nhận dự kiến</small><strong>{money(report.summary.netPayVnd)}</strong></div></div>
                {report.items.length === 0 ? <p className="payroll__empty">Chưa có dữ liệu lương trong tháng này.</p> : <>
                    <div className="payroll__table-wrap"><table className="payroll__table"><thead><tr><th>Nhân viên</th><th>Ngày / giờ công</th><th>Lương thường</th><th>Tăng ca</th><th>Thực nhận dự kiến</th></tr></thead><tbody>
                        {report.items.map(item => <Fragment key={item.memberId}><tr><td><button className="payroll__employee" onClick={() => setExpanded(expanded === item.memberId ? null : item.memberId)} aria-expanded={expanded === item.memberId}>{item.memberName} {expanded === item.memberId ? '−' : '+'}</button></td><td>{item.attendanceDays} ngày · {hours(item.regularHours + item.overtimeHours)}</td><td>{money(item.regularPayVnd)}</td><td>{money(item.overtimePayVnd)}</td><td><strong>{money(item.netPayVnd)}</strong></td></tr>
                            {expanded === item.memberId && <tr><td colSpan={5}><EmployeeDetail teamId={teamId} item={item} onSaved={() => setRevision(x => x + 1)} onEditAttendance={onEditAttendance} /></td></tr>}</Fragment>)}
                    </tbody></table></div>
                    <div className="payroll__mobile-list" aria-label="Bảng lương dạng thẻ">{report.items.map(item => <article key={item.memberId} className="payroll__mobile-card"><button onClick={() => setExpanded(expanded === item.memberId ? null : item.memberId)} aria-expanded={expanded === item.memberId}>{item.memberName}</button><p>{item.attendanceDays} ngày · {hours(item.regularHours + item.overtimeHours)}</p><p>Lương thường: {money(item.regularPayVnd)}</p><p>Tăng ca: {money(item.overtimePayVnd)}</p><strong>Thực nhận dự kiến: {money(item.netPayVnd)}</strong>{expanded === item.memberId && <EmployeeDetail teamId={teamId} item={item} onSaved={() => setRevision(x => x + 1)} onEditAttendance={onEditAttendance} />}</article>)}</div>
                </>}
            </>}
        </div>}
    </section>;
}
interface DetailProps { teamId: string; item: PayrollItem; onSaved: () => void; onEditAttendance?: (memberId: string, date?: string) => void }
function EmployeeDetail({ teamId, item, onSaved, onEditAttendance }: DetailProps) {
    const [rate, setRate] = useState(item.hourlyRateVnd);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const saveRate = async () => {
        setSaving(true); setError('');
        try { await payrollService.updateMemberRate(teamId, item.memberId, { hourlyRateVnd: rate }); onSaved(); }
        catch (err) { setError(apiError(err, 'Không lưu được đơn giá.')); }
        finally { setSaving(false); }
    };
    return <div className="payroll__detail"><section><h3>Cách tính thực nhận</h3><p>Giờ thường: {hours(item.regularHours)} = {money(item.regularPayVnd)}</p><p>Tăng ca: {hours(item.overtimeHours)} = {money(item.overtimePayVnd)}</p><p>Đơn giá và hệ số được chốt riêng cho từng ca.</p><form onSubmit={e => { e.preventDefault(); void saveRate(); }}><label>Đơn giá cho ca mới (đ/giờ)<input type="number" min={1000} max={10000000} required value={rate} onChange={e => setRate(Number(e.target.value))} /></label><button disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu đơn giá'}</button></form>{error && <p role="alert">{error}</p>}</section>
        <section><h3>Chấm công từng ngày</h3>{item.attendanceLines.length === 0 && <p>Chưa có ca làm việc.</p>}{item.attendanceLines.map(line => <article className="payroll__line" key={line.id}><strong>{line.date} · {vietnamClock(line.checkInTime)} – {vietnamClock(line.checkOutTime)}</strong><p>{line.payable ? `${hours(line.workedHours)} · ${money(line.totalPayVnd)}` : 'Chưa tan ca — chưa tính lương'}</p><p>Thường {hours(line.regularHours)} × {money(line.hourlyRateVnd)}; tăng ca {hours(line.overtimeHours)} × {line.overtimeMultiplier}</p><AttendanceEvidence attendance={line} />{onEditAttendance && <button onClick={() => onEditAttendance(item.memberId, line.date)}>Sửa công ngày {line.date}</button>}</article>)}</section></div>;
}

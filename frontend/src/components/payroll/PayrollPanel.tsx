import { useCallback, useEffect, useMemo, useState } from 'react';
import { payrollService } from '../../services/groupService';
import type { PayrollItem, PayrollReport } from '../../types/types';
import './PayrollPanel.css';

const money = new Intl.NumberFormat('vi-VN');
const hours = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

function formatMoney(value: number) {
    return `${money.format(Math.round(value || 0))} đ`;
}

function formatHours(value: number) {
    return `${hours.format(Number(value) || 0)} giờ`;
}

function initials(name: string) {
    return name.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
}

function formatDate(value: string) {
    return new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN', {
        weekday: 'short', day: '2-digit', month: '2-digit',
    });
}

function formatClock(value?: string | null) {
    return value
        ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '—';
}

function errorMessage(error: unknown) {
    const candidate = error as { response?: { data?: { message?: string; detail?: string; error?: string } } };
    return candidate.response?.data?.message
        || candidate.response?.data?.detail
        || candidate.response?.data?.error
        || 'Không tải được dữ liệu chấm công và lương.';
}

interface PayrollPanelProps {
    teamId: string;
    onEditAttendance?: (memberId: string, date?: string) => void;
}

export default function PayrollPanel({ teamId, onEditAttendance }: PayrollPanelProps) {
    const [open, setOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [report, setReport] = useState<PayrollReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const load = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        setError('');
        try {
            setReport(await payrollService.getReport(teamId, selectedMonth));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [open, selectedMonth, teamId]);

    useEffect(() => { void load(); }, [load]);

    const monthOptions = useMemo(() => Array.from({ length: 18 }, (_, index) => {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - index);
        return {
            value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            label: `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`,
        };
    }), []);

    const changeMonth = (offset: number) => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const nextDate = new Date(year, month - 1 + offset, 1);
        const next = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
        if (monthOptions.some(option => option.value === next)) setSelectedMonth(next);
    };

    const exportExcel = async () => {
        setExporting(true);
        setError('');
        try {
            const response = await payrollService.exportExcel(teamId, selectedMonth);
            const url = URL.createObjectURL(new Blob([response.data]));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `cham-cong-luong-${selectedMonth}.xlsx`;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setExporting(false);
        }
    };

    const summary = report?.summary;

    return (
        <section className="payroll" aria-labelledby="payroll-title">
            <header className="payroll__header">
                <div className="payroll__heading">
                    <span className="payroll__heading-icon" aria-hidden="true"><ion-icon name="time-outline" /></span>
                    <div>
                        <h3 id="payroll-title">Chấm công &amp; tính lương</h3>
                        <p>Số tiền được tính trực tiếp từ giờ vào, giờ ra và cấu hình đã lưu của từng ca.</p>
                    </div>
                </div>
                <button className="payroll__collapse" type="button" onClick={() => setOpen(current => !current)} aria-expanded={open}>
                    {open ? 'Ẩn bảng' : 'Xem bảng'} <ion-icon name={open ? 'chevron-up-outline' : 'chevron-down-outline'} />
                </button>
            </header>

            {open && (
                <div className="payroll__body">
                    <div className="payroll__toolbar">
                        <div className="payroll__period">
                            <button type="button" onClick={() => changeMonth(-1)} aria-label="Tháng trước"><ion-icon name="chevron-back-outline" /></button>
                            <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} aria-label="Tháng cần xem">
                                {monthOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <button type="button" onClick={() => changeMonth(1)} aria-label="Tháng sau"><ion-icon name="chevron-forward-outline" /></button>
                        </div>
                        <div className="payroll__toolbar-actions">
                            <button type="button" onClick={() => onEditAttendance?.('')}>
                                <ion-icon name="settings-outline" /> Cài đặt &amp; sửa công
                            </button>
                            <button type="button" onClick={() => void load()} disabled={loading}>
                                <ion-icon name="refresh-outline" /> Làm mới
                            </button>
                            <button type="button" onClick={() => void exportExcel()} disabled={exporting || !report}>
                                <ion-icon name="download-outline" /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
                            </button>
                        </div>
                    </div>

                    {error && <div className="payroll__notice payroll__notice--error" role="alert"><ion-icon name="alert-circle-outline" /> {error}</div>}
                    {summary?.missingCheckoutCount ? (
                        <div className="payroll__notice payroll__notice--warning">
                            <ion-icon name="warning-outline" /> Có {summary.missingCheckoutCount} ca thiếu giờ ra nên chưa được tính lương.
                        </div>
                    ) : null}

                    {loading && !report ? (
                        <div className="payroll__loading"><span /><span /><span /></div>
                    ) : report && summary ? (
                        <>
                            <div className="payroll__summary">
                                <SummaryCard icon="people-outline" label="Nhân viên" value={money.format(summary.memberCount)} hint="Trong xưởng" tone="purple" />
                                <SummaryCard icon="time-outline" label="Giờ thường" value={formatHours(summary.regularHours)} hint={`${summary.attendanceDays} lượt chấm công`} tone="blue" />
                                <SummaryCard icon="flash-outline" label="Giờ tăng ca" value={formatHours(summary.overtimeHours)} hint="Tính sau giờ tan ca" tone="orange" />
                                <SummaryCard icon="cash-outline" label="Tổng quỹ lương" value={formatMoney(summary.netPayVnd)} hint="Giờ thường + tăng ca" tone="green" />
                            </div>

                            <div className="payroll__table-wrap">
                                <table className="payroll__table">
                                    <thead><tr><th>Nhân viên</th><th>Chấm công</th><th>Lương thường</th><th>Tăng ca</th><th>Thực nhận</th></tr></thead>
                                    <tbody>
                                        {report.items.map(item => (
                                            <EmployeeRows
                                                key={item.memberId}
                                                item={item}
                                                expanded={expandedId === item.memberId}
                                                onToggle={() => setExpandedId(current => current === item.memberId ? null : item.memberId)}
                                                onEditAttendance={onEditAttendance}
                                            />
                                        ))}
                                    </tbody>
                                    <tfoot><tr><td>Tổng cộng</td><td>{summary.attendanceDays} lượt</td><td>{formatMoney(report.items.reduce((sum, item) => sum + item.regularPayVnd, 0))}</td><td>{formatMoney(report.items.reduce((sum, item) => sum + item.overtimePayVnd, 0))}</td><td>{formatMoney(summary.netPayVnd)}</td></tr></tfoot>
                                </table>
                            </div>

                            <div className="payroll__mobile-list">
                                {report.items.map(item => (
                                    <EmployeeCard
                                        key={item.memberId}
                                        item={item}
                                        expanded={expandedId === item.memberId}
                                        onToggle={() => setExpandedId(current => current === item.memberId ? null : item.memberId)}
                                        onEditAttendance={onEditAttendance}
                                    />
                                ))}
                            </div>
                        </>
                    ) : null}
                </div>
            )}
        </section>
    );
}

function EmployeeRows({ item, expanded, onToggle, onEditAttendance }: {
    item: PayrollItem;
    expanded: boolean;
    onToggle: () => void;
    onEditAttendance?: (memberId: string, date?: string) => void;
}) {
    const worked = Number(item.regularHours) + Number(item.overtimeHours);
    return (
        <>
            <tr className={expanded ? 'is-expanded' : ''}>
                <td><EmployeeIdentity item={item} expanded={expanded} onToggle={onToggle} /></td>
                <td><strong>{item.attendanceDays} ngày · {hours.format(worked)} giờ</strong><small>{item.overtimeHours > 0 ? `+${hours.format(item.overtimeHours)} giờ tăng ca` : 'Không tăng ca'}</small></td>
                <td><strong>{formatMoney(item.regularPayVnd)}</strong><small>{hours.format(item.regularHours)}h × {money.format(item.hourlyRateVnd)}đ</small></td>
                <td><strong>{formatMoney(item.overtimePayVnd)}</strong><small>{hours.format(item.overtimeHours)}h × {money.format(item.hourlyRateVnd)}đ × {hours.format(item.overtimeMultiplier)}</small></td>
                <td><strong className="payroll__net-pay">{formatMoney(item.netPayVnd)}</strong><small>Đã tính từ dữ liệu hợp lệ</small></td>
            </tr>
            {expanded && <tr className="payroll__detail-row"><td colSpan={5}><EmployeeDetail item={item} onEditAttendance={onEditAttendance} /></td></tr>}
        </>
    );
}

function EmployeeCard({ item, expanded, onToggle, onEditAttendance }: {
    item: PayrollItem;
    expanded: boolean;
    onToggle: () => void;
    onEditAttendance?: (memberId: string, date?: string) => void;
}) {
    const worked = Number(item.regularHours) + Number(item.overtimeHours);
    return (
        <article className={`payroll__mobile-card ${expanded ? 'is-expanded' : ''}`}>
            <EmployeeIdentity item={item} expanded={expanded} onToggle={onToggle} />
            <div className="payroll__mobile-attendance"><strong>{item.attendanceDays} ngày · {hours.format(worked)} giờ</strong><span>{item.overtimeHours > 0 ? `+${hours.format(item.overtimeHours)} giờ tăng ca` : 'Không tăng ca'}</span></div>
            <dl>
                <div><dt>Lương thường</dt><dd>{formatMoney(item.regularPayVnd)}</dd></div>
                <div><dt>Tăng ca</dt><dd>{formatMoney(item.overtimePayVnd)}</dd></div>
                <div className="is-total"><dt>Thực nhận</dt><dd>{formatMoney(item.netPayVnd)}</dd></div>
            </dl>
            {expanded && <EmployeeDetail item={item} onEditAttendance={onEditAttendance} />}
        </article>
    );
}

function EmployeeIdentity({ item, expanded, onToggle }: { item: PayrollItem; expanded: boolean; onToggle: () => void }) {
    return (
        <button type="button" className="payroll__employee" onClick={onToggle} aria-expanded={expanded}>
            <span className="payroll__avatar">{initials(item.memberName)}</span>
            <span><strong>{item.memberName}</strong><small>Mã: {item.memberCode || `NV-${item.memberId.slice(0, 6).toUpperCase()}`}</small></span>
            <ion-icon name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} />
        </button>
    );
}

function EmployeeDetail({ item, onEditAttendance }: { item: PayrollItem; onEditAttendance?: (memberId: string, date?: string) => void }) {
    return (
        <div className="payroll__detail">
            <section className="payroll__formula" aria-label={`Cách tính lương của ${item.memberName}`}>
                <h4>Cách tính thực nhận</h4>
                <div><span>Lương thường</span><code>{hours.format(item.regularHours)}h × {money.format(item.hourlyRateVnd)}đ</code><strong>{formatMoney(item.regularPayVnd)}</strong></div>
                <div><span>Lương tăng ca</span><code>{hours.format(item.overtimeHours)}h × {money.format(item.hourlyRateVnd)}đ × {hours.format(item.overtimeMultiplier)}</code><strong>{formatMoney(item.overtimePayVnd)}</strong></div>
                <div className="is-total"><span>Thực nhận</span><code>Lương thường + tăng ca</code><strong>{formatMoney(item.netPayVnd)}</strong></div>
            </section>

            <section className="payroll__attendance-detail">
                <div className="payroll__detail-heading">
                    <div><h4>Chấm công từng ngày</h4><p>OT chỉ bắt đầu sau giờ tan ca đã lưu của ngày đó.</p></div>
                    <button type="button" onClick={() => onEditAttendance?.(item.memberId)}><ion-icon name="create-outline" /> Sửa chấm công</button>
                </div>
                {item.attendanceLines.length ? (
                    <div className="payroll__attendance-table-wrap">
                        <table className="payroll__attendance-table">
                            <thead><tr><th>Ngày</th><th>Giờ vào</th><th>Giờ ra</th><th>Giờ thường</th><th>Tăng ca</th><th /></tr></thead>
                            <tbody>{item.attendanceLines.map(line => (
                                <tr key={line.id} className={!line.payable ? 'is-incomplete' : ''}>
                                    <td>{formatDate(line.date)}</td><td>{formatClock(line.checkInTime)}</td><td>{formatClock(line.checkOutTime)}</td>
                                    <td>{line.payable ? `${hours.format(line.regularHours)}h` : '—'}</td>
                                    <td>{line.payable ? `${hours.format(line.overtimeHours)}h` : 'Chưa đủ giờ'}</td>
                                    <td><button type="button" onClick={() => onEditAttendance?.(item.memberId, line.date)} aria-label={`Sửa chấm công ngày ${line.date}`}><ion-icon name="create-outline" /></button></td>
                                </tr>
                            ))}</tbody>
                            <tfoot><tr><td colSpan={3}>Tổng</td><td>{hours.format(item.regularHours)}h</td><td>{hours.format(item.overtimeHours)}h</td><td /></tr></tfoot>
                        </table>
                    </div>
                ) : <div className="payroll__empty">Chưa có ngày công hợp lệ trong tháng này.</div>}
            </section>
        </div>
    );
}

function SummaryCard({ icon, label, value, hint, tone }: { icon: string; label: string; value: string; hint: string; tone: string }) {
    return (
        <article className={`payroll__summary-card payroll__summary-card--${tone}`}>
            <span><ion-icon name={icon} /></span><div><small>{label}</small><strong>{value}</strong><p>{hint}</p></div>
        </article>
    );
}

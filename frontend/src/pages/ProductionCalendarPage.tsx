import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { productionService } from '../services/groupService';
import './ProductionCalendarPage.css';

type CalendarStage = {
    actualKg?: number;
    targetKg?: number;
    completionRate?: number;
};

type CalendarOrderRow = {
    orderId: string;
    orderCode?: string;
    title?: string;
    customerName?: string;
    outputTarget?: number;
    completedQuantity?: number;
    remainingQuantity?: number;
    progressPercent?: number;
    riskLevel?: string;
};

type CalendarDay = {
    date?: string;
    totalActualKg?: number;
    totalTargetKg?: number;
    totalWorkerHours?: number;
    totalWorkers?: number;
    roast?: CalendarStage;
    qc?: CalendarStage;
    packaging?: CalendarStage;
    orderRows?: CalendarOrderRow[];
};

type StageCell = {
    value: number;
    subValue: number;
    progress: number;
    suffix: string;
    subSuffix?: string;
};

type StageRow = {
    key: string;
    label: string;
    caption: string;
    tone: string;
    render: (day: CalendarDay) => StageCell;
};

const DAY_MS = 86400000;
const numberFormat = new Intl.NumberFormat('vi-VN');

const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

const getMonday = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    return start;
};

function ProgressBar({ value, tone = 'good' }: { value: number; tone?: 'good' | 'warn' | 'bad' }) {
    const pct = Math.min(100, Math.max(0, value || 0));
    return (
        <div className={`production-progress tone-${tone}`} aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
        </div>
    );
}

export default function ProductionCalendarPage() {
    const { id } = useParams<{ id: string }>();
    const teamId = id || '';
    const navigate = useNavigate();

    const [weekStart, setWeekStart] = useState(() => toDateKey(getMonday(new Date())));
    const [calendar, setCalendar] = useState<CalendarDay[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const loadCalendar = async () => {
            setLoading(true);
            try {
                const start = weekStart;
                const end = toDateKey(addDays(new Date(weekStart), 13));
                const data = await productionService.getCalendarBoard(teamId, start, end);
                if (mounted) setCalendar(data || []);
            } catch {
                if (mounted) setCalendar([]);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadCalendar();

        return () => {
            mounted = false;
        };
    }, [teamId, weekStart]);

    const days = useMemo(() => {
        const start = new Date(weekStart);
        return Array.from({ length: 14 }, (_, index) => {
            const date = addDays(start, index);
            const key = toDateKey(date);
            const data = calendar.find(item => item?.date?.startsWith(key)) || calendar[index] || {};
            return { date, key, data };
        });
    }, [calendar, weekStart]);

    const orderRows = useMemo(() => {
        const rows = days.flatMap(day => day.data.orderRows || []);
        return rows.filter((row, index, arr) => arr.findIndex(item => item.orderId === row.orderId) === index);
    }, [days]);

    const totals = useMemo(() => {
        const target = days.reduce((sum, day) => sum + (day.data.totalTargetKg || 0), 0);
        const actual = days.reduce((sum, day) => sum + (day.data.totalActualKg || 0), 0);
        const hours = days.reduce((sum, day) => sum + (day.data.totalWorkerHours || 0), 0);
        const risks = orderRows.filter(row => row.riskLevel && row.riskLevel !== 'NONE').length;
        return {
            target,
            actual,
            hours,
            risks,
            completion: target ? Math.round((actual / target) * 100) : 0,
        };
    }, [days, orderRows]);

    const moveRange = (offset: number) => {
        setWeekStart(toDateKey(addDays(new Date(weekStart), offset * 14)));
    };

    const thisWeek = () => setWeekStart(toDateKey(getMonday(new Date())));

    const formatRange = () => {
        const start = new Date(weekStart);
        const end = addDays(start, 13);
        const fmt = (date: Date) => date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        return `${fmt(start)} - ${fmt(end)}`;
    };

    const stageRows: StageRow[] = [
        {
            key: 'total',
            label: 'Tổng sản lượng',
            caption: 'Thực tế / mục tiêu',
            tone: 'neutral',
            render: (day: CalendarDay) => ({
                value: day.totalActualKg || 0,
                subValue: day.totalTargetKg || 0,
                progress: day.totalTargetKg ? ((day.totalActualKg || 0) / day.totalTargetKg) * 100 : 0,
                suffix: 'kg',
            }),
        },
        {
            key: 'roast',
            label: 'Công đoạn rang',
            caption: 'Sản lượng hoàn thành',
            tone: 'amber',
            render: (day: CalendarDay) => ({
                value: day.roast?.actualKg || 0,
                subValue: day.roast?.targetKg || 0,
                progress: day.roast?.completionRate || 0,
                suffix: 'kg',
            }),
        },
        {
            key: 'qc',
            label: 'Kiểm định QC',
            caption: 'Đạt kiểm định',
            tone: 'blue',
            render: (day: CalendarDay) => ({
                value: day.qc?.actualKg || 0,
                subValue: day.qc?.targetKg || 0,
                progress: day.qc?.completionRate || 0,
                suffix: 'kg',
            }),
        },
        {
            key: 'packaging',
            label: 'Đóng gói',
            caption: 'Sẵn sàng xuất kho',
            tone: 'violet',
            render: (day: CalendarDay) => ({
                value: day.packaging?.actualKg || 0,
                subValue: day.packaging?.targetKg || 0,
                progress: day.packaging?.completionRate || 0,
                suffix: 'kg',
            }),
        },
        {
            key: 'workforce',
            label: 'Nhân sự',
            caption: 'Giờ công / số người',
            tone: 'teal',
            render: (day: CalendarDay) => ({
                value: day.totalWorkerHours || 0,
                subValue: day.totalWorkers || 0,
                progress: 0,
                suffix: 'giờ',
                subSuffix: 'người',
            }),
        },
    ];

    const riskMeta: Record<string, { label: string; className: string }> = {
        NONE: { label: 'Ổn định', className: 'risk-low' },
        LOW: { label: 'Thấp', className: 'risk-low' },
        MEDIUM: { label: 'Trung bình', className: 'risk-medium' },
        HIGH: { label: 'Cao', className: 'risk-high' },
        CRITICAL: { label: 'Khẩn cấp', className: 'risk-critical' },
    };

    return (
        <main className="production-calendar-page">
            <header className="production-calendar-header">
                <div className="production-calendar-title">
                    <button type="button" onClick={() => navigate(`/groups/${teamId}`)} aria-label="Quay lại nhóm">
                        <ion-icon name="chevron-back-outline" />
                    </button>
                    <div>
                        <span>Lịch sản xuất</span>
                        <h1>Kế hoạch 14 ngày</h1>
                        <p>{formatRange()}</p>
                    </div>
                </div>

                <div className="production-calendar-actions">
                    <button type="button" onClick={() => moveRange(-1)}>
                        <ion-icon name="chevron-back-outline" />
                        Kỳ trước
                    </button>
                    <button type="button" className="is-primary" onClick={thisWeek}>
                        Tuần này
                    </button>
                    <button type="button" onClick={() => moveRange(1)}>
                        Kỳ sau
                        <ion-icon name="chevron-forward-outline" />
                    </button>
                </div>
            </header>

            <section className="production-calendar-summary">
                <article>
                    <span>Mục tiêu</span>
                    <strong>{numberFormat.format(totals.target)} kg</strong>
                </article>
                <article>
                    <span>Thực tế</span>
                    <strong>{numberFormat.format(totals.actual)} kg</strong>
                </article>
                <article>
                    <span>Hoàn thành</span>
                    <strong>{totals.completion}%</strong>
                </article>
                <article className={totals.risks > 0 ? 'has-risk' : ''}>
                    <span>Đơn rủi ro</span>
                    <strong>{totals.risks}</strong>
                </article>
                <article>
                    <span>Giờ công</span>
                    <strong>{totals.hours.toFixed(1)}</strong>
                </article>
            </section>

            {loading ? (
                <section className="production-calendar-state">
                    <ion-icon name="sync-outline" />
                    <strong>Đang tải lịch sản xuất</strong>
                </section>
            ) : (
                <>
                    <section className="production-board" aria-label="Bảng lịch sản xuất 14 ngày">
                        <div className="production-board__scroller">
                            <div className="production-board__grid">
                                <div className="production-board__corner">Công đoạn</div>
                                {days.map(day => {
                                    const isToday = toDateKey(new Date()) === day.key;
                                    const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
                                    return (
                                        <div className={`production-day-head${isToday ? ' is-today' : ''}${isWeekend ? ' is-weekend' : ''}`} key={day.key}>
                                            <span>{day.date.toLocaleDateString('vi-VN', { weekday: 'short' })}</span>
                                            <strong>{day.date.getDate()}</strong>
                                            <em>{numberFormat.format(day.data.totalActualKg || 0)} kg</em>
                                        </div>
                                    );
                                })}

                                {stageRows.map(row => (
                                    <div className="production-board__row" key={row.key}>
                                        <div className={`production-stage-label tone-${row.tone}`}>
                                            <strong>{row.label}</strong>
                                            <span>{row.caption}</span>
                                        </div>
                                        {days.map(day => {
                                            const cell = row.render(day.data);
                                            const progressTone = cell.progress >= 90 ? 'good' : cell.progress >= 65 ? 'warn' : 'bad';
                                            return (
                                                <article className={`production-cell tone-${row.tone}`} key={`${row.key}-${day.key}`}>
                                                    <strong>
                                                        {numberFormat.format(cell.value)}
                                                        <small>{cell.suffix}</small>
                                                    </strong>
                                                    <span>
                                                        / {numberFormat.format(cell.subValue)} {cell.subSuffix || cell.suffix}
                                                    </span>
                                                    {row.key !== 'workforce' && <ProgressBar value={cell.progress} tone={progressTone} />}
                                                </article>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="production-orders">
                        <div className="production-orders__head">
                            <div>
                                <span>Đơn hàng</span>
                                <h2>Tổng hợp trong kỳ</h2>
                            </div>
                            <strong>{orderRows.length} đơn</strong>
                        </div>

                        {orderRows.length === 0 ? (
                            <div className="production-calendar-state is-compact">
                                <ion-icon name="file-tray-outline" />
                                <strong>Chưa có đơn hàng trong kỳ này</strong>
                            </div>
                        ) : (
                            <div className="production-orders__table-wrap">
                                <table className="production-orders__table">
                                    <thead>
                                        <tr>
                                            <th>Đơn hàng</th>
                                            <th>Khách hàng</th>
                                            <th>Sản lượng</th>
                                            <th>Tiến độ</th>
                                            <th>Rủi ro</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderRows.map(row => {
                                            const risk = riskMeta[row.riskLevel || 'NONE'] || riskMeta.LOW;
                                            const progress = row.progressPercent || 0;
                                            return (
                                                <tr key={row.orderId}>
                                                    <td>
                                                        <strong>{row.orderCode || 'Chưa có mã'}</strong>
                                                        <span>{row.title || 'Đơn sản xuất'}</span>
                                                    </td>
                                                    <td>{row.customerName || '-'}</td>
                                                    <td>
                                                        <strong>{numberFormat.format(row.outputTarget || 0)} kg</strong>
                                                        <span>Còn {numberFormat.format(row.remainingQuantity || 0)} kg</span>
                                                    </td>
                                                    <td>
                                                        <div className="production-order-progress">
                                                            <ProgressBar value={progress} tone={progress >= 90 ? 'good' : progress >= 65 ? 'warn' : 'bad'} />
                                                            <span>{progress.toFixed(0)}%</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <mark className={risk.className}>{risk.label}</mark>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </main>
    );
}

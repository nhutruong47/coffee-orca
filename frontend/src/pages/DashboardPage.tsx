import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Clock3,
    Factory,
    MessageCircle,
    PackageCheck,
    Plus,
    UserRoundCog,
    Store,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { teamService, taskService, goalService } from '../services/groupService';
import type { Task, Team, Goal } from '../types/types';
import './DashboardPage.css';

const teamImages = [
    'https://images.unsplash.com/photo-1581091226033-d5c48150dbaa?auto=format&fit=crop&w=900&q=84',
    'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=900&q=84',
    'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=900&q=84',
];

const TEAM_COLORS = [
    '#c47a16',
    '#2563eb',
    '#059669',
    '#7c3aed',
    '#e11d48',
    '#0891b2',
    '#ea580c',
    '#4f46e5',
];

interface TeamProductivityDatum {
    id: string;
    name: string;
    color: string;
    productivity: number;
    completedTasks: number;
    totalTasks: number;
}

interface ProductivityTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: TeamProductivityDatum }>;
}

function getLatestGoal(goals: Goal[]) {
    return [...goals].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
    })[0];
}

function getTaskProgress(task: Task) {
    const target = Number(task.outputTarget ?? task.workload ?? 0);
    const actual = Number(task.actualOutput ?? 0);
    const percentage = target > 0
        ? Math.round((actual / target) * 100)
        : Number(task.completionPercentage || (task.status === 'COMPLETED' ? 100 : 0));

    return Math.min(100, Math.max(0, percentage));
}

function getTeamTaskProgress(goals: Goal[], tasks: Task[]) {
    const latestGoal = getLatestGoal(goals);
    const currentTasks = latestGoal
        ? tasks.filter(task => task.goalId === latestGoal.id)
        : [];
    const totalTasks = currentTasks.length;
    const completedTasks = currentTasks.filter(task => task.status === 'COMPLETED').length;
    const productivity = totalTasks > 0
        ? Math.round(currentTasks.reduce((sum, task) => sum + getTaskProgress(task), 0) / totalTasks)
        : 0;

    return { totalTasks, completedTasks, productivity };
}

function ProductivityTooltip({ active, payload }: ProductivityTooltipProps) {
    const datum = payload?.[0]?.payload;
    if (!active || !datum) return null;

    return (
        <div className="dashboard-productivity-tooltip">
            <strong>{datum.name}</strong>
            <span style={{ color: datum.color }}>{datum.productivity}% hoàn thành</span>
            <small>
                {datum.totalTasks > 0
                    ? `${datum.completedTasks}/${datum.totalTasks} công việc`
                    : 'Chưa có công việc'}
            </small>
        </div>
    );
}

function statusText(status: string) {
    if (status === 'COMPLETED') return 'Hoàn thành';
    if (status === 'IN_PROGRESS') return 'Đang làm';
    return 'Chờ xử lý';
}

function isTaskWarning(task: Task) {
    if (task.status === 'BLOCKED') return true;
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return false;
    const deadline = task.dueTime || task.deadline;
    if (!deadline) return false;
    const deadlineTime = new Date(deadline).getTime();
    return !Number.isNaN(deadlineTime) && deadlineTime < Date.now();
}

function formatDate(value: string | null | undefined) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function getTodayLabel() {
    return new Date().toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
    });
}

export default function DashboardPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [teams, setTeams] = useState<Team[]>([]);
    const [myTasks, setMyTasks] = useState<Task[]>([]);
    const [teamGoals, setTeamGoals] = useState<Record<string, Goal[]>>({});
    const [teamTasks, setTeamTasks] = useState<Record<string, Task[]>>({});
    const [loading, setLoading] = useState(true);
    const [reduceMotion, setReduceMotion] = useState(() =>
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    useEffect(() => {
        Promise.all([
            teamService.getMyTeams().catch(() => []),
            user?.id ? taskService.getMyTasks(user.id).catch(() => []) : Promise.resolve([]),
        ]).then(([teamData, tasksData]) => {
            setTeams(teamData || []);
            setMyTasks(tasksData || []);
            if (teamData && teamData.length > 0) {
                return Promise.all(teamData.map(async (team: Team) => {
                    const goals = await goalService.getByTeam(team.id).catch(() => []);
                    const latestGoal = getLatestGoal(goals);
                    const tasks = latestGoal
                        ? await taskService.getByGoal(latestGoal.id).catch(() => [])
                        : [];
                    return { goals, tasks };
                })).then(teamDataRows => {
                    const allGoals: Record<string, Goal[]> = {};
                    const allTasks: Record<string, Task[]> = {};
                    teamData.forEach((team: Team, index: number) => {
                        allGoals[team.id] = teamDataRows[index]?.goals || [];
                        allTasks[team.id] = teamDataRows[index]?.tasks || [];
                    });
                    setTeamGoals(allGoals);
                    setTeamTasks(allTasks);
                });
            }
            setTeamGoals({});
            setTeamTasks({});
        }).finally(() => setLoading(false));
    }, [user?.id]);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;

        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleMotionChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
        motionQuery.addEventListener('change', handleMotionChange);
        return () => motionQuery.removeEventListener('change', handleMotionChange);
    }, []);

    const activeTasks = useMemo(() => myTasks.filter(task => task.status !== 'COMPLETED'), [myTasks]);
    const completedTasks = useMemo(() => myTasks.filter(task => task.status === 'COMPLETED'), [myTasks]);
    const progress = myTasks.length ? Math.round((completedTasks.length / myTasks.length) * 100) : 0;
    const recentTasks = myTasks.slice(0, 5);
    const displayName = user?.fullName || user?.username || 'ORCA';
    const primaryTeam = teams[0];
    const teamColorById = useMemo<Record<string, string>>(() => {
        const orderedTeams = [...teams].sort((a, b) => {
            const createdDifference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            return createdDifference || a.id.localeCompare(b.id);
        });
        return Object.fromEntries(
            orderedTeams.map((team, index) => [team.id, TEAM_COLORS[index % TEAM_COLORS.length]]),
        );
    }, [teams]);
    const teamProductivityData = useMemo<TeamProductivityDatum[]>(() =>
        teams
            .map(team => {
                const { totalTasks, completedTasks, productivity } = getTeamTaskProgress(
                    teamGoals[team.id] || [],
                    teamTasks[team.id] || [],
                );
                return {
                    id: team.id,
                    name: team.name,
                    color: teamColorById[team.id] || TEAM_COLORS[0],
                    productivity,
                    completedTasks,
                    totalTasks,
                };
            })
            .sort((a, b) =>
                b.productivity - a.productivity
                || b.completedTasks - a.completedTasks
                || a.name.localeCompare(b.name, 'vi')
            ),
        [teamColorById, teamGoals, teamTasks, teams],
    );
    const taskStatusData = useMemo(() => {
        const currentTasks = Object.values(teamTasks)
            .flat()
            .filter(task => task.status !== 'CANCELLED');
        const completed = currentTasks.filter(task => task.status === 'COMPLETED').length;
        const warning = currentTasks.filter(task => isTaskWarning(task)).length;
        const inProgress = currentTasks.filter(task => task.status === 'IN_PROGRESS' && !isTaskWarning(task)).length;
        const waiting = Math.max(0, currentTasks.length - completed - warning - inProgress);

        return [
            { name: 'Hoàn thành', value: completed, color: '#059669' },
            { name: 'Đang thực hiện', value: inProgress, color: '#2563eb' },
            { name: 'Cảnh báo', value: warning, color: '#dc2626' },
            { name: 'Chờ xử lý', value: waiting, color: '#a8a29e' },
        ];
    }, [teamTasks]);
    const totalStatusTasks = taskStatusData.reduce((sum, status) => sum + status.value, 0);

    const goToTeamFeature = (featurePath: string) => {
        if (!primaryTeam) {
            navigate('/groups');
            return;
        }
        navigate(`/groups/${primaryTeam.id}${featurePath}`);
    };

    const quickActions = [
        {
            label: 'Tạo công việc',
            caption: primaryTeam ? 'Giao task trong nhóm đầu tiên' : 'Chọn nhóm để tạo task',
            icon: ClipboardList,
            onClick: () => goToTeamFeature('/create-task'),
        },
        {
            label: 'Đơn hàng',
            caption: 'Theo dõi mua bán và xử lý đơn',
            icon: PackageCheck,
            onClick: () => navigate('/orders'),
        },
        {
            label: 'Lịch sản xuất',
            caption: primaryTeam ? 'Xem lịch của nhóm gần nhất' : 'Cần có nhóm xưởng',
            icon: CalendarDays,
            onClick: () => goToTeamFeature('/calendar'),
        },
        {
            label: 'Nhân sự',
            caption: primaryTeam ? 'Chấm công và ca làm' : 'Cần có nhóm xưởng',
            icon: UserRoundCog,
            onClick: () => goToTeamFeature('/workforce'),
        },
        {
            label: 'Tin nhắn nhóm',
            caption: primaryTeam ? 'Mở nhóm và khung chat' : 'Cần có nhóm xưởng',
            icon: MessageCircle,
            onClick: () => goToTeamFeature(''),
        },
        {
            label: 'Thị trường',
            caption: 'Tìm xưởng và đơn hợp tác',
            icon: Store,
            onClick: () => navigate('/marketplace'),
        },
    ];

    const stats = [
        {
            label: 'Nhóm xưởng',
            value: teams.length,
            caption: 'Không gian đang tham gia',
            icon: Factory,
            tone: 'teal',
        },
        {
            label: 'Việc đang làm',
            value: activeTasks.length,
            caption: 'Cần theo dõi hôm nay',
            icon: ClipboardList,
            tone: 'amber',
        },
        {
            label: 'Tiến độ',
            value: `${progress}%`,
            caption: `${completedTasks.length}/${myTasks.length} công việc hoàn thành`,
            icon: CheckCircle2,
            tone: 'green',
        },
        {
            label: 'Lịch hôm nay',
            value: getTodayLabel(),
            caption: 'Cập nhật theo múi giờ Việt Nam',
            icon: CalendarDays,
            tone: 'blue',
        },
    ];

    const openTeamWorkspace = (teamId: string | number) => {
        navigate(`/groups/${teamId}`);
    };

    const currentHour = new Date().getHours();
    const isOverloaded = activeTasks.length > 0 && currentHour >= 17;
    const totalTarget = myTasks.reduce((sum, task) => sum + (task.outputTarget || 0), 0);
    const totalActual = myTasks.reduce((sum, task) => sum + (task.actualOutput || 0), 0);
    const isOverachieving = totalTarget > 0 && totalActual > totalTarget;

    if (loading) {
        return (
            <div className="dashboard-page dashboard-loading">
                <div className="btn-spinner" />
                <p>Đang tải dashboard...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <section className="dashboard-command">
                <div className="dashboard-command-main">
                    <span className="dashboard-eyebrow">Tổng quan vận hành</span>
                    <h1>Xin chào, {displayName}</h1>
                    <p>Theo dõi nhóm xưởng, tiến độ và việc cần xử lý trong ngày từ một màn hình gọn hơn.</p>
                    <div className="dashboard-command-actions">
                        <button className="dashboard-primary-action" onClick={() => navigate('/groups')} type="button">
                            <Plus size={18} />
                            Mở nhóm xưởng
                        </button>
                        <button onClick={() => goToTeamFeature('/create-task')} type="button">
                            <ClipboardList size={18} />
                            Tạo công việc
                        </button>
                    </div>
                </div>

                <div className={`dashboard-ops-card ${isOverachieving ? 'overachieving' : isOverloaded ? 'overloaded' : ''}`} aria-label="Trạng thái vận hành">
                    <div className="dashboard-ops-head">
                        <Activity size={18} />
                        <span>Nhịp vận hành</span>
                    </div>
                    <strong>{isOverachieving ? 'Phát triển vượt mong đợi' : isOverloaded ? 'Quá tải công việc' : activeTasks.length > 0 ? 'Đang có việc cần bám' : 'Không có việc quá tải'}</strong>
                    <p>{isOverachieving ? `Sản lượng đạt ${totalActual}/${totalTarget}, vượt mức kế hoạch đề ra.` : isOverloaded ? `Đã hết ngày nhưng còn ${activeTasks.length} task chưa xong.` : activeTasks.length > 0 ? `${activeTasks.length} task chưa hoàn thành.` : 'Bạn có thể tạo thêm kế hoạch hoặc kiểm tra nhóm xưởng.'}</p>
                    <div className="dashboard-progress-track">
                        <span style={{ width: `${progress}%`, background: isOverachieving ? 'var(--success)' : isOverloaded ? 'var(--danger)' : undefined }} />
                    </div>
                    <small style={{ color: isOverachieving ? 'var(--success)' : isOverloaded ? 'var(--danger)' : undefined }}>{progress}% hoàn thành</small>
                </div>
            </section>

            <section className="dashboard-quick-actions" aria-label="Lối tắt chức năng">
                {quickActions.map(action => {
                    const Icon = action.icon;
                    return (
                        <button key={action.label} type="button" onClick={action.onClick}>
                            <span className="dashboard-quick-icon">
                                <Icon size={18} />
                            </span>
                            <span>
                                <strong>{action.label}</strong>
                                <small>{action.caption}</small>
                            </span>
                        </button>
                    );
                })}
            </section>

            <section className="dashboard-stat-grid" aria-label="Tổng quan nhanh">
                {stats.map(stat => {
                    const Icon = stat.icon;
                    return (
                        <article className={`dashboard-stat-card ${stat.tone}`} key={stat.label}>
                            <div className="dashboard-stat-icon">
                                <Icon size={19} />
                            </div>
                            <div>
                                <span>{stat.label}</span>
                                <strong>{stat.value}</strong>
                                <p>{stat.caption}</p>
                            </div>
                        </article>
                    );
                })}
            </section>

            <div className="dashboard-workspace-grid">
                <section className="dashboard-panel dashboard-teams-panel">
                    <div className="dashboard-section-head">
                        <div>
                            <span>Không gian làm việc</span>
                            <h2>Nhóm đang vận hành</h2>
                        </div>
                        <button onClick={() => navigate('/groups')} type="button">
                            Xem tất cả
                            <ArrowRight size={16} />
                        </button>
                    </div>

                    {teams.length > 0 ? (
                        <div className="dashboard-team-list">
                            {teams.slice(0, 3).map((team, index) => {
                                const goals = teamGoals[team.id] || [];
                                const {
                                    totalTasks: totalTeamTasks,
                                    completedTasks: completedTeamTasks,
                                    productivity: teamProgress,
                                } = getTeamTaskProgress(goals, teamTasks[team.id] || []);
                                const currentTeamTasks = teamTasks[team.id] || [];
                                const hasCurrentWarning = currentTeamTasks.some(isTaskWarning);
                                const progressTone = totalTeamTasks === 0
                                    ? 'empty'
                                    : teamProgress >= 100
                                        ? 'complete'
                                        : 'active';
                                const progressColor = teamColorById[team.id] || TEAM_COLORS[0];
                                const statusColor = hasCurrentWarning ? '#dc2626' : '#059669';
                                const statusTitle = hasCurrentWarning
                                    ? 'Có công việc bị chặn hoặc quá hạn'
                                    : 'Hiện không có cảnh báo';

                                return (
                                <article
                                    className="dashboard-team-card"
                                    key={team.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openTeamWorkspace(team.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            openTeamWorkspace(team.id);
                                        }
                                    }}
                                    aria-label={`Mở nơi làm việc của nhóm ${team.name}`}
                                    style={{ position: 'relative' }}
                                >
                                    <img src={teamImages[index % teamImages.length]} alt={team.name} />
                                    <div className="dashboard-team-body">
                                        <div>
                                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {team.name}
                                                <span
                                                    style={{
                                                        display: 'inline-block',
                                                         width: 10,
                                                         height: 10,
                                                         borderRadius: '50%',
                                                         backgroundColor: statusColor,
                                                         boxShadow: `0 0 8px ${statusColor}66`,
                                                         flexShrink: 0
                                                     }}
                                                     title={statusTitle}
                                                 />
                                             </h3>
                                             <p>{team.description || team.specialty || 'Nhóm xưởng đang được quản lý trên ORCA.'}</p>
                                         </div>
                                         <div className="dashboard-team-progress">
                                             <div className="dashboard-team-progress-head">
                                                 <span>Tiến độ công việc</span>
                                                 <strong>{teamProgress}%</strong>
                                             </div>
                                             <div
                                                 className="dashboard-team-progress-track"
                                                 role="progressbar"
                                                 aria-label={`Tiến độ công việc của nhóm ${team.name}`}
                                                 aria-valuemin={0}
                                                 aria-valuemax={100}
                                                 aria-valuenow={teamProgress}
                                             >
                                                 <span
                                                     className={`dashboard-team-progress-fill ${progressTone}`}
                                                     style={{ width: `${teamProgress}%`, background: progressColor }}
                                                 />
                                             </div>
                                             <small>
                                                 {totalTeamTasks > 0
                                                     ? `${completedTeamTasks}/${totalTeamTasks} công việc hoàn thành`
                                                     : 'Chưa có công việc'}
                                             </small>
                                         </div>
                                         <dl>
                                            <div>
                                                <dt>Thành viên</dt>
                                                <dd>{team.memberCount}</dd>
                                            </div>
                                            <div>
                                                <dt>Ngày tạo</dt>
                                                <dd>{formatDate(team.createdAt)}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="dashboard-empty">
                            <Factory size={34} />
                            <h3>Chưa có nhóm xưởng</h3>
                            <p>Tạo nhóm đầu tiên để bắt đầu quản lý nhân sự, quy trình và công việc sản xuất.</p>
                            <button onClick={() => navigate('/groups')} type="button">Tạo nhóm</button>
                        </div>
                    )}
                </section>

                <section className="dashboard-panel dashboard-tasks-panel">
                    <div className="dashboard-section-head">
                        <div>
                            <span>Công việc</span>
                            <h2>Việc gần đây</h2>
                        </div>
                        <button onClick={() => goToTeamFeature('/create-task')} type="button">
                            Tạo công việc
                            <ArrowRight size={16} />
                        </button>
                    </div>

                    <div className="dashboard-task-list">
                        {recentTasks.length > 0 ? recentTasks.map(task => (
                            <article className="dashboard-task-row" key={task.id}>
                                <div className="dashboard-task-mark">
                                    {task.status === 'COMPLETED' ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                                </div>
                                <div className="dashboard-task-copy">
                                    <h3>{task.title}</h3>
                                    <p>{task.description || task.goalTitle || 'Không có mô tả.'}</p>
                                </div>
                                <span className={`dashboard-task-status ${task.status.toLowerCase().replaceAll('_', '-')}`}>
                                    {statusText(task.status)}
                                </span>
                            </article>
                        )) : (
                            <div className="dashboard-empty dashboard-empty-compact">
                                <ClipboardList size={34} />
                                <h3>Chưa có công việc mới</h3>
                                <p>Khi có task được giao, danh sách sẽ hiện ở đây.</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {teamProductivityData.length > 0 && (
                <section
                    className="dashboard-panel dashboard-productivity-panel"
                    aria-labelledby="dashboard-productivity-title"
                >
                    <div className="dashboard-section-head dashboard-productivity-head">
                        <div>
                            <span>Hiệu suất vận hành</span>
                            <h2 id="dashboard-productivity-title">So sánh năng suất nhóm</h2>
                            <p>Tỷ lệ công việc hoàn thành trên tổng công việc của từng nhóm.</p>
                        </div>
                        <div className="dashboard-productivity-legend" aria-label="Màu đại diện từng xưởng">
                            {teamProductivityData.slice(0, 6).map(team => (
                                <span key={team.id} title={team.name}>
                                    <i style={{ background: team.color }} />
                                    {team.name}
                                </span>
                            ))}
                            {teamProductivityData.length > 6 && (
                                <span>+{teamProductivityData.length - 6} xưởng khác</span>
                            )}
                        </div>
                    </div>

                    <div className="dashboard-productivity-grid">
                        <section className="dashboard-chart-card">
                            <div className="dashboard-chart-card__head">
                                <div>
                                    <span>Tiến độ theo xưởng</span>
                                    <strong>So sánh tỷ lệ hoàn thành</strong>
                                </div>
                                <em>Đơn vị: %</em>
                            </div>
                            <div className="dashboard-column-chart">
                                <div
                                    className="dashboard-column-chart__canvas"
                                    style={{ minWidth: Math.max(520, teamProductivityData.length * 105) }}
                                >
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={teamProductivityData}
                                            margin={{ top: 14, right: 18, bottom: 34, left: 0 }}
                                            accessibilityLayer
                                        >
                                            <CartesianGrid
                                                stroke="var(--border)"
                                                strokeDasharray="4 4"
                                                vertical={false}
                                            />
                                            <XAxis
                                                type="category"
                                                dataKey="name"
                                                interval={0}
                                                tickFormatter={value => value.length > 14 ? `${value.slice(0, 13)}…` : value}
                                                tick={{ fill: 'var(--text-primary)', fontSize: 11, fontWeight: 700 }}
                                                axisLine={{ stroke: 'var(--border)' }}
                                                tickLine={false}
                                                tickMargin={10}
                                            />
                                            <YAxis
                                                type="number"
                                                domain={[0, 100]}
                                                tickFormatter={value => `${value}%`}
                                                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                                axisLine={false}
                                                tickLine={false}
                                                width={42}
                                            />
                                            <Tooltip
                                                content={<ProductivityTooltip />}
                                                cursor={{ fill: 'var(--accent-soft)', opacity: 0.45 }}
                                            />
                                            <Bar
                                                dataKey="productivity"
                                                name="Hoàn thành"
                                                unit="%"
                                                barSize={42}
                                                radius={[8, 8, 0, 0]}
                                                isAnimationActive={!reduceMotion}
                                                animationDuration={500}
                                            >
                                                {teamProductivityData.map(team => (
                                                    <Cell key={team.id} fill={team.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </section>

                        <section className="dashboard-chart-card dashboard-chart-card--donut">
                            <div className="dashboard-chart-card__head">
                                <div>
                                    <span>Tình trạng công việc</span>
                                    <strong>Tổng quan hiện tại</strong>
                                </div>
                            </div>
                            {totalStatusTasks > 0 ? (
                                <>
                                    <div className="dashboard-donut-chart">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart accessibilityLayer>
                                                <Pie
                                                    data={taskStatusData}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={66}
                                                    outerRadius={96}
                                                    paddingAngle={3}
                                                    stroke="var(--bg-card)"
                                                    strokeWidth={3}
                                                    isAnimationActive={!reduceMotion}
                                                    animationDuration={500}
                                                >
                                                    {taskStatusData.map(status => (
                                                        <Cell key={status.name} fill={status.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value, name) => [`${Number(value)} công việc`, name]}
                                                    contentStyle={{
                                                        border: '1px solid var(--border-strong)',
                                                        borderRadius: 8,
                                                        background: 'var(--bg-card)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: 12,
                                                    }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="dashboard-donut-chart__center" aria-hidden="true">
                                            <strong>{totalStatusTasks}</strong>
                                            <span>Công việc</span>
                                        </div>
                                    </div>
                                    <div className="dashboard-status-legend">
                                        {taskStatusData.map(status => (
                                            <span key={status.name}>
                                                <i style={{ background: status.color }} />
                                                <em>{status.name}</em>
                                                <strong>{status.value}</strong>
                                            </span>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="dashboard-chart-empty">
                                    <ClipboardList size={30} />
                                    <strong>Chưa có dữ liệu công việc</strong>
                                    <span>Tạo công việc để bắt đầu theo dõi trạng thái.</span>
                                </div>
                            )}
                        </section>
                    </div>
                </section>
            )}
        </div>
    );
}

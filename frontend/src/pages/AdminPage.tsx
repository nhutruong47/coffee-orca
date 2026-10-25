import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Lock,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  ServerCrash,
  ShieldCheck,
  Users,
  Wallet,
  Receipt,
  Trash2,
  Edit2
} from 'lucide-react';
import { useChartPalette } from '../utils/chartTheme';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { useAuth } from '../context/AuthContext';
import { adminCostService, adminService } from '../services/adminService';
import type { AdminOverview, AdminPayment, AdminTeam, AdminUser, SubscriptionPlan, SystemLog, Cost, CostCategory, CostDashboardStats } from '../types/types';
import { OrcaSelect } from '../components/OrcaSelect';
import './AdminPage.css';

type AdminSection =
  | 'overview'
  | 'workspace_requests'
  | 'companies'
  | 'users'
  | 'subscriptions'
  | 'payments'
  | 'costs'
  | 'reports'
  | 'logs';

const money = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const number = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

const millionsFormatter = (val: unknown): [string, string] => {
  const num = typeof val === 'number' ? val : Number(val ?? 0);
  return [money(num * 1_000_000), 'Chi phí'];
};

const revenueMillionsFormatter = (val: unknown): [string, string] => {
  const num = typeof val === 'number' ? val : Number(val ?? 0);
  return [money(num * 1_000_000), 'Doanh thu'];
};

const orderStatusLabels: Record<string, string> = {
  PENDING: 'Chờ xử lý',
  ACCEPTED: 'Đã chấp nhận',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  CANCELED: 'Đã hủy',
  REJECTED: 'Từ chối',
};

const parseDateInput = (value: string, endOfDay = false) => {
  const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};


const sidebarModules: Array<{ id: AdminSection; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Tổng quan & Phân tích', icon: Activity },
  { id: 'workspace_requests', label: 'Yêu cầu mở xưởng', icon: ShieldCheck },
  { id: 'companies', label: 'Quản lý doanh nghiệp', icon: Building2 },
  { id: 'users', label: 'Quản lý người dùng', icon: Users },
  { id: 'subscriptions', label: 'Gói dịch vụ', icon: CreditCard },
  { id: 'payments', label: 'Thanh toán & doanh thu', icon: DollarSign },
  { id: 'costs', label: 'Chi phí', icon: Wallet },
  { id: 'reports', label: 'Báo cáo thống kê', icon: FileText },
  { id: 'logs', label: 'Nhật ký hệ thống', icon: ServerCrash },
];

type KpiTone = 'blue' | 'green' | 'amber' | 'violet' | 'rose';

type KpiItem = {
  label: string;
  value: string;
  detail: string;
  icon: React.ElementType;
  tone: KpiTone;
  trend?: 'up' | 'down';
};

const emptyOverview: AdminOverview = {
  totalUsers: 0,
  adminUsers: 0,
  memberUsers: 0,
  newUsersThisMonth: 0,
  newUsersPreviousMonth: 0,
  totalTeams: 0,
  publishedTeams: 0,
  newTeamsThisMonth: 0,
  newTeamsPreviousMonth: 0,
  totalGoals: 0,
  activeGoals: 0,
  totalTasks: 0,
  completedTasks: 0,
  overdueTasks: 0,
  totalOrders: 0,
  activeOrders: 0,
  totalProductionOrders: 0,
  activeProductionOrders: 0,
  overdueProductionOrders: 0,
  totalBatches: 0,
  activeBatches: 0,
  completedBatches: 0,
  paidPayments: 0,
  totalPayments: 0,
  revenueThisMonth: 0,
  revenuePreviousMonth: 0,
  revenueThisYear: 0,
  revenuePreviousYear: 0,
  revenueTotal: 0,
  orderStatusCounts: {},
  productionOrderStatusCounts: {},
  batchStatusCounts: {},
  taskStatusCounts: {},
  recentUsers: [],
  recentTeams: [],
  systemTrendData: []
};

const getDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const paymentDate = (payment: AdminPayment) => getDate(payment.paidAt || payment.createdAt);

const isReportablePayment = (payment: AdminPayment) => {
  const txnRef = String(payment.txnRef || '').toUpperCase();
  const bankCode = String(payment.bankCode || '').toUpperCase();
  return !txnRef.startsWith('DEMO-') && !bankCode.endsWith('_QR');
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfPreviousMonthInput = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1, 1);
  return formatDateInput(date);
};

const formatShortDate = (value: Date | string | null | undefined) => {
  const date = value instanceof Date ? value : getDate(value);
  return date ? date.toLocaleDateString('vi-VN') : '-';
};

const formatTime = (value: string | null | undefined) => {
  const date = getDate(value);
  return date ? date.toLocaleTimeString('vi-VN') : '-';
};

/**
 * Masks email address for privacy
 */
const maskEmail = (email?: string | null) => {
  return email || '-';
};

/**
 * Masks business license for privacy
 */
const maskLicense = (license?: string | null) => {
  return license || '-';
};

const paymentCustomerName = (payment: AdminPayment) => {
  if (payment.fullName || payment.username) return payment.fullName || payment.username;
  if (payment.email) return maskEmail(payment.email);
  return 'Không rõ người dùng';
};

function KpiCard({ item }: { item: KpiItem }) {
  const Icon = item.icon;
  return (
    <article className={`admin-kpi admin-kpi-${item.tone}`}>
      <div className="admin-kpi-icon"><Icon size={22} /></div>
      <div className="admin-kpi-content">
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small className={item.trend === 'up' ? 'positive' : item.trend === 'down' ? 'negative' : ''}>{item.detail}</small>
      </div>
    </article>
  );
}

function MiniMetric({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <article className="admin-mini-metric">
      <Icon size={18} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="admin-card admin-chart-card">
      <div className="admin-card-head">
        <h3>{title}</h3>
        <button type="button" className="btn-icon"><MoreHorizontal size={16} /></button>
      </div>
      <div className="admin-chart">{children}</div>
    </section>
  );
}

function StatusBadge({ value }: { value: string }) {
  const lower = value.toLowerCase().replaceAll(' ', '-');
  let type = 'neutral';
  
  if (['active', 'paid', 'approved', 'published', 'completed', 'success'].includes(lower)) type = 'success';
  if (['pending', 'trial', 'processing'].includes(lower)) type = 'warning';
  if (['locked', 'failed', 'rejected', 'suspended', 'canceled', 'rejected_order'].includes(lower)) type = 'danger';
  if (['admin', 'plus', 'professional', 'enterprise', 'factory_owner'].includes(lower)) type = 'info';

  const labels: Record<string, string> = {
    Active: 'Đang hoạt động', Trial: 'Dùng thử', Locked: 'Đã khóa',
    APPROVED: 'Đã duyệt', PENDING: 'Chờ duyệt', REJECTED: 'Từ chối',
    Suspended: 'Tạm đình chỉ',
    PAID: 'Đã thanh toán', FAILED: 'Thất bại', REFUNDED: 'Hoàn tiền',
    Published: 'Công khai', Private: 'Nội bộ',
    ADMIN: 'Admin Nền Tảng', MEMBER: 'Thành viên', FACTORY_OWNER: 'Chủ xưởng',
    free: 'Miễn phí', plus: 'Plus', professional: 'Plus', enterprise: 'Doanh nghiệp',
    SUCCESS: 'Thành công'
  };

  return <span className={`admin-badge ${type}`}>{labels[value] || value}</span>;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as AdminSection | null;
  const active: AdminSection = sidebarModules.some(tab => tab.id === sectionParam) ? sectionParam! : 'overview';
  const chartPalette = useChartPalette();
  
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminTeams, setAdminTeams] = useState<AdminTeam[]>([]);
  const [adminPayments, setAdminPayments] = useState<AdminPayment[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState('');
  
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [userPage, setUserPage] = useState(1);
  const [revenueFrom] = useState(startOfPreviousMonthInput);
  const [revenueTo] = useState(() => formatDateInput(new Date()));
  const [logFilter, setLogFilter] = useState('all');
  
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<AdminPayment | null>(null);

  // Costs State
  const [costs, setCosts] = useState<Cost[]>([]);
  const [costCategories, setCostCategories] = useState<CostCategory[]>([]);
  const [costStats, setCostStats] = useState<CostDashboardStats | null>(null);
  const [costPage, setCostPage] = useState(0);
  const [costTotalPages, setCostTotalPages] = useState(1);
  const [costSearch, setCostSearch] = useState('');
  const [costFilterCategory, setCostFilterCategory] = useState('');
  const [costFilterStatus, setCostFilterStatus] = useState('');
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);
  const [isCostCategoryModalOpen, setIsCostCategoryModalOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<Cost | null>(null);
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState('');

  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      setAdminLoading(false);
      return;
    }

    setAdminLoading(true);
    setAdminError('');
    Promise.all([
      adminService.getOverview(),
      adminService.getUsers(0, 1000, ''),
      adminService.getTeams(0, 1000, ''),
      adminService.getPayments(0, 1000, ''),
      adminService.getPlans(),
      adminService.getLogs(0, 100, ''),
    ])
      .then(([overviewData, userData, teamData, paymentData, plansData, logsData]) => {
        setOverview({ ...emptyOverview, ...overviewData });
        setAdminUsers(userData.content || []);
        setAdminTeams(teamData.content || []);
        setAdminPayments(paymentData.content || []);
        setPlans(plansData || []);
        setSystemLogs(logsData.content || []);
      })
      .catch(() => {
        setAdminError('Không tải được thống kê thật từ hệ thống.');
      })
      .finally(() => setAdminLoading(false));
  }, [user?.role]);

  useEffect(() => {
    if (active !== 'payments' || user?.role !== 'ADMIN') return;

    let disposed = false;
    const refreshPayments = () => {
      Promise.all([
        adminService.getPayments(0, 1000, ''),
        adminService.getOverview(),
      ]).then(([paymentData, overviewData]) => {
        if (disposed) return;
        setAdminPayments(paymentData.content || []);
        setOverview({ ...emptyOverview, ...overviewData });
      }).catch(() => { });
    };

    refreshPayments();
    const intervalId = window.setInterval(refreshPayments, 10_000);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [active, user?.role]);

  useEffect(() => {
    if (active !== 'logs' || user?.role !== 'ADMIN') return;

    let disposed = false;
    const refreshLogs = () => {
      adminService.getLogs(0, 100, '')
        .then(logData => {
          if (!disposed) setSystemLogs(logData.content || []);
        })
        .catch(() => {
          if (!disposed) setAdminError('Không tải được nhật ký hệ thống từ database.');
        });
    };

    refreshLogs();
    const intervalId = window.setInterval(refreshLogs, 10_000);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [active, user?.role]);

  const loadCosts = () => {
    adminCostService.getCosts(costPage, 10, costSearch, costFilterCategory, costFilterStatus)
      .then(res => {
        setCosts(res.content ?? []);
        setCostTotalPages(res.totalPages || 1);
      }).catch(() => { /* cost load failure handled by UI */ });
  };

  const loadCostDashboard = () => {
    setCostLoading(true);
    setCostError('');
    Promise.all([
      adminCostService.getDashboard(),
      adminCostService.getCategories()
    ]).then(([stats, categories]) => {
      setCostStats(stats);
      setCostCategories(categories ?? []);
    }).catch(() => {
      setCostError('Không tải được dữ liệu chi phí. Vui lòng thử lại.');
    }).finally(() => {
      setCostLoading(false);
    });
  };

  useEffect(() => {
    if (active === 'costs' && user?.role === 'ADMIN') {
      loadCostDashboard();
    }
  }, [active, user?.role]);

  useEffect(() => {
    if (active === 'costs' && user?.role === 'ADMIN') {
      loadCosts();
    }
  }, [active, user?.role, costPage, costSearch, costFilterCategory, costFilterStatus]);

  const revenueReport = useMemo(() => {
    const fromDate = parseDateInput(revenueFrom);
    const toDate = parseDateInput(revenueTo, true);
    const safeFrom = fromDate <= toDate ? fromDate : toDate;
    const safeTo = fromDate <= toDate ? toDate : fromDate;
    const rangePayments = adminPayments.filter(isReportablePayment).filter(item => {
      const date = paymentDate(item);
      return Boolean(date && date >= safeFrom && date <= safeTo);
    }).sort((a,b) => (paymentDate(b)?.getTime() || 0) - (paymentDate(a)?.getTime() || 0));
    const paidPayments = rangePayments.filter(item => item.status === 'PAID');
    const total = paidPayments.reduce((sum, item) => sum + Number(item.amount), 0);
    const pending = rangePayments.filter(item => item.status === 'PENDING').reduce((sum, item) => sum + Number(item.amount), 0);
    const paidCount = paidPayments.length;
    const plusCount = paidPayments.filter(item => ['plus', 'professional'].includes(String(item.planId).toLowerCase())).length;
    const enterpriseCount = paidPayments.filter(item => String(item.planId).toLowerCase() === 'enterprise').length;
    
    const dailyMap = paidPayments.reduce<Record<string, { amount: number; time: number }>>((acc, item) => {
      const date = paymentDate(item);
      const dateKey = formatShortDate(date);
      const current = acc[dateKey] || { amount: 0, time: date?.getTime() || 0 };
      acc[dateKey] = { amount: current.amount + Number(item.amount), time: current.time };
      return acc;
    }, {});
    
    const timeline = Object.entries(dailyMap)
      .map(([date, data]) => ({ date, revenue: Math.round(data.amount / 1000000), time: data.time }))
      .sort((a, b) => a.time - b.time);
      
    const planMap = paidPayments.reduce<Record<string, number>>((acc, item) => {
      const planName = !item.planId || item.planId === 'free' ? 'Free' : (item.planId === 'professional' || item.planId === 'plus') ? 'Plus' : item.planId === 'enterprise' ? 'Doanh nghiệp' : item.planId;
      acc[planName] = (acc[planName] || 0) + Number(item.amount);
      return acc;
    }, {});
    
    const revenueByPlan = Object.entries(planMap).map(([name, value]) => ({ name, value: Math.round(value / 1000000), amount: value })).sort((a, b) => b.amount - a.amount);
    
    const customerMap = paidPayments.reduce<Record<string, number>>((acc, item) => {
      const name = paymentCustomerName(item);
      acc[name] = (acc[name] || 0) + Number(item.amount);
      return acc;
    }, {});
    
    const topCustomers = Object.entries(customerMap).map(([name, value]) => ({ name, value: Math.round(value / 1000000) })).sort((a, b) => b.value - a.value).slice(0, 5);

    return { total, pending, paidCount, plusCount, enterpriseCount, rangeInvoices: rangePayments, timeline, revenueByPlan, topCustomers };
  }, [adminPayments, revenueFrom, revenueTo]);

  const dashboardKpis: KpiItem[] = [
    { label: 'Tổng số doanh nghiệp', value: number(adminTeams.length), detail: `+${number(overview.newTeamsThisMonth)} tháng này`, icon: Building2, tone: 'blue', trend: 'up' },
    { label: 'Tổng số người dùng', value: number(adminUsers.length), detail: `+${number(overview.newUsersThisMonth)} tháng này`, icon: Users, tone: 'violet', trend: 'up' },
    { label: 'Doanh thu tháng này', value: money(overview.revenueThisMonth), detail: 'Chỉ giao dịch xác thực', icon: DollarSign, tone: 'green', trend: 'up' },
    { label: 'Xưởng chờ duyệt', value: number(adminTeams.filter(t => t.verificationStatus === 'PENDING').length), detail: 'Cần xử lý', icon: AlertTriangle, tone: 'amber' },
  ];

  const systemTrendData = overview.systemTrendData || [];
  const orderStatusData = useMemo(
    () => Object.entries(overview.orderStatusCounts || {})
      .filter(([, value]) => Number(value) > 0)
      .map(([statusName, value]) => ({
        name: orderStatusLabels[statusName] || statusName,
        value: Number(value),
      })),
    [overview.orderStatusCounts]
  );
  const currentPeriodLabel = new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(new Date());
  const currentMonthCost = Number(costStats?.totalMonth ?? 0);
  const totalSystemCost = Number(costStats?.totalSystem ?? 0);
  const coreInfrastructureCost = (costStats?.categoryChart ?? [])
    .filter(item => ['Máy chủ & lưu trữ', 'Cơ sở dữ liệu', 'Tên miền & bảo mật'].includes(item.name))
    .reduce((sum, item) => sum + Number(item.value) * 1_000_000, 0);
  const platformServiceCost = Math.max(currentMonthCost - coreInfrastructureCost, 0);
  const currentCostTimeline = useMemo(() => {
    let cumulative = 0;
    return (costStats?.dailyChart ?? [])
      .filter(point => Number(point.amount) > 0)
      .map(point => {
        cumulative += Number(point.amount);
        return { ...point, cumulative: Number(cumulative.toFixed(2)) };
      });
  }, [costStats?.dailyChart]);
  const currentMonthCostShare = totalSystemCost > 0
    ? (currentMonthCost / totalSystemCost) * 100
    : 0;
  const filteredSystemLogs = systemLogs.filter(log => {
    if (logFilter === 'all') return true;
    const action = log.actionType.toLowerCase();
    if (logFilter === 'payment') return action.includes('payment');
    if (logFilter === 'security') return action.includes('lock') || action.includes('security') || action.includes('role');
    return action.includes('login');
  });
  const latestDatabaseUpdate = [
    ...adminPayments.map(item => item.paidAt || item.createdAt),
    ...adminUsers.map(item => item.createdAt),
    ...adminTeams.map(item => item.createdAt),
    ...systemLogs.map(item => item.createdAt),
    ...costs.map(item => item.createdAt),
  ]
    .map(getDate)
    .filter((date): date is Date => date !== null)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

  const exportDatabaseReport = async () => {
    try {
      const res = await adminService.exportAdminReportExcel();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `orca-admin-${formatDateInput(new Date())}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      window.alert('Không thể xuất báo cáo từ database.');
    }
  };

  const pendingRequests = adminTeams.filter(t => t.verificationStatus === 'PENDING');
  const approvedCompanies = adminTeams.filter(t => t.verificationStatus !== 'PENDING');

  const updateTeamVerification = async (teamId: string, nextStatus: 'APPROVED' | 'REJECTED') => {
    const rejectReason = nextStatus === 'REJECTED' ? window.prompt('Reject reason?') : '';
    if (nextStatus === 'REJECTED' && rejectReason === null) return;
    try {
      const updated = await adminService.updateTeamVerification(teamId, nextStatus, rejectReason || '');
      setAdminTeams(current => current.map(item => item.id === teamId ? { ...item, ...updated } : item));
    } catch { window.alert('Error updating status.'); }
  };

  const handleCreateUser = async () => {
    const username = window.prompt("Username:");
    if (!username) return;
    try {
      const created = await adminService.createUser({ username, email: '', fullName: '', role: 'MEMBER' });
      setAdminUsers(current => [created, ...current]);
    } catch { window.alert("Error creating user."); }
  };

  const handleResetPassword = async (userId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn tạo mật khẩu mới cho người dùng này?')) return;
    try {
      const res = await adminService.resetUserPassword(userId);
      window.alert(`Mật khẩu mới: ${res.password}\n\nVui lòng lưu lại và gửi cho người dùng.`);
    } catch {
      window.alert('Lỗi khi cấp lại mật khẩu.');
    }
  };

  const handleToggleLock = async (user: AdminUser) => {
    const action = user.status === 'Locked' ? 'mở khóa' : 'khóa';
    if (!window.confirm(`Bạn có chắc chắn muốn ${action} tài khoản này?`)) return;
    try {
      const updated = await adminService.updateUserLock(user.id, user.status !== 'Locked');
      setAdminUsers(current => current.map(u => u.id === user.id ? { ...u, ...updated } : u));
    } catch {
      window.alert(`Lỗi khi ${action} tài khoản.`);
    }
  };

  const handleToggleSuspendCompany = async (team: AdminTeam) => {
    const isLocked = team.published === false;
    const action = isLocked ? 'khôi phục' : 'đình chỉ';
    if (!window.confirm(`Bạn có chắc chắn muốn ${action} công ty này?`)) return;
    try {
      if (isLocked) {
        const updated = await adminService.updateTeamPublication(team.id, true);
        setAdminTeams(current => current.map(t => t.id === team.id ? { ...t, ...updated } : t));
      } else {
        await adminService.deleteTeam(team.id);
        setAdminTeams(current => current.map(t => t.id === team.id ? { ...t, published: false } : t));
      }
    } catch {
      window.alert(`Lỗi khi ${action} công ty.`);
    }
  };

  const handleUpdateServiceCost = async (team: AdminTeam) => {
    const cost = window.prompt('Nhập chi phí dịch vụ/triển khai mới (VNĐ):', String(team.serviceCost || 0));
    if (cost === null) return;
    try {
      const updated = await adminService.updateTeam(team.id, { serviceCost: Number(cost) });
      setAdminTeams(current => current.map(t => t.id === team.id ? { ...t, ...updated } : t));
    } catch {
      window.alert('Lỗi khi cập nhật chi phí dịch vụ.');
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="admin-access">
        <ShieldCheck size={40} />
        <h1>Từ chối truy cập</h1>
        <p>Bạn cần quyền Quản trị viên để xem bảng điều khiển này.</p>
      </div>
    );
  }

  if (adminLoading) {
    return (
      <div className="admin-access">
        <Activity size={40} />
        <h1>Đang tải thống kê nền tảng</h1>
        <p>Đang kết nối tới cơ sở dữ liệu bảo mật...</p>
      </div>
    );
  }

  if (adminError) {
    return (
      <div className="admin-access">
        <AlertTriangle size={40} />
        <h1>Lỗi tải bảng điều khiển</h1>
        <p>{adminError}</p>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <main className="admin-main">
        <div className="admin-main-inner">
          <header className="admin-hero">
            <div>
              <h1>{sidebarModules.find(m => m.id === active)?.label || 'Dashboard'}</h1>
              <p>{active === 'costs'
                ? 'Theo dõi chi phí hạ tầng và dịch vụ vận hành nền tảng ORCA.'
                : 'Quản lý cấu hình nền tảng, theo dõi hoạt động và hỗ trợ khách hàng của bạn.'}</p>
            </div>
            <div className="admin-hero-actions">
              {active === 'users' && <button className="admin-button admin-button-primary" onClick={handleCreateUser}><Plus size={16} /> Thêm người dùng</button>}
              {active === 'overview' && <button className="admin-button admin-button-secondary" onClick={async () => {
                try {
                  const res = await adminService.exportAdminReportExcel();
                  const url = window.URL.createObjectURL(new Blob([res.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', 'admin-report.xlsx');
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                } catch (e) {
                  alert('Lỗi xuất dữ liệu');
                }
              }}><Download size={16} /> Xuất dữ liệu</button>}
            </div>
          </header>

          {active === 'overview' && (
            <>
              <section className="admin-kpi-grid">
                {dashboardKpis.map(item => <KpiCard key={item.label} item={item} />)}
              </section>
              <section className="admin-grid-2">
                <ChartPanel title="Doanh thu theo tháng (triệu VNĐ)">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={systemTrendData}>
                      <defs>
                        <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartPalette.categorical[1]} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={chartPalette.categorical[1]} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartPalette.grid} />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} stroke={chartPalette.muted} />
                      <YAxis axisLine={false} tickLine={false} stroke={chartPalette.muted} />
                      <Tooltip formatter={revenueMillionsFormatter} />
                      <Area type="monotone" name="Doanh thu" dataKey="revenue" stroke={chartPalette.categorical[1]} strokeWidth={3} fillOpacity={1} fill="url(#revFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartPanel>
                <ChartPanel title="Người dùng & doanh nghiệp mới theo tháng">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={systemTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartPalette.grid} />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} stroke={chartPalette.muted} />
                      <YAxis axisLine={false} tickLine={false} yAxisId="left" stroke={chartPalette.muted} />
                      <YAxis axisLine={false} tickLine={false} yAxisId="right" orientation="right" stroke={chartPalette.muted} />
                      <Tooltip formatter={(value, name) => [number(Number(value)), String(name)]} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Line yAxisId="left" type="monotone" name="Người dùng mới" dataKey="users" stroke={chartPalette.categorical[0]} strokeWidth={3} dot={{ r: 3 }} />
                      <Line yAxisId="right" type="monotone" name="Doanh nghiệp mới" dataKey="companies" stroke={chartPalette.categorical[4]} strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </section>
            </>
          )}

          {active === 'workspace_requests' && (
            <section className="admin-card">
              <div className="admin-card-head">
                <div><h3>Yêu cầu chờ duyệt</h3><p>Xem xét và xác minh đăng ký công ty mới.</p></div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Tên công ty</th><th>Chủ sở hữu</th><th>Thông tin kinh doanh</th><th>Ngày đăng ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {pendingRequests.length === 0 ? (
                      <tr><td colSpan={6} style={{textAlign:'center', padding:'32px', color:'#6b7280'}}>Không có yêu cầu chờ duyệt.</td></tr>
                    ) : pendingRequests.map(item => (
                      <tr key={item.id}>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.ownerName || '-'}</td>
                        <td>
                          <div style={{fontSize:'12px', color:'#6b7280'}}>
                            <div>GPKD: {maskLicense(item.businessLicense)}</div>
                            <div>Địa chỉ: {(item.businessAddress || '-').replace(/\s*\([Dd]ữ liệu minh h[oọ][aạ]\)/gi, '')}</div>
                          </div>
                        </td>
                        <td>{item.createdAt ? formatShortDate(item.createdAt) : '-'}</td>
                        <td><StatusBadge value={item.verificationStatus || 'PENDING'} /></td>
                        <td>
                          <div className="admin-row-actions">
                            <button className="admin-button admin-button-primary" onClick={() => updateTeamVerification(item.id, 'APPROVED')} style={{padding:'4px 10px', fontSize:'12px'}}>Duyệt</button>
                            <button className="admin-button admin-button-secondary" onClick={() => updateTeamVerification(item.id, 'REJECTED')} style={{padding:'4px 10px', fontSize:'12px'}}>Từ chối</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {active === 'companies' && (
            <section className="admin-card">
              <div className="admin-card-head">
                <div><h3>Công ty đã duyệt</h3><p>Quản lý tất cả các tổ chức đang hoạt động trên nền tảng.</p></div>
              </div>
              <div className="admin-toolbar">
                <div className="admin-search-input"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm kiếm công ty..." /></div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Công ty</th><th>Mã Workspace</th><th>Chủ sở hữu</th><th>Thành viên</th><th>Chi phí dịch vụ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {approvedCompanies.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).map(item => (
                      <tr key={item.id} style={{ opacity: item.published === false ? 0.5 : 1 }}>
                        <td><strong>{item.name}</strong></td>
                        <td><code style={{background:'rgba(255,255,255,0.1)', color: 'inherit', padding:'4px 8px', borderRadius:'6px', fontSize:'12px', fontWeight: 600, letterSpacing: '0.5px'}}>{item.id.slice(0,8)}</code></td>
                        <td>{item.ownerName || '-'}</td>
                        <td>{item.memberCount} users</td>
                        <td>
                          <button className="btn-icon" style={{width: 'auto', padding: '4px 8px', fontSize: 12}} onClick={() => handleUpdateServiceCost(item)}>
                            {money(item.serviceCost || 0)}
                          </button>
                        </td>
                        <td><StatusBadge value={item.published === false ? "Locked" : "Active"} /></td>
                        <td>
                          <div className="admin-row-actions">
                            <button className="btn-icon" title="Xem" onClick={() => window.alert('Chi tiết: ' + item.description)}><FileText size={16}/></button>
                            <button className="btn-icon danger" title={item.published === false ? "Khôi phục" : "Đình chỉ"} onClick={() => handleToggleSuspendCompany(item)}><Lock size={16}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {active === 'users' && (
            <section className="admin-card">
              <div className="admin-card-head">
                <div><h3>Người dùng nền tảng</h3><p>Quản lý tất cả tài khoản đã đăng ký trên hệ thống.</p></div>
              </div>
              <div className="admin-toolbar">
                <div className="admin-search-input"><Search size={16}/><input value={query} onChange={e=>{setQuery(e.target.value); setUserPage(1);}} placeholder="Tìm kiếm tên, email..." /></div>
                <OrcaSelect
                  aria-label="Lọc theo vai trò"
                  value={status}
                  onChange={e => { setStatus(e.target.value); setUserPage(1); }}
                  options={[
                    { value: 'All', label: 'Tất cả vai trò' },
                    { value: 'ADMIN', label: 'Quản trị viên' },
                    { value: 'FACTORY_OWNER', label: 'Chủ xưởng' },
                    { value: 'MEMBER', label: 'Thành viên' },
                  ]}
                />
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Người dùng</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {(() => {
                      const filteredUsers = adminUsers.filter(u => `${u.fullName} ${u.email}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All' || u.role === status));
                      const paginatedUsers = filteredUsers.slice((userPage - 1) * 10, userPage * 10);
                      return paginatedUsers.map(item => (
                        <tr key={item.id}>
                          <td><div className="admin-user-cell"><div className="admin-user-avatar">{(item.fullName || item.username || '?').charAt(0)}</div><strong>{item.fullName || item.username}</strong></div></td>
                          <td>{maskEmail(item.email)}</td>
                          <td><StatusBadge value={item.role} /></td>
                          <td><StatusBadge value={item.status || 'Active'} /></td>
                          <td>{item.createdAt ? formatShortDate(item.createdAt) : '-'}</td>
                          <td>
                            <div className="admin-row-actions">
                              <button className="btn-icon" title="Cấp lại mật khẩu" onClick={() => handleResetPassword(item.id)}><RotateCcw size={16}/></button>
                              <button className="btn-icon danger" title={item.status === 'Locked' ? "Mở khóa tài khoản" : "Khóa tài khoản"} onClick={() => handleToggleLock(item)}><Lock size={16}/></button>
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
              {(() => {
                const filteredUsers = adminUsers.filter(u => `${u.fullName} ${u.email}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All' || u.role === status));
                const totalPages = Math.max(1, Math.ceil(filteredUsers.length / 10));
                return (
                  <div className="admin-pagination">
                    <span>Đang hiển thị {filteredUsers.length} bản ghi</span>
                    <div className="admin-pagination-buttons">
                      <button disabled={userPage <= 1} onClick={() => setUserPage(p => Math.max(1, p - 1))}>&lt;</button>
                      <button className="active">{userPage} / {totalPages}</button>
                      <button disabled={userPage >= totalPages} onClick={() => setUserPage(p => Math.min(totalPages, p + 1))}>&gt;</button>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {active === 'subscriptions' && (
            <>
              <div className="admin-hero" style={{marginBottom: 16}}>
                <div><h3>Gói dịch vụ</h3><p>Quản lý các mức giá, giới hạn và tính năng.</p></div>
                <button className="admin-button admin-button-primary" onClick={() => {
                  setEditingPlan(null);
                  setIsPlanModalOpen(true);
                }}><Plus size={16} /> Tạo gói mới</button>
              </div>
              <section className="admin-plan-grid">
                {plans.map(item => (
                  <article className="admin-plan" key={item.name}>
                    <h4>{item.name}</h4>
                    <div className="price">{item.price ? money(item.price) : 'Liên hệ'} <span style={{fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)'}}>/ {item.period}</span></div>
                    <div className="admin-plan-limits">
                      <div className="admin-plan-limit-item"><span>Tối đa người dùng</span><strong>{number(item.users)}</strong></div>
                      <div className="admin-plan-limit-item"><span>Tối đa đơn hàng</span><strong>{number(item.orders)}</strong></div>
                      <div className="admin-plan-limit-item"><span>Số xưởng con</span><strong>{item.workshops}</strong></div>
                      <div className="admin-plan-limit-item"><span>Điểm AI</span><strong>{number(item.ai)}</strong></div>
                    </div>
                    <div className="admin-row-actions" style={{marginTop: 20}}>
                      <button className="admin-button admin-button-secondary" style={{width:'100%'}} onClick={() => {
                        setEditingPlan(item);
                        setIsPlanModalOpen(true);
                      }}>Chỉnh sửa</button>
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}

          {active === 'payments' && (
            <>
              <section className="admin-mini-grid">
                <MiniMetric label="Tổng doanh thu" value={money(revenueReport.total)} icon={DollarSign} />
                <MiniMetric label="Gói đã bán" value={number(revenueReport.paidCount)} icon={CreditCard} />
                <MiniMetric label="Gói Plus" value={number(revenueReport.plusCount)} icon={Wallet} />
                <MiniMetric label="Gói Doanh nghiệp" value={number(revenueReport.enterpriseCount)} icon={Building2} />
                <MiniMetric label="Đang chờ xử lý" value={money(revenueReport.pending)} icon={AlertTriangle} />
              </section>
              <section className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <h3>Lịch sử giao dịch</h3>
                    <p>
                      Từ {formatShortDate(parseDateInput(revenueFrom))} đến {formatShortDate(parseDateInput(revenueTo))}
                      {' • '}Hiển thị 10 giao dịch gần nhất trong {number(revenueReport.rangeInvoices.length)} giao dịch.
                    </p>
                  </div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Mã GD</th><th>Công ty/Người dùng</th><th>Gói</th><th>Số tiền</th><th>Ngày tháng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                    <tbody>
                      {revenueReport.rangeInvoices.slice(0,10).map(item => (
                        <tr key={item.id}>
                          <td><code style={{fontSize:12}}>{item.txnRef}</code></td>
                          <td><strong>{paymentCustomerName(item)}</strong></td>
                          <td>{item.planId}</td>
                          <td>{money(Number(item.amount))}</td>
                          <td>{formatShortDate(paymentDate(item))}</td>
                          <td><StatusBadge value={String(item.status)} /></td>
                          <td><button className="admin-button admin-button-secondary" style={{padding:'4px 8px', fontSize:12}} onClick={() => setViewingReceipt(item)}>Biên lai</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {active === 'costs' && (
            <>
              {costLoading ? (
                <div className="admin-access" style={{ minHeight: '400px' }}>
                  <Activity size={40} className="spin" />
                  <h2 style={{ marginTop: 16 }}>Đang tải dữ liệu chi phí...</h2>
                </div>
              ) : costError ? (
                <div className="admin-access" style={{ minHeight: '400px' }}>
                  <AlertTriangle size={40} color="#ef4444" />
                  <h2 style={{ marginTop: 16 }}>Đã xảy ra lỗi</h2>
                  <p style={{ color: '#6b7280', marginBottom: 24 }}>{costError}</p>
                  <button className="admin-button admin-button-primary" onClick={loadCostDashboard}><RotateCcw size={16}/> Thử lại</button>
                </div>
              ) : costStats && (costStats.totalSystem === 0 && costs.length === 0) ? (
                <div className="admin-access" style={{ minHeight: '400px' }}>
                  <Wallet size={48} color="#9ca3af" />
                  <h2 style={{ marginTop: 16 }}>📊 Chưa có dữ liệu chi phí</h2>
                  <p style={{ color: '#6b7280', marginBottom: 24 }}>Hệ thống chưa ghi nhận khoản chi phí nào.</p>
                  <button className="admin-button admin-button-primary" onClick={() => { setEditingCost(null); setIsCostModalOpen(true); }}><Plus size={16}/> Thêm chi phí</button>
                </div>
              ) : (
                <>
                  {costStats && (
                    <section className="admin-kpi-grid">
                      <KpiCard item={{ label: 'Tổng chi hôm nay', value: money(Number(costStats.totalToday ?? 0)), detail: 'Phát sinh trong ngày', icon: Wallet, tone: 'blue' }} />
                      <KpiCard item={{ label: 'Chi phí tháng này', value: money(currentMonthCost), detail: `Hạ tầng ORCA · ${currentPeriodLabel}`, icon: Receipt, tone: 'green' }} />
                      <KpiCard item={{ label: 'Hạ tầng cốt lõi', value: money(coreInfrastructureCost), detail: 'Máy chủ, dữ liệu và bảo mật', icon: ServerCrash, tone: 'amber' }} />
                      <KpiCard item={{ label: 'Dịch vụ nền tảng', value: money(platformServiceCost), detail: 'AI, email và giám sát', icon: Activity, tone: 'violet' }} />
                    </section>
                  )}

                  {costStats && (
                    <section className="admin-cost-budget">
                      <div className="admin-cost-budget__head">
                        <div className="admin-cost-budget__title">
                          <span><ShieldCheck size={19} /></span>
                          <div>
                            <h3>Đối soát chi phí hạ tầng tháng {currentPeriodLabel}</h3>
                            <p>Tỷ trọng chi phí tháng hiện tại trên toàn bộ chi phí đã ghi nhận trong database.</p>
                          </div>
                        </div>
                        <strong>{money(currentMonthCost)} <small>/ {money(totalSystemCost)}</small></strong>
                      </div>
                      <div
                        className="admin-cost-budget__track"
                        role="progressbar"
                        aria-label="Tỷ trọng chi phí tháng hiện tại"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(currentMonthCostShare)}
                      >
                        <span style={{ width: `${Math.min(currentMonthCostShare, 100)}%` }} />
                      </div>
                      <div className="admin-cost-budget__meta">
                        <span>Tháng này chiếm <strong>{currentMonthCostShare.toFixed(1)}%</strong></span>
                        <span>Tổng đã ghi nhận <strong>{money(totalSystemCost)}</strong></span>
                      </div>
                    </section>
                  )}

                  <section className="admin-grid-2">
                    <ChartPanel title={`Chi phí hạ tầng lũy kế tháng ${currentPeriodLabel}`}>
                      {currentCostTimeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <AreaChart data={currentCostTimeline}>
                            <defs>
                              <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartPalette.categorical[3]} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={chartPalette.categorical[3]} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartPalette.grid} />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} stroke={chartPalette.muted} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} stroke={chartPalette.muted} />
                            <Tooltip formatter={millionsFormatter} />
                            <Legend verticalAlign="top" height={36}/>
                            <Area type="monotone" name="Lũy kế (Triệu VND)" dataKey="cumulative" stroke={chartPalette.categorical[3]} strokeWidth={3} fillOpacity={1} fill="url(#costFill)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>Không đủ dữ liệu</div>}
                    </ChartPanel>

                    <ChartPanel title="Chi phí hạ tầng phát sinh theo ngày">
                      {currentCostTimeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={currentCostTimeline}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartPalette.grid} />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} stroke={chartPalette.muted} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} stroke={chartPalette.muted} />
                            <Tooltip formatter={millionsFormatter} />
                            <Legend verticalAlign="top" height={36}/>
                            <Line type="monotone" name="Chi phí (Triệu VND)" dataKey="amount" stroke={chartPalette.categorical[2]} strokeWidth={3} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>Không đủ dữ liệu</div>}
                    </ChartPanel>

                    <ChartPanel title="Cơ cấu chi phí theo danh mục">
                      {costStats?.categoryChart && costStats.categoryChart.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie data={costStats.categoryChart ?? []} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={58} outerRadius={94} paddingAngle={3}>
                              {(costStats.categoryChart ?? []).map((_, index) => (
                                <Cell key={`cell-${index}`} fill={chartPalette.categorical[index % chartPalette.categorical.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={millionsFormatter} />
                            <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                        </ResponsiveContainer>
                      ) : <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>Không đủ dữ liệu</div>}
                    </ChartPanel>

                    <ChartPanel title="Top 5 nhóm chi phí">
                      {costStats?.categoryChart && costStats.categoryChart.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={(costStats.categoryChart ?? []).slice(0, 5)} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartPalette.grid} />
                            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} stroke={chartPalette.muted} />
                            <YAxis type="category" dataKey="name" width={126} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} stroke={chartPalette.muted} />
                            <Tooltip formatter={millionsFormatter} />
                            <Bar dataKey="value" name="Chi phí (Triệu VND)" fill={chartPalette.categorical[4]} radius={[0, 6, 6, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <div style={{textAlign: 'center', padding: '40px', color: '#9ca3af'}}>Không đủ dữ liệu</div>}
                    </ChartPanel>
                  </section>
                  
                  <section className="admin-card">
                    <div className="admin-card-head">
                      <div><h3>Chi tiết chi phí hạ tầng</h3><p>Các khoản máy chủ, dữ liệu và dịch vụ kỹ thuật phục vụ nền tảng ORCA.</p></div>
                      <div className="admin-row-actions">
                        <button className="admin-button admin-button-secondary" onClick={() => setIsCostCategoryModalOpen(true)}>Quản lý Danh mục</button>
                        <button className="admin-button admin-button-primary" onClick={() => { setEditingCost(null); setIsCostModalOpen(true); }}><Plus size={16}/> Thêm khoản chi</button>
                        <button className="admin-button admin-button-secondary" onClick={async () => {
                            try {
                                const res = await adminService.exportAdminReportExcel();
                                const url = window.URL.createObjectURL(new Blob([res.data]));
                                const link = document.createElement('a');
                                link.href = url;
                                link.setAttribute('download', 'admin-report.xlsx');
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                            } catch (e) {
                                alert('Lỗi xuất báo cáo');
                            }
                        }}><Download size={16}/> Xuất Excel</button>
                      </div>
                    </div>
                    
                    <div className="admin-toolbar">
                      <div className="admin-search-input"><Search size={16}/><input value={costSearch} onChange={e => {setCostSearch(e.target.value); setCostPage(0);}} placeholder="Tìm kiếm tên, mô tả..." /></div>
                      <OrcaSelect
                        aria-label="Lọc theo danh mục"
                        value={costFilterCategory}
                        onChange={e => { setCostFilterCategory(e.target.value); setCostPage(0); }}
                        options={[
                          { value: '', label: 'Tất cả danh mục' },
                          ...costCategories.map(c => ({ value: c.id, label: c.name })),
                        ]}
                      />
                      <OrcaSelect
                        aria-label="Lọc theo trạng thái"
                        value={costFilterStatus}
                        onChange={e => { setCostFilterStatus(e.target.value); setCostPage(0); }}
                        options={[
                          { value: '', label: 'Tất cả trạng thái' },
                          { value: 'PAID', label: 'Đã thanh toán' },
                          { value: 'PENDING', label: 'Chờ thanh toán' },
                          { value: 'CANCELLED', label: 'Đã hủy' },
                        ]}
                      />
                    </div>

                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead><tr><th>Ngày</th><th>Tên khoản chi</th><th>Danh mục</th><th>Số tiền</th><th>Người tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                        <tbody>
                          {costs.length === 0 ? (
                            <tr><td colSpan={7} style={{textAlign:'center', padding:'32px', color:'#6b7280'}}>Không có khoản chi nào phù hợp.</td></tr>
                          ) : costs.map(item => (
                            <tr key={item.id}>
                              <td>{formatShortDate(item.date)}</td>
                              <td><strong>{item.name}</strong><br/><small style={{color:'#6b7280'}}>{item.description}</small></td>
                              <td>{item.category?.name || '-'}</td>
                              <td>{money(item.amount)}</td>
                              <td>{item.payer || item.createdBy || '-'}</td>
                              <td><StatusBadge value={item.status} /></td>
                              <td>
                                <div className="admin-row-actions">
                                  <button className="btn-icon" title="Sửa" onClick={() => { setEditingCost(item); setIsCostModalOpen(true); }}><Edit2 size={16}/></button>
                                  <button className="btn-icon danger" title="Xóa" onClick={() => {
                                    if(window.confirm('Bạn có chắc chắn muốn xóa khoản chi này?')) {
                                      adminCostService.deleteCost(item.id).then(() => {
                                        loadCostDashboard();
                                        loadCosts();
                                      });
                                    }
                                  }}><Trash2 size={16}/></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {costTotalPages > 1 && (
                      <div className="admin-pagination">
                        <span>Trang {costPage + 1} / {costTotalPages}</span>
                        <div className="admin-pagination-buttons">
                          <button disabled={costPage === 0} onClick={() => setCostPage(p => p - 1)}>&lt;</button>
                          <button className="active">{costPage + 1}</button>
                          <button disabled={costPage >= costTotalPages - 1} onClick={() => setCostPage(p => p + 1)}>&gt;</button>
                        </div>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}

          {active === 'reports' && (
            <>
              <div className="admin-kpi-grid" style={{ marginBottom: '24px' }}>
                <KpiCard item={{ label: 'Tổng người dùng', value: number(overview.totalUsers), detail: `+${overview.newUsersThisMonth} tháng này`, icon: Users, tone: 'blue', trend: 'up' }} />
                <KpiCard item={{ label: 'Doanh thu tháng này', value: money(overview.revenueThisMonth), detail: `Tổng: ${money(overview.revenueTotal)}`, icon: DollarSign, tone: 'green', trend: 'up' }} />
                <KpiCard item={{ label: 'Tổng thanh toán', value: number(overview.paidPayments), detail: 'Giao dịch thành công', icon: CreditCard, tone: 'violet', trend: 'up' }} />
              </div>

              <div className="admin-grid-2" style={{ marginBottom: '24px' }}>
                <ChartPanel title="Tăng trưởng theo tháng">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={overview.systemTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartPalette.grid} />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: chartPalette.muted }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: chartPalette.muted }} />
                      <Tooltip formatter={(value, name) => [number(Number(value)), String(name)]} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      <Line type="monotone" dataKey="users" name="Người dùng mới" stroke={chartPalette.categorical[0]} strokeWidth={3} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="companies" name="Doanh nghiệp mới" stroke={chartPalette.categorical[4]} strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartPanel>

                <ChartPanel title="Phân bổ trạng thái đơn hàng">
                  {orderStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={orderStatusData}
                          cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                        >
                          {orderStatusData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={chartPalette.categorical[index % chartPalette.categorical.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [number(Number(value)), String(name)]} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="admin-chart-empty">Chưa có đơn hàng để thống kê.</div>
                  )}
                </ChartPanel>
              </div>

              <section className="admin-card">
                <div className="admin-card-head">
                  <div><h3>Xuất dữ liệu & Báo cáo</h3><p>Tạo các báo cáo phân tích hiệu suất của nền tảng.</p></div>
                </div>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Loại báo cáo</th><th>Mô tả</th><th>Tạo lần cuối</th><th>Thao tác</th></tr></thead>
                    <tbody>
                      <tr>
                        <td><strong>Báo cáo tổng hợp hệ thống</strong></td>
                        <td>{number(overview.totalUsers)} người dùng · {number(overview.totalTeams)} doanh nghiệp · {number(overview.paidPayments)} thanh toán thành công</td>
                        <td>{latestDatabaseUpdate ? `${formatShortDate(latestDatabaseUpdate)} ${latestDatabaseUpdate.toLocaleTimeString('vi-VN')}` : 'Chưa có dữ liệu'}</td>
                        <td><button className="admin-button admin-button-secondary" style={{padding:'4px 12px'}} onClick={exportDatabaseReport}><Download size={14}/> Excel</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {active === 'logs' && (
            <section className="admin-card">
              <div className="admin-card-head">
                <div><h3>Nhật ký hệ thống</h3><p>Theo dõi hoạt động và bảo mật của nền tảng.</p></div>
                <div className="admin-toolbar" style={{margin:0}}>
                  <OrcaSelect
                    aria-label="Lọc nhật ký"
                    value={logFilter}
                    onChange={event => setLogFilter(event.target.value)}
                    options={[
                      { value: 'all', label: 'Tất cả sự kiện' },
                      { value: 'login', label: 'Đăng nhập' },
                      { value: 'payment', label: 'Thanh toán' },
                      { value: 'security', label: 'Bảo mật' },
                    ]}
                  />
                </div>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Thời gian</th><th>Loại sự kiện</th><th>Người thực hiện</th><th>Đối tượng dữ liệu</th><th>Chi tiết</th></tr></thead>
                  <tbody>
                    {filteredSystemLogs.map(log => (
                      <tr key={log.id}>
                        <td>{formatShortDate(log.createdAt)} {formatTime(log.createdAt)}</td>
                        <td><strong>{log.actionType}</strong></td>
                        <td>{log.actorName || 'Hệ thống'}</td>
                        <td><code style={{fontSize: 11}}>{log.targetId || '-'}</code></td>
                        <td>{log.details || '-'}</td>
                      </tr>
                    ))}
                    {filteredSystemLogs.length === 0 && <tr><td colSpan={5} style={{textAlign: 'center', padding: '20px'}}>Không có dữ liệu nhật ký phù hợp.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      </main>


      {/* Receipt Modal */}
      {viewingReceipt && (
        <div className="modal-overlay" onClick={() => setViewingReceipt(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 450}}>
            <div className="modal-header">
              <h2>Biên lai thanh toán</h2>
              <button className="modal-close" onClick={() => setViewingReceipt(null)}>&times;</button>
            </div>
            <div className="modal-body" style={{padding: '24px 0'}}>
              <div style={{textAlign: 'center', marginBottom: '24px'}}>
                <div style={{
                  width: '60px', height: '60px', borderRadius: '50%', 
                  background: viewingReceipt.status === 'PAID' ? '#dcfce7' : '#fef08a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  {viewingReceipt.status === 'PAID' ? <ShieldCheck size={32} color="#16a34a" /> : <AlertTriangle size={32} color="#ca8a04" />}
                </div>
                <h3 style={{fontSize: '24px', margin: '0 0 8px'}}>{money(Number(viewingReceipt.amount))}</h3>
                <p style={{color: '#6b7280', margin: 0}}>{viewingReceipt.status === 'PAID' ? 'Đã thanh toán thành công' : 'Đang chờ xử lý'}</p>
              </div>
              <div style={{borderTop: '1px dashed #e5e7eb', borderBottom: '1px dashed #e5e7eb', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6b7280'}}>Mã giao dịch</span>
                  <strong>{viewingReceipt.txnRef}</strong>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6b7280'}}>Ngày thanh toán</span>
                  <strong>{formatShortDate(paymentDate(viewingReceipt))}</strong>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6b7280'}}>Phương thức</span>
                  <strong>{viewingReceipt.paymentMethod || viewingReceipt.bankCode || 'VNPAY'}</strong>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6b7280'}}>Khách hàng</span>
                  <strong>{paymentCustomerName(viewingReceipt)}</strong>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{color: '#6b7280'}}>Gói dịch vụ</span>
                  <strong style={{textTransform: 'uppercase'}}>{viewingReceipt.planId}</strong>
                </div>
              </div>
              <div style={{padding: '24px 24px 0', display: 'flex', gap: '12px'}}>
                <button className="admin-button admin-button-secondary" style={{flex: 1}} onClick={() => setViewingReceipt(null)}>Đóng</button>
                <button className="admin-button admin-button-primary" style={{flex: 1}} onClick={() => window.print()}><Download size={16} /> In biên lai</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPlanModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>{editingPlan ? 'Chỉnh sửa gói dịch vụ' : 'Tạo gói mới'}</h3>
              <button className="btn-icon" onClick={() => setIsPlanModalOpen(false)}>✕</button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label>Tên gói</label>
                <input type="text" className="admin-input" defaultValue={editingPlan?.name} placeholder="VD: Doanh nghiệp" />
              </div>
              <div className="admin-form-group">
                <label>Giá (VNĐ)</label>
                <input type="number" className="admin-input" defaultValue={editingPlan?.price} placeholder="VD: 500000" />
              </div>
              <div className="admin-form-group">
                <label>Chu kỳ</label>
                <OrcaSelect
                  fullWidth
                  defaultValue={editingPlan?.period || 'Tháng'}
                  options={[
                    { value: 'Tháng', label: 'Tháng' },
                    { value: 'Năm', label: 'Năm' },
                    { value: 'Liên hệ', label: 'Liên hệ' },
                  ]}
                />
              </div>
              <div className="admin-form-group">
                <label>Giới hạn người dùng</label>
                <input type="number" className="admin-input" defaultValue={editingPlan?.users} />
              </div>
              <div className="admin-form-group">
                <label>Giới hạn đơn hàng</label>
                <input type="number" className="admin-input" defaultValue={editingPlan?.orders} />
              </div>
              <div className="admin-form-group">
                <label>Số xưởng con</label>
                <input type="number" className="admin-input" defaultValue={editingPlan?.workshops} />
              </div>
              <div className="admin-form-group">
                <label>Điểm AI</label>
                <input type="number" className="admin-input" defaultValue={editingPlan?.ai} />
              </div>
              <div className="admin-form-group">
                <label>Tính năng nổi bật</label>
                <textarea className="admin-input" defaultValue={editingPlan?.features} placeholder="Phân cách bằng dấu phẩy"></textarea>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-button admin-button-secondary" onClick={() => setIsPlanModalOpen(false)}>Hủy</button>
              <button className="admin-button admin-button-primary" onClick={() => setIsPlanModalOpen(false)}>Lưu lại</button>
            </div>
          </div>
        </div>
      )}

      {isCostModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '600px' }}>
            <div className="admin-modal-header">
              <h3>{editingCost ? 'Sửa khoản chi' : 'Thêm khoản chi mới'}</h3>
              <button className="btn-icon" onClick={() => setIsCostModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const rawDate = formData.get('date') as string | null;
              const localIso = rawDate ? `${rawDate}:00` : new Date().toISOString().slice(0, 19);
              const costData = {
                name: formData.get('name'),
                categoryId: (formData.get('categoryId') as string) || undefined,
                amount: Number(formData.get('amount')),
                currency: 'VND',
                date: localIso,
                payer: formData.get('payer'),
                description: formData.get('description'),
                invoiceUrl: formData.get('invoiceUrl'),
                status: formData.get('status')
              };
              const req = editingCost
                ? adminCostService.updateCost(editingCost.id, costData)
                : adminCostService.createCost(costData);

              req.then(() => {
                setIsCostModalOpen(false);
                loadCostDashboard();
                loadCosts();
              }).catch(err => window.alert('Lỗi: ' + (err?.response?.data?.error || err?.response?.data?.message || err.message)));
            }}>
              <div className="admin-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Tên khoản chi *</label>
                  <input name="name" required type="text" className="admin-input" defaultValue={editingCost?.name} placeholder="VD: Mua server AWS tháng 7" />
                </div>
                <div className="admin-form-group">
                  <label>Danh mục</label>
                  <OrcaSelect
                    fullWidth
                    name="categoryId"
                    defaultValue={editingCost?.category?.id || ''}
                    options={[
                      { value: '', label: 'Chọn danh mục' },
                      ...costCategories.map(c => ({ value: c.id, label: c.name })),
                    ]}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Số tiền (VNĐ) *</label>
                  <input name="amount" required type="number" min="0" className="admin-input" defaultValue={editingCost?.amount} placeholder="VD: 5000000" />
                </div>
                <div className="admin-form-group">
                  <label>Ngày chi</label>
                  <input name="date" required type="datetime-local" className="admin-input" defaultValue={editingCost?.date ? new Date(editingCost.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)} />
                </div>
                <div className="admin-form-group">
                  <label>Người chi trả</label>
                  <input name="payer" type="text" className="admin-input" defaultValue={editingCost?.payer} placeholder="Tên người thanh toán" />
                </div>
                <div className="admin-form-group">
                  <label>Trạng thái</label>
                  <OrcaSelect
                    fullWidth
                    name="status"
                    defaultValue={editingCost?.status || 'PAID'}
                    options={[
                      { value: 'PAID', label: 'Đã thanh toán' },
                      { value: 'PENDING', label: 'Chờ thanh toán' },
                      { value: 'CANCELLED', label: 'Đã hủy' },
                    ]}
                  />
                </div>
                <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Đính kèm hóa đơn (URL)</label>
                  <input name="invoiceUrl" type="url" className="admin-input" defaultValue={editingCost?.invoiceUrl} placeholder="https://..." />
                </div>
                <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Mô tả chi tiết</label>
                  <textarea name="description" className="admin-input" defaultValue={editingCost?.description} placeholder="Ghi chú thêm về khoản chi này"></textarea>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button admin-button-secondary" onClick={() => setIsCostModalOpen(false)}>Hủy</button>
                <button type="submit" className="admin-button admin-button-primary">Lưu khoản chi</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCostCategoryModalOpen && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Quản lý Danh mục Chi phí</h3>
              <button className="btn-icon" onClick={() => setIsCostCategoryModalOpen(false)}>✕</button>
            </div>
            <div className="admin-modal-body">
              <form style={{ display: 'flex', gap: '8px', marginBottom: '20px' }} onSubmit={e => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                adminCostService.createCategory({ name: formData.get('name') as string, description: formData.get('description') as string })
                  .then(() => {
                    (e.target as HTMLFormElement).reset();
                    adminCostService.getCategories().then(setCostCategories);
                  }).catch(err => window.alert('Lỗi: ' + (err?.response?.data?.error || err?.response?.data?.message || err.message)));
              }}>
                <input name="name" required type="text" className="admin-input" placeholder="Tên danh mục mới" />
                <input name="description" type="text" className="admin-input" placeholder="Mô tả" />
                <button type="submit" className="admin-button admin-button-primary" style={{ whiteSpace: 'nowrap' }}>Thêm</button>
              </form>
              
              <table className="admin-table">
                <thead><tr><th>Tên danh mục</th><th>Mô tả</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {costCategories.map(cat => (
                    <tr key={cat.id}>
                      <td><strong>{cat.name}</strong></td>
                      <td>{cat.description}</td>
                      <td>
                        <button className="btn-icon danger" onClick={() => {
                          if (window.confirm('Xóa danh mục này?')) {
                            adminCostService.deleteCategory(cat.id).then(() => {
                              adminCostService.getCategories().then(setCostCategories);
                            }).catch(err => window.alert('Không thể xóa: ' + (err?.response?.data?.error || err?.response?.data?.message || err.message)));
                          }
                        }}><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

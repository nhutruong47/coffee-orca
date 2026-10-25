import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { teamService, goalService, taskService, getTrialStatus, chatService, inventoryService, notificationService } from '../services/groupService';
import { attendanceService } from '../services/attendanceService';
import type { AttendanceDTO, AttendanceSettingsDTO } from '../services/attendanceService';
import type { AttendanceCorrectionDTO } from '../services/attendanceService';
import { uploadFile } from '../services/api';
import type { Team, Goal, Task, ChatMsg, SalaryReport, PlanUsage } from '../types/types';

import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { estimateTokens, formatTokenCount } from '../utils/tokenUsage';
import {
    formatMemberIdentity,
    getDuplicateMemberNameKeys,
    getMemberCode,
    hasDuplicateMemberName,
} from '../utils/memberIdentity';
import './GroupDetailPage.css';
import PayrollPanel from '../components/payroll/PayrollPanel';

gsap.registerPlugin(useGSAP);

function getInitials(name: string) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function avatarColor(name: string) {
    const colors = ['#d4a574', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
    let hash = 0;
    for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
    return colors[hash];
}
function formatAttendanceHourValue(value: number | null | undefined) {
    return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}
function getInventoryProductName(item: any) {
    return item?.productType?.trim() || item?.displayName?.trim() || item?.name?.trim() || 'Sản phẩm chưa đặt tên';
}
function normalizeInventoryNumberInput(value: string) {
    const withoutGrouping = value.replace(/\./g, '');
    const sanitized = withoutGrouping.replace(/[^\d,]/g, '');
    const [integerPart = '', ...decimalParts] = sanitized.split(',');
    const hasDecimalSeparator = sanitized.includes(',');
    const decimalPart = decimalParts.join('');
    return hasDecimalSeparator ? `${integerPart}.${decimalPart}` : integerPart;
}
function formatInventoryNumberInput(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') return '';
    const canonical = String(value);
    const [integerPart = '', decimalPart] = canonical.split('.');
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decimalPart !== undefined ? `${groupedInteger},${decimalPart}` : groupedInteger;
}
const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: 'var(--warning-soft)', color: 'var(--warning)', label: 'Chờ xử lý' },
    IN_PROGRESS: { bg: 'var(--info-soft)', color: 'var(--info)', label: 'Đang làm' },
    BLOCKED: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: 'Bị khoá' },
    READY: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Sẵn sàng' },
    WAITING_APPROVAL: { bg: 'var(--warning-soft)', color: 'var(--warning)', label: 'Chờ duyệt' },
    COMPLETED: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Hoàn thành' },
    CANCELLED: { bg: 'var(--bg-input)', color: 'var(--text-secondary)', label: 'Đã huỷ' },
};
const MEMBER_COLORS = ['#d4a574', '#f59e0b', '#10b981', '#ec4899', '#f43f5e', '#06b6d4', '#8b5cf6', '#3b82f6'];
const DEFAULT_INVENTORY_UNITS = ['kg', 'g', 'tấn', 'cái', 'hộp', 'bao', 'chai', 'gói', 'thùng', 'lít', 'ml', 'cuộn', 'bộ'];

function InventoryUnitCombobox({
    value,
    options,
    onChange,
}: {
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const query = value.trim().toLocaleLowerCase('vi-VN');
    const hasExactMatch = options.some(unit =>
        unit.toLocaleLowerCase('vi-VN') === query
    );
    const visibleOptions = hasExactMatch
        ? options
        : options.filter(unit => !query || unit.toLocaleLowerCase('vi-VN').includes(query));

    useEffect(() => {
        if (!isOpen) return;
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        return () => document.removeEventListener('mousedown', closeOnOutsideClick);
    }, [isOpen]);

    return (
        <div className="inventory-unit-combobox" ref={rootRef}>
            <div className={`inventory-unit-combobox__control ${isOpen ? 'is-open' : ''}`}>
                <input
                    type="text"
                    value={value}
                    onChange={event => {
                        onChange(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Chọn hoặc nhập đơn vị mới..."
                    autoComplete="off"
                    aria-label="Đơn vị"
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                />
                <button
                    type="button"
                    aria-label={isOpen ? 'Đóng danh sách đơn vị' : 'Mở danh sách đơn vị'}
                    onClick={() => setIsOpen(current => !current)}
                >
                    <ion-icon name={isOpen ? 'chevron-up-outline' : 'chevron-down-outline'}></ion-icon>
                </button>
            </div>

            {isOpen && (
                <div className="inventory-unit-combobox__menu" role="listbox">
                    {query && !hasExactMatch && (
                        <button
                            type="button"
                            className="inventory-unit-combobox__custom"
                            onClick={() => setIsOpen(false)}
                        >
                            <ion-icon name="add-circle-outline"></ion-icon>
                            Dùng đơn vị “{value.trim()}”
                        </button>
                    )}
                    <div className="inventory-unit-combobox__options">
                        {visibleOptions.length > 0 ? visibleOptions.map(unit => (
                            <button
                                type="button"
                                role="option"
                                aria-selected={unit === value}
                                className={unit === value ? 'is-selected' : ''}
                                key={unit}
                                onClick={() => {
                                    onChange(unit);
                                    setIsOpen(false);
                                }}
                            >
                                <span>{unit}</span>
                                {unit === value && <ion-icon name="checkmark-outline"></ion-icon>}
                            </button>
                        )) : !query && (
                            <p>Chưa có đơn vị phù hợp.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GroupDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [team, setTeam] = useState<Team | null>(null);
    const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
    const [memberRoleFilter, setMemberRoleFilter] = useState<string>('ALL');
    const [teamRoles, setTeamRoles] = useState<string[]>([]);
    const [showManageRolesModal, setShowManageRolesModal] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [showAddMember, setShowAddMember] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [showCreateGoal, setShowCreateGoal] = useState(false);
    const [goalTitle, setGoalTitle] = useState('');
    const [goalTarget, setGoalTarget] = useState('');
    const [goalDeadline, setGoalDeadline] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [trialActive, setTrialActive] = useState(true);
    const [trialDays, setTrialDays] = useState(30);
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDesc, setNewTaskDesc] = useState('');
    const [newTaskWorkload, setNewTaskWorkload] = useState('');
    const [newTaskStage, setNewTaskStage] = useState('Roasting');
    const [newTaskUnit, setNewTaskUnit] = useState('');
    const [newTaskDueTime, setNewTaskDueTime] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState(2);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [editTaskTitle, setEditTaskTitle] = useState('');
    const [editTaskDesc, setEditTaskDesc] = useState('');
    const [editTaskStage, setEditTaskStage] = useState('Roasting');
    const [editTaskDueTime, setEditTaskDueTime] = useState('');
    const [editTaskPriority, setEditTaskPriority] = useState(2);
    const [editTaskUnit, setEditTaskUnit] = useState('');

    const inferUnitFromText = (text: string, stage?: string): string => {
        const lower = (text || '').toLowerCase();
        const map: { keys: string[]; unit: string }[] = [
            { keys: ['gói', 'goi', 'pack', 'package', 'packet', 'túi', 'tui', 'bịch', 'bich'], unit: 'gói' },
            { keys: ['hộp', 'hop', 'box', 'thùng', 'thung', 'carton'], unit: 'hộp' },
            { keys: ['chai', 'bottle', 'lọ', 'lo'], unit: 'chai' },
            { keys: ['tem', 'nhãn', 'nhan', 'label', 'sticker'], unit: 'tem' },
            { keys: ['mẫu', 'mau', 'sample'], unit: 'mẫu' },
            { keys: ['đơn', 'don', 'order', 'đơn hàng'], unit: 'đơn' },
        ];
        for (const m of map) {
            if (m.keys.some(k => lower.includes(k))) return m.unit;
        }
        const stageMap: Record<string, string> = {
            DONG_GOI: 'gói',
            Packaging: 'gói',
            DAN_TEM: 'tem',
            Labeling: 'tem',
            QA: 'mẫu',
            QC: 'mẫu',
            GIAO_HANG: 'đơn',
            Delivery: 'đơn',
            Shipping: 'đơn',
            Roasting: 'kg',
            RANG: 'kg',
            SAY: 'kg',
            Drying: 'kg',
        };
        if (stage && stageMap[stage]) return stageMap[stage];
        return 'kg';
    };

    // Ad Settings
    const [showAdSettings, setShowAdSettings] = useState(false);
    const [adSpecialty, setAdSpecialty] = useState('');
    const [adCapacity, setAdCapacity] = useState('');
    const [adRegion, setAdRegion] = useState('');
    const [isPublished, setIsPublished] = useState(false);

    // Job Labels
    const [showMemberRoles, setShowMemberRoles] = useState(false);
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [selectedMemberForLabels, setSelectedMemberForLabels] = useState<any>(null);
    const [editingLabels, setEditingLabels] = useState<string>('');

    // Inventory
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [showAddInventory, setShowAddInventory] = useState(false);
    const [showInventory, setShowInventory] = useState(false);
    const [showStockIn, setShowStockIn] = useState(false);
    const [showStockInProductMenu, setShowStockInProductMenu] = useState(false);
    const [stockInItemId, setStockInItemId] = useState('');
    const [stockInQty, setStockInQty] = useState('');
    const [invName, setInvName] = useState('');
    const [invUnit, setInvUnit] = useState('');
    const [invThreshold, setInvThreshold] = useState('');
    
    // For editing inventory product info
    const [editItem, setEditItem] = useState<any | null>(null);

    // Task Filtering
    const [taskFilter, setTaskFilter] = useState<'my' | 'all'>('all');

    const [showStatsModal, setShowStatsModal] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleView, setScheduleView] = useState<'overview' | 'calendar'>('overview');
    const scheduleModalRef = useRef<HTMLDivElement>(null);
    const [calendarDate, setCalendarDate] = useState(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1);
    });
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    });
    const selectedCalendarDay = selectedCalendarDate.getDate();
    const setSelectedCalendarDay = (day: number) => {
        const next = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
        next.setHours(0, 0, 0, 0);
        setSelectedCalendarDate(next);
    };

    useGSAP(() => {
        if (!showScheduleModal || !scheduleModalRef.current) return;
        const media = gsap.matchMedia();
        media.add('(prefers-reduced-motion: no-preference)', () => {
            const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
            timeline
                .fromTo('.schedule-modal-overlay', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 })
                .fromTo('.schedule-modal', { autoAlpha: 0, y: 16, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.24 }, '<')
                .fromTo('.schedule-modal__reveal', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.035 }, '-=0.1');
        });
        return () => media.revert();
    }, { scope: scheduleModalRef, dependencies: [showScheduleModal], revertOnUpdate: true });

    // Chat
    const [chatTab, setChatTab] = useState<'group' | 'dm'>('group');
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [dmUserId, setDmUserId] = useState<string | null>(null);
    const [showChat, setShowChat] = useState(false);
    const showChatTokens = false;
    const [chatExpanded, setChatExpanded] = useState(true);
    const [showVideoCall, setShowVideoCall] = useState(false);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [chatAttachment, setChatAttachment] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [unreadGroupCount, setUnreadGroupCount] = useState(0);
    const [unreadDmCounts, setUnreadDmCounts] = useState<Record<string, number>>({});
    const chatEndRef = useRef<HTMLDivElement>(null);
    const stompClientRef = useRef<Client | null>(null);
    const handledChatRequestRef = useRef('');

    // Refs for WebSocket callbacks to always have the latest state without resubscribing
    const chatTabRef = useRef<'group' | 'dm'>(chatTab);
    const dmUserIdRef = useRef<string | null>(dmUserId);
    const showChatRef = useRef(showChat);
    const unreadDmTotal = Object.values(unreadDmCounts).reduce((sum, count) => sum + count, 0);
    const unreadTotal = unreadGroupCount + unreadDmTotal;
    useEffect(() => { chatTabRef.current = chatTab; }, [chatTab]);
    useEffect(() => { dmUserIdRef.current = dmUserId; }, [dmUserId]);
    useEffect(() => { showChatRef.current = showChat; }, [showChat]);

    // Online presence + DM previews
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
    const [dmPreviews, setDmPreviews] = useState<ChatMsg[]>([]);

    const syncPersistedChatUnread = useCallback(async () => {
        if (!id) return;
        try {
            const notifications = await notificationService.getAll();
            const unreadForTeam = notifications.filter(notification =>
                notification.type === 'CHAT_MESSAGE'
                && notification.taskId === id
                && !notification.read
            );
            setUnreadGroupCount(unreadForTeam.filter(notification => !notification.actorId).length);
            setUnreadDmCounts(unreadForTeam.reduce<Record<string, number>>((counts, notification) => {
                if (notification.actorId) {
                    counts[notification.actorId] = (counts[notification.actorId] ?? 0) + 1;
                }
                return counts;
            }, {}));
        } catch {
            // Realtime counters continue to work if the initial sync is unavailable.
        }
    }, [id]);

    useEffect(() => {
        if (!user) return;
        syncPersistedChatUnread();
    }, [user, syncPersistedChatUnread]);

    const currentMember = team?.members?.find(m => m.userId === user?.id);
    const isSystemAdmin = user?.role === 'ADMIN';
    const isAdmin = currentMember?.groupRole === 'ADMIN' || currentMember?.groupRole === 'OWNER' || team?.ownerId === user?.id;
    const isManager = !isSystemAdmin && isAdmin;

    useEffect(() => {
        if (!team || !user) return;
        setTaskFilter(isAdmin ? 'all' : 'my');
    }, [team?.id, user?.id, isAdmin]);

    useEffect(() => {
        if (!id) return;
        teamService.getDetail(id).then(data => {
            setTeam(data);
            if (data.metadata) {
                try {
                    const parsed = JSON.parse(data.metadata);
                    if (parsed.roles && Array.isArray(parsed.roles)) {
                        setTeamRoles(parsed.roles);
                    }
                } catch (e) { /* metadata parse error ignored */ }
            }
        }).catch(() => { });
        teamService.getQuota(id).then(setPlanUsage).catch(() => { });
        goalService.getByTeam(id).then(g => {
            setGoals(g);
            // Load all tasks for all goals
            Promise.all(g.map(goal => taskService.getByGoal(goal.id)))
                .then(taskArrays => setAllTasks(taskArrays.flat()))
                .catch(() => { });
        }).catch(() => { });
        getTrialStatus().then(s => { setTrialActive(s.aiTrialActive); setTrialDays(s.daysRemaining); }).catch(() => { });
    }, [id]);

    useEffect(() => {
        if (!id || !team) return;
        if (!isAdmin) {
            setInventoryItems([]);
            return;
        }
        inventoryService.getByTeam(id).then(data => { setInventoryItems(data || []); }).catch(() => { });
    }, [id, team?.id, isAdmin]);

    // Attendance state
    const [myAttendance, setMyAttendance] = useState<any>(null);
    const [showAttendanceHistory, setShowAttendanceHistory] = useState(false);
    const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
    const [loadingAttendance, setLoadingAttendance] = useState(false);
    const attendanceHistoryModalRef = useRef<HTMLDivElement>(null);
    
    // Team Attendance
    const [showTeamAttendance, setShowTeamAttendance] = useState(false);
    const [teamAttendanceData, setTeamAttendanceData] = useState<AttendanceDTO[]>([]);
    const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [attendanceError, setAttendanceError] = useState('');
    const [attendanceCorrections, setAttendanceCorrections] = useState<AttendanceCorrectionDTO[]>([]);
    const [editingAttendance, setEditingAttendance] = useState<{ id: string, checkInTime: string, checkOutTime: string, reason: string } | null>(null);
    const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettingsDTO>({
        workStartTime: '09:00',
        workEndTime: '17:30',
        standardHours: 7.5,
        hourlyRateVnd: 50_000,
        overtimeMultiplier: 1.5,
    });
    const [attendanceSettingsDraft, setAttendanceSettingsDraft] = useState<AttendanceSettingsDTO>({
        workStartTime: '09:00',
        workEndTime: '17:30',
        standardHours: 7.5,
        hourlyRateVnd: 50_000,
        overtimeMultiplier: 1.5,
    });
    const [savingAttendanceSettings, setSavingAttendanceSettings] = useState(false);
    const [attendanceSettingsSaved, setAttendanceSettingsSaved] = useState(false);
    const teamAttendanceModalRef = useRef<HTMLDivElement>(null);
    const attendanceRows = (team?.members || []).map(member => ({
        member,
        attendance: teamAttendanceData.find(item => item.userId === member.userId),
    }));
    const attendanceSummary = {
        employees: attendanceRows.length,
        active: teamAttendanceData.filter(item => item.checkInTime && !item.checkOutTime).length,
        completed: teamAttendanceData.filter(item => item.checkOutTime).length,
        missing: attendanceRows.filter(row => !row.attendance).length,
        totalHours: teamAttendanceData.reduce((sum, item) => sum + (Number(item.actualWorkHours) || 0), 0),
        regularHours: teamAttendanceData.reduce((sum, item) => sum + (Number(item.regularHours) || 0), 0),
        overtimeHours: teamAttendanceData.reduce((sum, item) => sum + (Number(item.overtimeHours) || 0), 0),
    };

    useGSAP(() => {
        if (!showAttendanceHistory || !attendanceHistoryModalRef.current) return;

        const media = gsap.matchMedia();
        media.add('(prefers-reduced-motion: no-preference)', () => {
            const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
            timeline
                .fromTo('.attendance-history-modal__backdrop', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 })
                .fromTo(
                    '.attendance-history-modal__panel',
                    { autoAlpha: 0, y: 12, scale: 0.985 },
                    { autoAlpha: 1, y: 0, scale: 1, duration: 0.22 },
                    '<'
                )
                .fromTo(
                    '.attendance-history-modal__card',
                    { autoAlpha: 0, y: 8 },
                    { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.03 },
                    '-=0.08'
                );
        });

        return () => media.revert();
    }, { scope: attendanceHistoryModalRef, dependencies: [showAttendanceHistory], revertOnUpdate: true });

    useEffect(() => {
        if (!showAttendanceHistory) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowAttendanceHistory(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showAttendanceHistory]);

    useGSAP(() => {
        if (!showTeamAttendance || !teamAttendanceModalRef.current) return;

        const media = gsap.matchMedia();
        media.add('(prefers-reduced-motion: no-preference)', () => {
            const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
            timeline
                .fromTo('.attendance-modal__backdrop', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 })
                .fromTo(
                    '.attendance-modal__panel',
                    { autoAlpha: 0, y: 16, scale: 0.985 },
                    { autoAlpha: 1, y: 0, scale: 1, duration: 0.24 },
                    '<'
                )
                .fromTo(
                    '.attendance-modal__animate',
                    { autoAlpha: 0, y: 8 },
                    { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.035 },
                    '-=0.1'
                );
        });

        return () => media.revert();
    }, { scope: teamAttendanceModalRef, dependencies: [showTeamAttendance], revertOnUpdate: true });

    useEffect(() => {
        if (!showTeamAttendance) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowTeamAttendance(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showTeamAttendance]);

    const loadTodayAttendance = useCallback(async () => {
        if (!id || !user?.id) return;
        try {
            const att = await attendanceService.getTodayAttendance(id);
            setMyAttendance(att);
        } catch {
            // silently fail; UI handles missing data
        }
    }, [id, user?.id]);

    const loadAttendanceHistory = useCallback(async () => {
        if (!id || !user?.id) return;
        try {
            const history = await attendanceService.getHistory(id);
            setAttendanceHistory(history || []);
        } catch {
            // silently fail; UI handles missing data
        }
    }, [id, user?.id]);

    const loadTeamAttendance = useCallback(async () => {
        if (!id) return;
        try {
            setAttendanceError('');
            const [data, settings] = await Promise.all([
                attendanceService.getTeamDaily(id, attendanceDate),
                attendanceService.getSettings(id),
            ]);
            setTeamAttendanceData(data || []);
            const normalizedSettings = {
                ...settings,
                workStartTime: settings.workStartTime.slice(0, 5),
                workEndTime: settings.workEndTime.slice(0, 5),
                hourlyRateVnd: settings.hourlyRateVnd ?? 50_000,
                overtimeMultiplier: settings.overtimeMultiplier ?? 1.5,
            };
            setAttendanceSettings(normalizedSettings);
            setAttendanceSettingsDraft(normalizedSettings);
        } catch {
            setAttendanceError('Không tải được dữ liệu chấm công. Vui lòng thử lại.');
        }
    }, [id, attendanceDate]);

    const saveAttendanceSettings = async () => {
        if (!id) return;
        if (!attendanceSettingsDraft.workStartTime || !attendanceSettingsDraft.workEndTime) {
            setAttendanceError('Cần nhập đầy đủ giờ vào ca và giờ tan ca.');
            return;
        }
        if (attendanceSettingsDraft.workEndTime <= attendanceSettingsDraft.workStartTime) {
            setAttendanceError('Giờ tan ca phải sau giờ vào ca.');
            return;
        }
        if (!Number.isFinite(attendanceSettingsDraft.standardHours)
            || attendanceSettingsDraft.standardHours < 0.25
            || attendanceSettingsDraft.standardHours > 24) {
            setAttendanceError('Giờ làm chuẩn phải từ 0,25 đến 24 giờ.');
            return;
        }
        if (!Number.isFinite(attendanceSettingsDraft.hourlyRateVnd)
            || attendanceSettingsDraft.hourlyRateVnd < 1_000
            || attendanceSettingsDraft.hourlyRateVnd > 10_000_000) {
            setAttendanceError('Đơn giá phải từ 1.000đ đến 10.000.000đ mỗi giờ.');
            return;
        }
        if (!Number.isFinite(attendanceSettingsDraft.overtimeMultiplier)
            || attendanceSettingsDraft.overtimeMultiplier < 1
            || attendanceSettingsDraft.overtimeMultiplier > 3) {
            setAttendanceError('Hệ số tăng ca phải từ 1,00 đến 3,00.');
            return;
        }
        setSavingAttendanceSettings(true);
        setAttendanceSettingsSaved(false);
        try {
            setAttendanceError('');
            const saved = await attendanceService.updateSettings(id, attendanceSettingsDraft);
            const normalizedSettings = {
                ...saved,
                workStartTime: saved.workStartTime.slice(0, 5),
                workEndTime: saved.workEndTime.slice(0, 5),
                hourlyRateVnd: saved.hourlyRateVnd ?? 50_000,
                overtimeMultiplier: saved.overtimeMultiplier ?? 1.5,
            };
            setAttendanceSettings(normalizedSettings);
            setAttendanceSettingsDraft(normalizedSettings);
            setAttendanceSettingsSaved(true);
            window.setTimeout(() => setAttendanceSettingsSaved(false), 2400);
        } catch (error) {
            const apiError = error as { response?: { data?: { error?: string } } };
            setAttendanceError(apiError.response?.data?.error || 'Không thể lưu cài đặt chấm công.');
        } finally {
            setSavingAttendanceSettings(false);
        }
    };

    const saveAttendanceCorrection = async () => {
        if (!editingAttendance) return;
        if (!editingAttendance.checkInTime || !editingAttendance.checkOutTime) {
            setAttendanceError('Cần nhập đầy đủ giờ vào và giờ ra.');
            return;
        }
        if (editingAttendance.reason.trim().length < 5) {
            setAttendanceError('Vui lòng nhập lý do sửa công ít nhất 5 ký tự.');
            return;
        }
        try {
            setAttendanceError('');
            await attendanceService.updateAttendance(editingAttendance.id, {
                checkInTime: new Date(editingAttendance.checkInTime).toISOString(),
                checkOutTime: new Date(editingAttendance.checkOutTime).toISOString(),
                reason: editingAttendance.reason.trim(),
            });
            setEditingAttendance(null);
            await loadTeamAttendance();
            setAttendanceCorrections(await attendanceService.getCorrections(editingAttendance.id));
        } catch (error: any) {
            setAttendanceError(error?.response?.data?.error || error?.response?.data?.message || 'Không thể cập nhật chấm công.');
        }
    };

    useEffect(() => {
        if (showTeamAttendance) void loadTeamAttendance();
    }, [showTeamAttendance, loadTeamAttendance]);

    useEffect(() => {
        if (id && user?.id) {
            loadTodayAttendance();
        }
    }, [id, user?.id, loadTodayAttendance]);

    const currentUserMember = team?.members?.find(m => m.userId === user?.id);
    const userRoles = currentUserMember?.jobLabels?.filter(l => l.trim().length > 0) || [];
    const canCheckIn = Boolean(currentUserMember);

    const handleCheckIn = async () => {
        if (!id || !user?.id) return;
        if (!canCheckIn) {
            alert('Tài khoản của bạn chưa phải là thành viên của xưởng.');
            return;
        }
        setLoadingAttendance(true);
        try {
            const rawStage = userRoles.length > 0 ? userRoles[0].toUpperCase() : '';
            let stage = 'RANG';
            if (rawStage.includes('RANH') || rawStage.includes('CHỌN') || rawStage.includes('CHON')) stage = 'RANH_VA_CHON';
            else if (rawStage.includes('XAY') || rawStage.includes('XÂY')) stage = 'XAY';
            else if (rawStage.includes('DONG') || rawStage.includes('ĐÓNG') || rawStage.includes('GÓI') || rawStage.includes('GOI')) stage = 'DONG_GOI';
            else if (rawStage.includes('QA') || rawStage.includes('QC') || rawStage.includes('KIỂM') || rawStage.includes('KIEM')) stage = 'QA';
            
            const result = await attendanceService.checkIn(id, {
                shiftType: 'NGAY',
                stage: stage as any
            });
            setMyAttendance(result);
            alert('Vào ca thành công!');
        } catch (e: any) {
            alert(e.response?.data?.error || e.message || 'Lỗi vào ca');
        } finally {
            setLoadingAttendance(false);
        }
    };

    const handleCheckOut = async () => {
        if (!id || !user?.id) return;
        setLoadingAttendance(true);
        try {
            const result = await attendanceService.checkOut(id);
            setMyAttendance(result);
            alert('Tan ca thành công!');
        } catch (e: any) {
            alert(e.response?.data?.error || e.message || 'Lỗi tan ca');
        } finally {
            setLoadingAttendance(false);
        }
    };

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const loadChatMessages = useCallback(async () => {
        if (!id) return;
        try {
            if (chatTab === 'group') {
                const msgs = await chatService.getGroupMessages(id);
                setChatMessages(msgs);
            } else if (dmUserId) {
                const msgs = await chatService.getDirectMessages(id, dmUserId);
                setChatMessages(msgs);
            }
            window.dispatchEvent(new Event('orca:notifications-refresh'));
        } catch (err) {
            // chat history load failure is non-fatal
        }
    }, [id, chatTab, dmUserId]);

    // Load online users + DM previews
    useEffect(() => {
        if (!id || !user) return;
        chatService.getOnlineUsers().then(setOnlineUsers).catch(() => {});
        chatService.getDmPreviews(id).then(setDmPreviews).catch(() => {});
    }, [id, user]);

    // Automatically load messages when chat is opened or tab/user changes
    useEffect(() => {
        if (showChat) {
            loadChatMessages();
        }
    }, [showChat, chatTab, dmUserId, loadChatMessages]);

    useEffect(() => {
        if (searchParams.get('openChat') !== '1' || !id) return;
        const requestedTab = searchParams.get('chat') === 'dm' ? 'dm' : 'group';
        const requestedUserId = searchParams.get('userId');
        const requestKey = `${id}:${requestedTab}:${requestedUserId ?? ''}`;
        if (handledChatRequestRef.current === requestKey) return;
        handledChatRequestRef.current = requestKey;

        setShowChat(true);
        setChatExpanded(true);
        setChatTab(requestedTab);
        setDmUserId(requestedTab === 'dm' ? requestedUserId : null);

        const cleaned = new URLSearchParams(searchParams);
        cleaned.delete('openChat');
        cleaned.delete('chat');
        cleaned.delete('userId');
        setSearchParams(cleaned, { replace: true });
    }, [id, searchParams, setSearchParams]);

    useEffect(() => {
        if (showChat && chatTab === 'group') {
            setUnreadGroupCount(0);
            if (id) {
                chatService.markConversationRead(id, 'GROUP')
                    .then(() => window.dispatchEvent(new Event('orca:notifications-refresh')))
                    .catch(() => {});
            }
        }
        if (showChat && chatTab === 'dm' && dmUserId) {
            setUnreadDmCounts(prev => ({ ...prev, [dmUserId]: 0 }));
            if (id) {
                chatService.markConversationRead(id, 'DIRECT', dmUserId)
                    .then(() => window.dispatchEvent(new Event('orca:notifications-refresh')))
                    .catch(() => {});
            }
        }
    }, [id, showChat, chatTab, dmUserId]);

    // WebSocket connection
    useEffect(() => {
        if (!id || !user) return;

        // Load initial messages if chat is open
        // if (showChat) loadChatMessages(); // handled by separate useEffect now

        const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081';
        const socketUrl = `${apiBase}/ws`;

        const client = new Client({
            webSocketFactory: () => new SockJS(socketUrl),
            connectHeaders: { userId: user.id },
            reconnectDelay: 5000,
            onConnect: () => {
                // STOMP connected — handled silently.

                // Subscribe to group messages
                client.subscribe(`/topic/team/${id}`, (message) => {
                    const newMsg: ChatMsg = JSON.parse(message.body);
                    // ONLY append to current chat view if we are actively looking at the group chat
                    // If we are looking at a DM, DO NOT append group messages to the screen
                    if (chatTabRef.current === 'group') {
                        setChatMessages(prev => [...prev, newMsg]);
                    }
                    if (newMsg.senderId !== user.id && !(showChatRef.current && chatTabRef.current === 'group')) {
                        setUnreadGroupCount(prev => prev + 1);
                    } else if (newMsg.senderId !== user.id && showChatRef.current && chatTabRef.current === 'group') {
                        chatService.markConversationRead(id, 'GROUP')
                            .then(() => window.dispatchEvent(new Event('orca:notifications-refresh')))
                            .catch(() => {});
                    }
                });

                // Subscribe to ALL incoming DMs for this user in this team
                team?.members?.filter(m => m.userId !== user.id).forEach(m => {
                    client.subscribe(`/topic/dm/${id}/${user.id}/${m.userId}`, (message) => {
                        const newMsg: ChatMsg = JSON.parse(message.body);

                        // Only append to current chat view if we are actively chatting with them
                        if (chatTabRef.current === 'dm' && dmUserIdRef.current === m.userId) {
                            setChatMessages(prev => [...prev, newMsg]);
                        }
                        if (newMsg.senderId !== user.id && !(showChatRef.current && chatTabRef.current === 'dm' && dmUserIdRef.current === m.userId)) {
                            setUnreadDmCounts(prev => ({ ...prev, [m.userId]: (prev[m.userId] || 0) + 1 }));
                        } else if (newMsg.senderId !== user.id && showChatRef.current && chatTabRef.current === 'dm' && dmUserIdRef.current === m.userId) {
                            chatService.markConversationRead(id, 'DIRECT', m.userId)
                                .then(() => window.dispatchEvent(new Event('orca:notifications-refresh')))
                                .catch(() => {});
                        }
                        // Update DM previews
                        setDmPreviews(prev => {
                            const filtered = prev.filter(p => {
                                const contactId = p.senderId === user.id ? p.recipientId : p.senderId;
                                return contactId !== m.userId;
                            });
                            return [newMsg, ...filtered];
                        });
                    });
                });

                // Subscribe to online presence
                client.subscribe('/topic/presence', (message) => {
                    const userIds: string[] = JSON.parse(message.body);
                    setOnlineUsers(userIds);
                });
            },
            onStompError: () => {
                // STOMP error reported via UI surface, not console.
            }
        });

        client.activate();
        stompClientRef.current = client;

        return () => {
            client.deactivate();
            stompClientRef.current = null;
        };
    }, [id, user, team]);

    const handleSendChat = async () => {
        if (!id || (!chatInput.trim() && !chatAttachment)) return;

        let messageContent = chatInput.trim();
        let attachmentUrl = undefined;
        let attachmentName = undefined;
        let attachmentType = undefined;

        if (chatAttachment) {
            try {
                attachmentUrl = await uploadFile(chatAttachment);
                attachmentName = chatAttachment.name;
                attachmentType = chatAttachment.type;
            } catch (error) {
                alert('Lỗi khi tải lên tệp đính kèm');
                return;
            }
        }

        await chatService.sendMessage(
            id,
            messageContent,
            chatTab === 'dm' && dmUserId ? dmUserId : undefined,
            attachmentUrl,
            attachmentName,
            attachmentType
        );
        
        setChatInput('');
        setChatAttachment(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadChatMessages();
    };

    const renderUnreadBadge = (count: number) => count > 0 ? (
        <span style={{
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            borderRadius: 999,
            background: '#ef4444',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            boxShadow: '0 4px 10px rgba(239,68,68,0.28)'
        }}>{count > 99 ? '99+' : count}</span>
    ) : null;

    const closeModal = () => { setShowAddMember(false); setInviteEmail(''); setError(''); setSuccessMsg(''); };

    const handleInviteMember = async () => {
        if (!id || !inviteEmail.trim()) {
            setError('Vui lòng nhập email người được mời.');
            return;
        }
        try {
            setError('');
            setLoading(true);
            const result = await teamService.addMember(id, inviteEmail.trim());
            setSuccessMsg(result.message || 'Đã gửi lời mời.');
            setInviteEmail('');
            Promise.all([
                teamService.getDetail(id),
                teamService.getQuota(id),
            ]).then(([updatedTeam, usage]) => {
                setTeam(updatedTeam);
                setPlanUsage(usage);
            }).catch(() => { });
            setTimeout(() => setSuccessMsg(''), 2500);
        } catch (e: any) {
            setError(e?.response?.data?.message || e?.response?.data?.error || 'Không thể gửi lời mời.');
        } finally {
            setLoading(false);
        }
    };

    const toDatetimeInputValue = (value?: string) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const offset = date.getTimezoneOffset();
        const local = new Date(date.getTime() - offset * 60000);
        return local.toISOString().slice(0, 16);
    };

    const handleCreateGoal = async (useAi: boolean) => {
        if (!id || !goalTitle.trim()) return;
        if (useAi && !trialActive) { setError('AI đã hết hạn dùng thử!'); return; }
        setLoading(true);
        try {
            setError('');
            await goalService.create({ teamId: id, title: goalTitle, outputTarget: goalTarget, deadline: goalDeadline || undefined, useAi } as any);
            const g = await goalService.getByTeam(id);
            setGoals(g);
            Promise.all(g.map(goal => taskService.getByGoal(goal.id))).then(a => setAllTasks(a.flat()));
            setShowCreateGoal(false);
            setGoalTitle(''); setGoalTarget(''); setGoalDeadline('');
        } catch (e: any) { setError(e?.response?.data?.error || 'Lỗi'); } finally { setLoading(false); }
    };



    const handleAddTask = async () => {
        if (!id || !newTaskTitle.trim()) return;
        setLoading(true);
        try {
            let goalId = selectedGoalId;
            if (!goalId) {
                const manualGoal = await goalService.create({
                    teamId: id,
                    title: 'Công việc thủ công',
                    outputTarget: 'Các công việc được thêm thủ công trong bảng.'
                } as any);
                goalId = manualGoal.id;
                setSelectedGoalId(goalId);
            }
            const inferredUnit = (newTaskUnit && newTaskUnit.trim()) || inferUnitFromText(`${newTaskTitle} ${newTaskDesc}`, newTaskStage);
            await taskService.create({
                goalId,
                title: newTaskTitle,
                description: newTaskDesc,
                workload: Number(newTaskWorkload) || 0,
                priority: newTaskPriority,
                productionStage: newTaskStage,
                unit: inferredUnit,
                dueTime: newTaskDueTime || undefined,
                deadline: newTaskDueTime || undefined,
                createdById: user?.id,
                createdByType: 'MANAGER'
            });
            const g = await goalService.getByTeam(id);
            setGoals(g);
            Promise.all(g.map(goal => taskService.getByGoal(goal.id))).then(a => setAllTasks(a.flat()));
            setNewTaskTitle(''); setNewTaskDesc(''); setNewTaskWorkload(''); setNewTaskDueTime(''); setNewTaskPriority(2); setShowAddTask(false);
        } catch (e: any) { setError(e?.response?.data?.error || 'Lỗi'); } finally { setLoading(false); }
    };

    const startEditTask = (task: Task) => {
        setEditingTaskId(task.id);
        setEditTaskTitle(task.title || '');
        setEditTaskDesc(task.description || '');
        setEditTaskStage(task.productionStage || 'Roasting');
        setEditTaskUnit(task.unit || '');
        setEditTaskDueTime(toDatetimeInputValue(task.dueTime || task.deadline));
        setEditTaskPriority(task.priority || 2);
    };

    const cancelEditTask = () => {
        setEditingTaskId(null);
        setEditTaskTitle('');
        setEditTaskDesc('');
        setEditTaskStage('Roasting');
        setEditTaskUnit('');
        setEditTaskDueTime('');
        setEditTaskPriority(2);
    };

    const handleUpdateTask = async (taskId: string) => {
        if (!editTaskTitle.trim()) return;
        setLoading(true);
        try {
            const updatedUnit = (editTaskUnit && editTaskUnit.trim())
                ? editTaskUnit.trim()
                : inferUnitFromText(`${editTaskTitle} ${editTaskDesc}`, editTaskStage);
            await taskService.update(taskId, {
                title: editTaskTitle.trim(),
                description: editTaskDesc.trim(),
                priority: editTaskPriority,
                productionStage: editTaskStage,
                unit: updatedUnit,
                dueTime: editTaskDueTime || undefined,
                deadline: editTaskDueTime || undefined,
                updatedById: user?.id,
                updatedByType: 'MANAGER'
            });
            if (id) {
                const g = await goalService.getByTeam(id);
                setGoals(g);
                Promise.all(g.map(goal => taskService.getByGoal(goal.id))).then(a => setAllTasks(a.flat()));
                if (isAdmin) {
                    const inv = await inventoryService.getByTeam(id);
                    setInventoryItems(inv || []);
                }
            }
            cancelEditTask();
        } catch (e: any) { setError(e?.response?.data?.error || 'Lỗi'); } finally { setLoading(false); }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!confirm('Xóa task này?')) return;
        await taskService.delete(taskId);
        if (id) {
            const g = await goalService.getByTeam(id);
            setGoals(g);
            Promise.all(g.map(goal => taskService.getByGoal(goal.id))).then(a => setAllTasks(a.flat()));
        }
    };

    const handleSaveAdSettings = async () => {
        if (!team) return;
        setLoading(true);
        try {
            if (isPublished) {
                const updated = await teamService.advertise(team.id, { specialty: adSpecialty, capacity: adCapacity, region: adRegion });
                setTeam(updated);
            } else {
                await teamService.unpublish(team.id);
                setTeam({ ...team, isPublished: false });
            }
            setShowAdSettings(false);
        } catch (e: any) { alert(e?.response?.data?.error || 'Lỗi'); } finally { setLoading(false); }
    };

    const handleDeleteTeam = async () => {
        if (!team) return;
        if (!confirm(`Bạn có chắc muốn xóa nhóm "${team.name}"?\n\nHành động không thể hoàn tác.`)) return;
        try { await teamService.deleteTeam(team.id); navigate('/groups'); } catch (e: any) { alert(e?.response?.data?.error || 'Lỗi'); }
    };

    const handleSaveLabels = async () => {
        if (!team || !selectedMemberForLabels) return;
        const duplicateNames = getDuplicateMemberNameKeys(team.members || []);
        if (hasDuplicateMemberName(selectedMemberForLabels, duplicateNames)) {
            const accepted = confirm(`Thành viên này trùng tên với người khác.\n\nBạn đang phân vai cho:\n${formatMemberIdentity(selectedMemberForLabels)}\n\nXác nhận tiếp tục?`);
            if (!accepted) return;
        }
        setLoading(true);
        try {
            const labelArray = editingLabels.split(',').map(l => l.trim()).filter(l => l.length > 0);
            const updatedLabels = await teamService.updateMemberLabels(team.id, selectedMemberForLabels.userId, labelArray);

            // Cập nhật state ui cho team member
            setTeam(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    members: prev.members?.map(m => m.userId === selectedMemberForLabels.userId ? { ...m, jobLabels: updatedLabels } : m)
                };
            });
            setShowLabelModal(false);
        } catch (e: any) {
            alert(e?.response?.data?.error || 'Lỗi khi lưu nhãn dán');
        } finally {
            setLoading(false);
        }
    };

    const handleAddInventory = async () => {
        if (!isAdmin || !id || !invName.trim()) return;
        setLoading(true);
        try {
            const createdItem = await inventoryService.create({
                teamId: id,
                displayName: invName,
                productType: invName,
                quantity: 0,
                unit: invUnit || 'Cái',
                lowStockThreshold: Number(invThreshold) || 10
            });
            setInventoryItems(currentItems => [
                ...currentItems.filter(item => item.id !== createdItem.id),
                createdItem
            ]);
            setStockInItemId(createdItem.id);
            setInvName(''); setInvUnit(''); setInvThreshold(''); setShowAddInventory(false);
        } catch (e: any) { alert(e?.response?.data?.message || e?.response?.data?.error || 'Lỗi thêm hàng'); } finally { setLoading(false); }
    };

    const handleStockIn = async () => {
        if (!isAdmin || !id || !stockInItemId || !stockInQty) return;
        setLoading(true);
        try {
            const item = inventoryItems.find(i => i.id === stockInItemId);
            if (!item) return;
            const newTotal = Number(item.quantity) + Number(stockInQty);
            await inventoryService.updateQuantity(stockInItemId, newTotal);
            const items = await inventoryService.getByTeam(id);
            setInventoryItems(items);
            setStockInItemId(''); setStockInQty(''); setShowStockIn(false);
        } catch (e: any) { alert(e?.response?.data?.message || e?.response?.data?.error || 'Lỗi nhập kho'); } finally { setLoading(false); }
    };

    const handleEditInventory = async () => {
        if (!isAdmin || !id || !editItem || !editItem.name.trim()) return;
        setLoading(true);
        try {
            const updatedItem = await inventoryService.update(editItem.id, {
                displayName: editItem.name,
                quantity: Number(editItem.quantity),
                unit: editItem.unit || 'Cái',
                lowStockThreshold: Number(editItem.lowStockThreshold) || 10
            });
            setInventoryItems(currentItems => currentItems.map(item =>
                item.id === updatedItem.id ? updatedItem : item
            ));
            setEditItem(null);
        } catch (e: any) { alert(e?.response?.data?.message || e?.response?.data?.error || 'Lỗi cập nhật hàng'); } finally { setLoading(false); }
    };

    const handleDeleteInventory = async (invId: string) => {
        if (!isAdmin) return;
        if (!confirm('Xóa mặt hàng này khỏi kho?')) return;
        try {
            await inventoryService.delete(invId);
            setInventoryItems(currentItems => currentItems.filter(item => item.id !== invId));
            setStockInItemId(currentId => currentId === invId ? '' : currentId);
            setEditItem((currentItem: any | null) => currentItem?.id === invId ? null : currentItem);
        } catch (e: any) { alert(e?.response?.data?.error || 'Lỗi xóa hàng'); }
    };

    const inventoryUnitOptions = Array.from(new Set([
        ...DEFAULT_INVENTORY_UNITS,
        ...inventoryItems.map(item => item.unit?.trim()).filter(Boolean)
    ]));

    if (!team) return (
        <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
            <div style={{ textAlign: 'center', opacity: 0.5 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}><ion-icon name="time-outline" style={{ fontSize: '40px' }}></ion-icon></div>
                <p>Đang tải nhóm...</p>
            </div>
        </div>
    );

    // === COMPUTED DATA ===
    const totalTasks = allTasks.length;
    const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const completedTasks = allTasks.filter(t => t.status === 'COMPLETED').length;
    const pendingTasks = allTasks.filter(t => t.status === 'PENDING').length;


    // Member stats
    const memberStats = (team.members || []).map((m, idx) => {
        const memberTasks = allTasks.filter(t => t.memberId === m.userId);
        const completed = memberTasks.filter(t => t.status === 'COMPLETED').length;
        const total = memberTasks.length;
        const pct = total ? Math.round((completed / total) * 100) : 0;
        return { ...m, completed, total, pct, color: MEMBER_COLORS[idx % MEMBER_COLORS.length] };
    });




    // Show the actual team roster for everyone. The previous filter hid all other
    // members for non-admin users, which made the group appear to have only one member.
    const visibleMemberStats = memberStats;
    const duplicateMemberNameKeys = getDuplicateMemberNameKeys(team.members || []);
    const latestGoal = [...goals].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
    })[0] || goals[goals.length - 1];
    const latestGoalTasks = latestGoal ? allTasks.filter(task => task.goalId === latestGoal.id) : allTasks;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '24px clamp(16px, 3vw, 48px)', fontFamily: "'Inter', sans-serif", width: '100%', maxWidth: 'none', margin: 0 }}>
            {/* ===== HEADER ===== */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 18, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 800 }}>
                        <ion-icon name="cafe-outline"></ion-icon>
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{team.name}</h1>
                            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>● ĐANG HOẠT ĐỘNG</span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{team.description || 'Nhóm sản xuất'} • {team.memberCount} thành viên</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <style>
                        {`
                        @keyframes pulse-ai-btn {
                            0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7); }
                            70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
                            100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
                        }
                        `}
                    </style>
                    {team.inviteCode && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input)', padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <ion-icon name="key-outline" style={{ fontSize: 14, color: 'var(--text-muted)' }}></ion-icon>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mã mời:</span>
                            <span onClick={() => navigator.clipboard.writeText(team.inviteCode || '')} style={{ fontWeight: 800, letterSpacing: 3, color: 'var(--primary)', cursor: 'pointer' }}>{team.inviteCode}</span>
                        </div>
                    )}

                    {/* NÚT AI NỔI BẬT ĐƯA LÊN TRƯỚC */}
                    {isAdmin && (
                        <button
                            onClick={() => navigate(`/groups/${team.id}/create-task`)}
                            style={{
                                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 10,
                                padding: '8px 20px',
                                fontSize: 14,
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                textShadow: '0 1px 2px rgba(0,0,0,0.28)',
                                animation: 'pulse-ai-btn 2s infinite',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <ion-icon name="sparkles" style={{ fontSize: '18px' }}></ion-icon>
                            Phân chia công việc tự động
                        </button>
                    )}

                    <button onClick={() => setShowStatsModal(true)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }} id="btn-stats-modal"><ion-icon name="bar-chart-outline"></ion-icon> Thống kê</button>
                    
                    {/* Chức năng vào ca / tan ca */}
                    {!isAdmin && canCheckIn && (
                        !myAttendance ? (
                            <button
                                onClick={handleCheckIn}
                                disabled={loadingAttendance}
                                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}
                            >
                                <ion-icon name="enter-outline"></ion-icon> Vào ca
                            </button>
                        ) : !myAttendance.checkOutTime ? (
                            <button
                                onClick={handleCheckOut}
                                disabled={loadingAttendance}
                                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}
                            >
                                <ion-icon name="exit-outline"></ion-icon> Tan ca
                            </button>
                        ) : <span className="attendance-day-complete"><ion-icon name="checkmark-circle-outline"></ion-icon> Đã hoàn thành ca hôm nay</span>
                    )}

                    {!isAdmin && (
                        <button
                            onClick={() => {
                                loadAttendanceHistory();
                                setShowAttendanceHistory(true);
                            }}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}
                        >
                            <ion-icon name="time-outline"></ion-icon> Lịch sử ca
                        </button>
                    )}

                    {isAdmin && (
                        <button
                            onClick={() => {
                                loadTeamAttendance();
                                setShowTeamAttendance(true);
                            }}
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}
                        >
                            <ion-icon name="people-circle-outline"></ion-icon> Quản lý chấm công
                        </button>
                    )}

                    <button onClick={() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        setCalendarDate(new Date(today.getFullYear(), today.getMonth(), 1));
                        setSelectedCalendarDate(today);
                        setScheduleView('overview');
                        setShowScheduleModal(true);
                    }} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }} id="btn-schedule-modal"><ion-icon name="calendar-outline"></ion-icon> Lịch sản xuất</button>
                    <button onClick={() => setShowChat(!showChat)} style={{ position: 'relative', background: unreadTotal > 0 ? '#fff7ed' : 'var(--bg-input)', border: unreadTotal > 0 ? '1px solid #fed7aa' : '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}><ion-icon name={unreadTotal > 0 ? 'chatbubbles' : 'chatbubbles-outline'}></ion-icon> Nhắn tin {renderUnreadBadge(unreadTotal)}</button>
                    {isAdmin && <button onClick={() => setShowMemberRoles(!showMemberRoles)} style={{ background: showMemberRoles ? '#fff7ed' : 'var(--bg-input)', border: showMemberRoles ? '1px solid #fed7aa' : '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: showMemberRoles ? '#d97706' : 'var(--text-secondary)' }}><ion-icon name="id-card-outline"></ion-icon> Phân vai trò</button>}

                    {isAdmin && <button onClick={() => setShowAddMember(true)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}><ion-icon name="people-outline"></ion-icon> Mời</button>}
                    {isAdmin && <button onClick={handleDeleteTeam} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '8px', fontSize: 16, cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ion-icon name="trash-outline"></ion-icon></button>}
                </div>
            </div>

            {/* ===== STATS CARDS ===== */}
            {isManager && totalTasks > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
                {[
                    { label: 'Tổng công việc', value: totalTasks, icon: 'clipboard-outline', bg: '#f9f1e3', color: '#d4a574' },
                    { label: 'Chưa bắt đầu', value: pendingTasks, icon: 'time-outline', bg: '#f8fafc', color: 'var(--text-secondary)' },
                    { label: 'Đang thực hiện', value: inProgressTasks, icon: 'sync-outline', bg: '#fff7ed', color: '#f59e0b' },
                    { label: 'Hoàn thành', value: completedTasks, icon: 'checkmark-circle-outline', bg: '#f0fdf4', color: '#16a34a' },
                ].map((s, i) => (
                    <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: 24 }}>
                            <ion-icon name={s.icon}></ion-icon>
                        </div>
                        <div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>
            )}

            {/* ===== EMPTY STATE / ANALYTICS ===== */}
            {/* ===== MEMBER CARDS ===== */}
            {showMemberRoles && visibleMemberStats.length > 0 && (
            <>
                {duplicateMemberNameKeys.size > 0 && (
                    <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 14, padding: '11px 14px', borderRadius: 12, border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', fontSize: 13, lineHeight: 1.45 }}>
                        <ion-icon name="warning-outline" style={{ fontSize: 18, flexShrink: 0 }}></ion-icon>
                        <span><strong>Phát hiện thành viên trùng tên.</strong> ORCA vẫn phân biệt bằng tài khoản và UUID; hãy đối chiếu username, mã nhân viên trước khi phân vai.</span>
                    </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <button onClick={() => setMemberRoleFilter('ALL')} style={{ padding: '6px 14px', borderRadius: 20, border: memberRoleFilter === 'ALL' ? '1px solid var(--accent-primary, #d4a574)' : '1px solid var(--border, #e2e8f0)', background: memberRoleFilter === 'ALL' ? 'var(--accent-primary, #d4a574)' : 'transparent', color: memberRoleFilter === 'ALL' ? '#fff' : 'var(--text-secondary, #64748b)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Tất cả</button>
                    {Array.from(new Set(visibleMemberStats.flatMap(m => m.jobLabels || []).filter((l: string) => l.trim().length > 0))).map(role => (
                        <button key={role} onClick={() => setMemberRoleFilter(role)} style={{ padding: '6px 14px', borderRadius: 20, border: memberRoleFilter === role ? '1px solid var(--accent-primary, #d4a574)' : '1px solid var(--border, #e2e8f0)', background: memberRoleFilter === role ? 'var(--accent-primary, #d4a574)' : 'transparent', color: memberRoleFilter === role ? '#fff' : 'var(--text-secondary, #64748b)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                            {role}
                        </button>
                    ))}
                    <button onClick={() => setMemberRoleFilter('NONE')} style={{ padding: '6px 14px', borderRadius: 20, border: memberRoleFilter === 'NONE' ? '1px solid var(--accent-primary, #d4a574)' : '1px solid var(--border, #e2e8f0)', background: memberRoleFilter === 'NONE' ? 'var(--accent-primary, #d4a574)' : 'transparent', color: memberRoleFilter === 'NONE' ? '#fff' : 'var(--text-secondary, #64748b)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Chưa phân vai</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 260px))', gap: 14, marginBottom: 18 }}>
                    {visibleMemberStats.filter(m => {
                        if (memberRoleFilter === 'ALL') return true;
                        const roles = (m.jobLabels || []).filter((l: string) => l.trim().length > 0);
                        if (memberRoleFilter === 'NONE') return roles.length === 0;
                        return roles.includes(memberRoleFilter);
                    }).map(m => {
                        const displayName = m.fullName || m.username;
                    return (
                        <div key={m.userId} style={{ minWidth: 220, background: 'var(--bg-card, #fff)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border, #e2e8f0)', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>{getInitials(displayName)}</div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{displayName}</div>
                                        {hasDuplicateMemberName(m, duplicateMemberNameKeys) && (
                                            <span title="Có người khác trùng tên" style={{ padding: '2px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 9, fontWeight: 800 }}>TRÙNG TÊN</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>@{m.username} · {getMemberCode(m.userId)}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{m.groupRole === 'ADMIN' || m.groupRole === 'OWNER' ? 'Trưởng nhóm' : 'Thành viên'}</div>
                                </div>
                                <div style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: m.pct === 100 ? '#16a34a' : m.pct > 0 ? '#f59e0b' : '#94a3b8' }}>{m.pct}%</div>
                            </div>

                            {/* Tags / Job Labels */}
                            {((m.jobLabels && m.jobLabels.filter((l: string) => l.trim().length > 0).length > 0) || isAdmin) && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, minHeight: 30 }}>
                                    {m.jobLabels && m.jobLabels.filter((l: string) => l.trim().length > 0).length > 0 && (
                                        m.jobLabels.filter((l: string) => l.trim().length > 0).map((lbl: string, i: number) => (
                                            <span key={i} style={{ background: 'rgba(212, 165, 116, 0.15)', color: '#d4a574', padding: '5px 12px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: '1px solid rgba(212, 165, 116, 0.3)' }}>
                                                {lbl}
                                            </span>
                                        ))
                                    )}
                                    {isAdmin && (
                                        <button onClick={() => { setSelectedMemberForLabels(m); setEditingLabels(m.jobLabels?.join(', ') || ''); setShowLabelModal(true); }} style={{ background: 'var(--bg-input)', border: '1px dashed var(--border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' }}>
                                            <ion-icon name="add"></ion-icon> Phân vai trò
                                        </button>
                                    )}
                                </div>
                            )}

                            <div style={{ height: 6, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                                <div style={{ height: '100%', background: m.pct === 100 ? '#16a34a' : m.pct > 0 ? '#f59e0b' : '#e2e8f0', borderRadius: 3, width: `${m.pct}%`, transition: 'width 0.4s' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.completed}/{m.total} công việc</div>
                                {m.userId !== user?.id && (
                                    <button
                                        onClick={() => {
                                            setChatTab('dm');
                                            setDmUserId(m.userId);
                                            setShowChat(true);
                                        }}
                                        style={{
                                            background: '#f9f1e3', color: '#d4a574', border: 'none',
                                            borderRadius: 8, padding: '4px 10px', fontSize: 11,
                                            fontWeight: 700, cursor: 'pointer', display: 'flex',
                                            alignItems: 'center', gap: 4
                                        }}
                                    >
                                        <ion-icon name="chatbubble-ellipses-outline"></ion-icon> Nhắn tin
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            </>
            )}

            {/* ===== DB ROADMAP: same source as task table ===== */}
            {isAdmin && latestGoal && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 18, boxShadow: '0 10px 26px rgba(0,0,0,0.06)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                        <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(212, 165, 116, 0.15)', color: 'var(--primary)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <ion-icon name="flag-outline" style={{ fontSize: 18 }}></ion-icon>
                        </span>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Muc tieu san xuat</div>
                            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35 }}>{latestGoal.title}</h3>
                            <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 13 }}>{latestGoal.outputTarget || latestGoal.rawInstruction}</div>
                        </div>
                    </div>
                    <span style={{ background: 'rgba(212, 165, 116, 0.15)', color: 'var(--primary)', padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>CAP NHAT MOI NHAT</span>
                </div>
                <div style={{ padding: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Roadmap tu task database</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-secondary)' }}>
                                {['STT', 'Cong viec', 'Nguoi chinh', 'Du phong', 'Trang thai', 'Tien do'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {latestGoalTasks.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)', fontSize: 13 }}>Chua co task trong database</td></tr>
                            ) : latestGoalTasks.map((task, index) => {
                                const actual = Number(task.actualOutput ?? 0);
                                const target = Number(task.outputTarget ?? 0);
                                const progressPct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : (task.completionPercentage || 0);

                                let displayStatusKey = task.status;
                                if (target > 0) {
                                    if (progressPct >= 100) {
                                        displayStatusKey = 'COMPLETED';
                                    } else if (progressPct > 0) {
                                        displayStatusKey = 'IN_PROGRESS';
                                    } else {
                                        displayStatusKey = 'PENDING';
                                    }
                                }
                                const status = STATUS_COLORS[displayStatusKey] || STATUS_COLORS.PENDING;
                                return (
                                    <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{index + 1}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>{task.title}</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>{task.productionStage || task.taskCode}</div>
                                            {task.dependencyTaskTitles && task.dependencyTaskTitles.length > 0 && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>Depends on: {task.dependencyTaskTitles.join(', ')}</div>}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{task.memberName || '-'}</td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{task.backupMemberName || '-'}</td>
                                        <td style={{ padding: '10px 12px' }}><span style={{ background: status.bg, color: status.color, padding: '4px 9px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>{status.label}</span></td>
                                        <td style={{ padding: '10px 12px', minWidth: 120 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 999, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${progressPct}%`, background: status.color, borderRadius: 999 }} />
                                                </div>
                                                <span style={{ color: status.color, fontSize: 12, fontWeight: 800, minWidth: 34 }}>{progressPct}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* ===== GOAL STRATEGIC OVERVIEW (LEGACY AI TEXT) ===== */}
            {false && isAdmin && latestGoal && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 18 }}>
                {[latestGoal].map(g => {
                    let aiData: any = null;
                    if (g.aiParsedData) {
                        try {
                            aiData = JSON.parse(g.aiParsedData);
                        } catch (e) {
                            // ignore malformed AI data
                        }
                    }

                    const displayTitle = g.title || aiData?.mainGoal || 'Kế hoạch công việc';
                    const displayDesc = g.outputTarget || g.rawInstruction || aiData?.description || 'Nhiệm vụ đã được phân bổ cho các thành viên trong nhóm.';
                    const displayPhase = aiData?.phase || 'CHÍNH THỨC';

                    return (
                        <div key={g.id} style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: '0 10px 26px rgba(15,23,42,0.06)' }}>
                            <div style={{ padding: '16px 20px', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, #fffaf3, #fff)' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                                    <span style={{ width: 36, height: 36, borderRadius: 10, background: '#f3dfc6', color: '#8a5a2d', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                        <ion-icon name="flag-outline" style={{ fontSize: 18 }}></ion-icon>
                                    </span>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 11, color: '#9a6b3b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Mục tiêu sản xuất</div>
                                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#172033', lineHeight: 1.35 }}>{displayTitle}</h3>
                                    </div>
                                </div>
                                <span style={{ background: '#f3dfc6', color: '#6b4321', padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{displayPhase}</span>
                            </div>
                            <div style={{ padding: 20 }}>
                                <div style={{ marginBottom: aiData?.contingency ? 16 : 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Kế hoạch hiện tại</div>
                                    <div style={{ fontSize: 14, color: '#24324a', fontWeight: 500, lineHeight: 1.65 }} className="markdown-body goal-roadmap-markdown">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayDesc}</ReactMarkdown>
                                    </div>
                                </div>
                                {aiData?.contingency && (
                                    <div>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Phương án dự phòng</div>
                                        <div style={{ fontSize: 13, color: '#b42318', background: '#fff4f2', padding: '10px 12px', borderRadius: 10, border: '1px solid #ffd7d0', lineHeight: 1.55 }}>
                                            <ion-icon name="warning-outline" style={{ verticalAlign: 'middle', marginRight: 4 }}></ion-icon>
                                            {aiData.contingency}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            )}

            {/* ===== TASK TABLE ===== */}
            <div className="group-task-section" style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 18 }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                            <ion-icon name="list-outline" style={{ verticalAlign: 'middle', marginRight: 6, color: '#d4a574' }}></ion-icon>
                            CÔNG VIỆC
                        </h3>
                        {isAdmin && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => { if (!selectedGoalId && goals.length > 0) setSelectedGoalId(goals[0].id); setShowAddTask(!showAddTask); }} style={{ background: '#b97820', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ion-icon name="add"></ion-icon> Thêm mới
                                </button>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => setTaskFilter('my')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: 10,
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                border: 'none',
                                background: taskFilter === 'my' ? '#b97820' : '#f1f5f9',
                                color: taskFilter === 'my' ? '#fff' : '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6
                            }}
                        >
                            <ion-icon name="person-outline"></ion-icon>
                            Việc của tôi
                            <span style={{
                                background: taskFilter === 'my' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                                padding: '1px 6px',
                                borderRadius: 6,
                                fontSize: 11,
                                marginLeft: 6
                            }}>
                                {latestGoalTasks.filter(t => t.memberId === user?.id).length}
                            </span>
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setTaskFilter('all')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 10,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: 'none',
                                    background: taskFilter === 'all' ? '#b97820' : '#f1f5f9',
                                    color: taskFilter === 'all' ? '#fff' : '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6
                                }}
                            >
                                <ion-icon name="people-outline"></ion-icon>
                                Tất cả công việc
                                <span style={{
                                    background: taskFilter === 'all' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                                    padding: '1px 6px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    marginLeft: 6
                                }}>
                                    {latestGoalTasks.length}
                                </span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Add task modal */}
                {showAddTask && isAdmin && (
                    <div className="modal-overlay" onClick={() => setShowAddTask(false)} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: '90%', background: 'var(--bg-panel, #fff)', color: 'var(--text-primary, #1a1a1a)', borderRadius: 16, padding: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                            <h2 style={{ margin: '0 0 24px', fontSize: 20 }}>Tạo công việc mới</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                                <div>
                                    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Tên task <span style={{ color: '#dc2626' }}>*</span></label>
                                    <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Tên task" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', fontSize: 14, background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} autoFocus />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Mô tả</label>
                                    <input value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} placeholder="Mô tả công việc..." style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', fontSize: 14, background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ display: 'flex', gap: 14 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Giai đoạn</label>
                                        <select value={newTaskStage} onChange={e => setNewTaskStage(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', fontSize: 14, background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)' }}>
                                            {['Roasting', 'Cooling', 'Grinding', 'Packaging', 'Quality Check', 'Inventory'].map(stage => <option key={stage} value={stage}>{stage}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Mức ưu tiên</label>
                                        <select value={newTaskPriority} onChange={e => setNewTaskPriority(Number(e.target.value))} style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', fontSize: 14, background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)' }}>
                                            <option value={1}>Thấp</option>
                                            <option value={2}>Trung bình</option>
                                            <option value={3}>Cao</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 14 }}>
                                    <div style={{ flex: 2 }}>
                                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Hạn chót (Deadline)</label>
                                        <input value={newTaskDueTime} onChange={e => setNewTaskDueTime(e.target.value)} type="datetime-local" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', fontSize: 14, background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Giờ công</label>
                                        <input value={newTaskWorkload} onChange={e => setNewTaskWorkload(e.target.value)} placeholder="0" type="number" min="0" style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', fontSize: 14, background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Đơn vị <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(tự đoán)</span></label>
                                        <input
                                            value={newTaskUnit || inferUnitFromText(`${newTaskTitle} ${newTaskDesc}`, newTaskStage)}
                                            onChange={e => setNewTaskUnit(e.target.value)}
                                            placeholder="kg, gói, hộp, chai, tem, mẫu, đơn..."
                                            style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border, #cbd5e1)', fontSize: 14, background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 28 }}>
                                <button onClick={() => setShowAddTask(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)', background: 'transparent', color: 'var(--text-primary, #64748b)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                                <button onClick={handleAddTask} disabled={loading || !newTaskTitle.trim()} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#b97820', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (loading || !newTaskTitle.trim()) ? 0.6 : 1 }}>
                                    {loading ? 'Đang tạo...' : 'Tạo công việc'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="group-task-table-shell" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                    <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                            {['Tên công việc', 'Tiến độ', 'Ưu tiên', 'Nhân viên chính', ''].map((h, i) => (
                                <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(() => {
                            const filtered = (taskFilter === 'my' || !isAdmin) ? latestGoalTasks.filter(t => t.memberId === user?.id) : latestGoalTasks;
                            if (filtered.length === 0) {
                                return <tr><td className="group-task-empty" colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Chưa có công việc nào trong danh sách này</td></tr>;
                            }
                            return filtered.map(t => {
                                if (editingTaskId === t.id) {
                                    const target = Number(t.outputTarget ?? t.workload ?? 0);
                                    const actual = Number(t.actualOutput ?? 0);
                                    const unit = editTaskUnit || t.unit || inferUnitFromText(`${editTaskTitle} ${editTaskDesc}`, editTaskStage);
                                    const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : (t.completionPercentage || 0);

                                    return (
                                        <tr key={t.id} className="task-edit-table-row">
                                            <td colSpan={5}>
                                                <div className="task-edit-panel">
                                                    <div className="task-edit-panel__header">
                                                        <div>
                                                            <span>Chỉnh sửa công việc</span>
                                                            <strong>{t.taskCode || t.title}</strong>
                                                        </div>
                                                        <div className="task-edit-panel__actions">
                                                            <button
                                                                type="button"
                                                                className="task-edit-action task-edit-action--ghost"
                                                                onClick={cancelEditTask}
                                                            >
                                                                Hủy
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="task-edit-action task-edit-action--save"
                                                                onClick={() => handleUpdateTask(t.id)}
                                                                disabled={loading || !editTaskTitle.trim()}
                                                            >
                                                                <ion-icon name="checkmark-outline"></ion-icon>
                                                                Lưu thay đổi
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="task-edit-grid">
                                                        <label className="task-edit-field task-edit-field--wide">
                                                            <span>Tên công việc</span>
                                                            <input value={editTaskTitle} onChange={e => setEditTaskTitle(e.target.value)} placeholder="Tên công việc" autoFocus />
                                                        </label>
                                                        <label className="task-edit-field task-edit-field--wide">
                                                            <span>Mô tả</span>
                                                            <input value={editTaskDesc} onChange={e => setEditTaskDesc(e.target.value)} placeholder="Mô tả ngắn cho nhân viên" />
                                                        </label>
                                                        <label className="task-edit-field">
                                                            <span>Giai đoạn</span>
                                                            <select value={editTaskStage} onChange={e => setEditTaskStage(e.target.value)}>
                                                                {['Roasting', 'Cooling', 'Grinding', 'Packaging', 'Quality Check', 'Inventory'].map(stage => <option key={stage} value={stage}>{stage}</option>)}
                                                            </select>
                                                        </label>
                                                        <label className="task-edit-field">
                                                            <span>Ưu tiên</span>
                                                            <select value={editTaskPriority} onChange={e => setEditTaskPriority(Number(e.target.value))}>
                                                                <option value={1}>Thấp</option>
                                                                <option value={2}>Trung bình</option>
                                                                <option value={3}>Cao</option>
                                                            </select>
                                                        </label>
                                                        <label className="task-edit-field">
                                                            <span>Hạn chót</span>
                                                            <input value={editTaskDueTime} onChange={e => setEditTaskDueTime(e.target.value)} type="datetime-local" />
                                                        </label>
                                                        <label className="task-edit-field">
                                                            <span>Đơn vị</span>
                                                            <input value={unit} onChange={e => setEditTaskUnit(e.target.value)} placeholder="kg, gói, chai..." />
                                                        </label>
                                                        <label className="task-edit-field">
                                                            <span>Nhân viên chính</span>
                                                            <select value={t.memberId || ''} onChange={async e => {
                                                                const nextMemberId = e.target.value;
                                                                try {
                                                                    let updatedTask;
                                                                    if (!nextMemberId) {
                                                                        updatedTask = await taskService.assign(t.id, '');
                                                                    } else if (t.memberId && t.memberId !== nextMemberId) {
                                                                        const reason = window.prompt('Lý do chuyển giao công việc?', 'Điều phối lại nhân sự') || 'Điều phối lại nhân sự';
                                                                        updatedTask = await taskService.transfer(t.id, nextMemberId, reason);
                                                                    } else {
                                                                        updatedTask = await taskService.assign(t.id, nextMemberId);
                                                                    }
                                                                    if (updatedTask && updatedTask.id) {
                                                                        setAllTasks(prev => prev.map(tk => tk.id === updatedTask.id ? updatedTask : tk));
                                                                    }
                                                                    if (id) { const g = await goalService.getByTeam(id); setGoals(g); }
                                                                } catch (error: any) {
                                                                    alert(error.response?.data?.message || error.message || 'Không thể giao việc');
                                                                }
                                                            }}>
                                                                <option value="">Chưa giao</option>
                                                                {team?.members?.map(m => <option key={m.userId} value={m.userId}>{m.fullName || m.username}</option>)}
                                                            </select>
                                                        </label>
                                                        <label className="task-edit-field">
                                                            <span>Nhân viên thay thế</span>
                                                            <select value={t.backupMemberId || ''} onChange={async e => {
                                                                try {
                                                                    const updatedTask = await taskService.setBackup(t.id, e.target.value);
                                                                    if (updatedTask && updatedTask.id) {
                                                                        setAllTasks(prev => prev.map(tk => tk.id === updatedTask.id ? updatedTask : tk));
                                                                    }
                                                                    if (id) { const g = await goalService.getByTeam(id); setGoals(g); }
                                                                } catch (error: any) {
                                                                    alert(error.response?.data?.message || error.message || 'Không thể chọn người sao lưu');
                                                                }
                                                            }}>
                                                                <option value="">Không có</option>
                                                                {team?.members?.map(m => <option key={m.userId} value={m.userId}>{m.fullName || m.username}</option>)}
                                                            </select>
                                                        </label>
                                                    </div>

                                                    <div className="task-edit-progress">
                                                        <div>
                                                            <span>Tiến độ hiện tại</span>
                                                            <strong>{actual.toLocaleString('vi-VN')} / {target.toLocaleString('vi-VN')} {unit}</strong>
                                                        </div>
                                                        <div className="task-edit-progress__bar">
                                                            <i style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <em>{pct}%</em>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            {editingTaskId === t.id ? (
                                                <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                                                    <input value={editTaskTitle} onChange={e => setEditTaskTitle(e.target.value)} placeholder="Tên công việc" style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--primary)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', background: 'var(--bg-input)' }} />
                                                    <input value={editTaskDesc} onChange={e => setEditTaskDesc(e.target.value)} placeholder="Mô tả" style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-input)' }} />
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        <select value={editTaskStage} onChange={e => setEditTaskStage(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                                                            {['Roasting', 'Cooling', 'Grinding', 'Packaging', 'Quality Check', 'Inventory'].map(stage => <option key={stage} value={stage}>{stage}</option>)}
                                                        </select>
                                                        <select value={editTaskPriority} onChange={e => setEditTaskPriority(Number(e.target.value))} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                                                            <option value={1}>Thấp</option>
                                                            <option value={2}>TB</option>
                                                            <option value={3}>Cao</option>
                                                        </select>
                                                        <input value={editTaskDueTime} onChange={e => setEditTaskDueTime(e.target.value)} type="datetime-local" style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-input)' }} />
                                                        <input value={editTaskUnit || inferUnitFromText(`${editTaskTitle} ${editTaskDesc}`, editTaskStage)} onChange={e => setEditTaskUnit(e.target.value)} placeholder="Đơn vị" style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-input)', width: 90 }} title="Đơn vị (kg, gói, hộp, chai, tem, mẫu, đơn...)" />
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {t.taskCode && <div style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 2 }}>{t.taskCode}</div>}
                                                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{t.title}</div>
                                                    {t.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.description}</div>}
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                                                        {t.productionStage && <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 6, padding: '2px 6px' }}>{t.productionStage}</span>}
                                                        {t.dependencyTaskTitles && t.dependencyTaskTitles.length > 0 && <span style={{ fontSize: 11, color: '#dc2626', background: 'rgba(220, 38, 38, 0.1)', borderRadius: 6, padding: '2px 6px' }}>Depends on: {t.dependencyTaskTitles.join(', ')}</span>}
                                                        {(t.dueTime || t.deadline) && <span style={{ fontSize: 11, color: '#f59e0b' }}><ion-icon name="time-outline" style={{ fontSize: 11 }}></ion-icon> Hạn: {new Date(t.dueTime || t.deadline).toLocaleDateString('vi')}</span>}
                                                    </div>
                                                </>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', minWidth: 200 }}>
                                            {(() => {
                                                const target = Number(t.outputTarget ?? t.workload ?? 0);
                                                const actual = Number(t.actualOutput ?? 0);
                                                const unit = t.unit && t.unit.trim() ? t.unit : inferUnitFromText(`${t.title || ''} ${t.description || ''}`, t.productionStage);
                                                const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : (t.completionPercentage || 0);
                                                const PROGRESS_COLOR = '#d4a574';
                                                const clampActual = (val: number) => Math.max(0, target > 0 ? Math.min(val, target) : val);
                                                const persistActual = (val: number) => {
                                                    taskService.update(t.id, { actualOutput: val })
                                                        .then((updatedTask) => {
                                                            if (updatedTask && updatedTask.id) {
                                                                setAllTasks(prev => prev.map(tk => tk.id === updatedTask.id ? updatedTask : tk));
                                                            }
                                                            if (id) { 
                                                                goalService.getByTeam(id).then(setGoals);
                                                                if (isAdmin) {
                                                                    inventoryService.getByTeam(id).then(data => setInventoryItems(data || []));
                                                                }
                                                            }
                                                        })
                                                        .catch((err: any) => setError(err?.response?.data?.error || 'Khong the cap nhat'));
                                                };
                                                return (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 12 }}>
                                                            <span style={{ color: 'var(--text-secondary)' }}>Số lượng hiện tại:</span>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={target > 0 ? target : undefined}
                                                                value={actual}
                                                                onChange={(e) => {
                                                                    const val = clampActual(Number(e.target.value) || 0);
                                                                    setAllTasks(prev => prev.map(tk => tk.id === t.id ? { ...tk, actualOutput: val } : tk));
                                                                }}
                                                                onBlur={(e) => persistActual(Number(e.target.value) || 0)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                                                                style={{ width: 72, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'right', background: 'var(--bg-card)' }}
                                                            />
                                                            <span style={{ color: 'var(--text-secondary)' }}>/</span>
                                                            {isAdmin ? (
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    defaultValue={target || ''}
                                                                    placeholder={String(target || '')}
                                                                    onBlur={async e => {
                                                                        const value = e.currentTarget.value;
                                                                        try {
                                                                            setError('');
                                                                            const updatedTask = await taskService.update(t.id, { outputTarget: value === '' ? undefined : Number(value) });
                                                                            if (updatedTask && updatedTask.id) {
                                                                                setAllTasks(prev => prev.map(tk => tk.id === updatedTask.id ? updatedTask : tk));
                                                                            }
                                                                            if (id) { 
                                                                                const g = await goalService.getByTeam(id); setGoals(g); 
                                                                                if (isAdmin) {
                                                                                    const inv = await inventoryService.getByTeam(id); setInventoryItems(inv || []);
                                                                                }
                                                                            }
                                                                        } catch (err: any) {
                                                                            setError(err?.response?.data?.error || 'Không thể cập nhật mục tiêu');
                                                                        }
                                                                    }}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                                                    style={{ width: 72, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'right', background: 'var(--bg-card)' }}
                                                                />
                                                            ) : (
                                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{target}</span>
                                                            )}
                                                            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</span>
                                                            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: PROGRESS_COLOR }}>{pct}%</span>
                                                        </div>
                                                        <div style={{ position: 'relative', marginTop: 8, height: 18 }}>
                                                            <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 4, background: 'var(--border)', borderRadius: 2 }} />
                                                            <div style={{ position: 'absolute', left: 0, top: 7, height: 4, width: `${pct}%`, background: PROGRESS_COLOR, borderRadius: 2, transition: 'width 0.15s ease' }} />
                                                            <input
                                                                type="range"
                                                                min={0}
                                                                max={Math.max(target, 1)}
                                                                value={Math.min(actual, target > 0 ? target : actual)}
                                                                onChange={(e) => {
                                                                    const val = clampActual(Number(e.target.value));
                                                                    setAllTasks(prev => prev.map(tk => tk.id === t.id ? { ...tk, actualOutput: val } : tk));
                                                                }}
                                                                onMouseUp={(e) => persistActual(Number((e.currentTarget as HTMLInputElement).value))}
                                                                onTouchEnd={(e) => persistActual(Number((e.currentTarget as HTMLInputElement).value))}
                                                                style={{ position: 'absolute', left: 0, right: 0, top: 0, width: '100%', height: 18, margin: 0, accentColor: PROGRESS_COLOR, cursor: 'pointer', background: 'transparent' }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{ background: t.priority >= 3 ? '#f5e6d3' : t.priority >= 2 ? '#f9f1e3' : '#f0fdf4', color: t.priority >= 3 ? '#a0673c' : t.priority >= 2 ? '#c9884a' : '#16a34a', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                                {t.priority >= 3 ? 'Cao' : t.priority >= 2 ? 'TB' : 'Thấp'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {isAdmin ? (
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <select value={t.memberId || ''} onChange={async e => {
                                                        const nextMemberId = e.target.value;
                                                        try {
                                                            let updatedTask;
                                                            if (!nextMemberId) {
                                                                updatedTask = await taskService.assign(t.id, '');
                                                            } else if (t.memberId && t.memberId !== nextMemberId) {
                                                                const reason = window.prompt('Lý do chuyển giao công việc?', 'Điều phối lại nhân sự') || 'Điều phối lại nhân sự';
                                                                updatedTask = await taskService.transfer(t.id, nextMemberId, reason);
                                                            } else {
                                                                updatedTask = await taskService.assign(t.id, nextMemberId);
                                                            }
                                                            if (updatedTask && updatedTask.id) {
                                                                setAllTasks(prev => prev.map(tk => tk.id === updatedTask.id ? updatedTask : tk));
                                                            }
                                                            if (id) { const g = await goalService.getByTeam(id); setGoals(g); }
                                                        } catch (error: any) {
                                                            alert(error.response?.data?.message || error.message || 'Không thể giao việc');
                                                        }
                                                    }} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', minWidth: 145 }}>
                                                        <option value="">— Nhân viên chính —</option>
                                                        {team?.members?.map(m => <option key={m.userId} value={m.userId}>{m.fullName || m.username}</option>)}
                                                    </select>
                                                    <select value={t.backupMemberId || ''} onChange={async e => {
                                                        try {
                                                            const updatedTask = await taskService.setBackup(t.id, e.target.value);
                                                            if (updatedTask && updatedTask.id) {
                                                                setAllTasks(prev => prev.map(tk => tk.id === updatedTask.id ? updatedTask : tk));
                                                            }
                                                            if (id) { const g = await goalService.getByTeam(id); setGoals(g); }
                                                        } catch (error: any) {
                                                            alert(error.response?.data?.message || error.message || 'Không thể chọn người sao lưu');
                                                        }
                                                    }} style={{ background: '#fff7ed', border: '1px solid #fde3c7', borderRadius: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', minWidth: 170, color: '#d97706' }}>
                                                        <option value="">— Nhân viên thay thế —</option>
                                                        {team?.members?.map(m => <option key={m.userId} value={m.userId}>{m.fullName || m.username}</option>)}
                                                    </select>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {t.memberName && <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(t.memberName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>{getInitials(t.memberName)}</div>}
                                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.memberName || 'Chưa giao'}</span>
                                                    {t.backupMemberName && <span style={{ marginLeft: 8, fontSize: 11, color: '#9a8a6f' }}>Nhân viên thay thế: {t.backupMemberName}</span>}
                                                    {t.memberId && t.memberId !== user?.id && (
                                                        <ion-icon
                                                            name="chatbubble-ellipses"
                                                            onClick={() => { setChatTab('dm'); setDmUserId(t.memberId!); setShowChat(true); }}
                                                            style={{ cursor: 'pointer', color: '#d4a574', marginLeft: 4, fontSize: 16 }}
                                                            title={`Nhắn tin với ${t.memberName}`}
                                                        ></ion-icon>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {isAdmin && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {editingTaskId === t.id ? (
                                                        <>
                                                            <button onClick={() => handleUpdateTask(t.id)} disabled={loading || !editTaskTitle.trim()} title="Lưu" style={{ background: '#16a34a', border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', fontSize: 13, width: 28, height: 28, display: 'grid', placeItems: 'center', opacity: loading || !editTaskTitle.trim() ? 0.55 : 1 }}><ion-icon name="checkmark-outline"></ion-icon></button>
                                                            <button onClick={cancelEditTask} title="Hủy" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, width: 28, height: 28, display: 'grid', placeItems: 'center' }}><ion-icon name="close-outline"></ion-icon></button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => startEditTask(t)} title="Sửa" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, width: 28, height: 28, display: 'grid', placeItems: 'center' }}><ion-icon name="create-outline"></ion-icon></button>
                                                            <button onClick={() => handleDeleteTask(t.id)} title="Xóa" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, opacity: 0.75, width: 28, height: 28, display: 'grid', placeItems: 'center' }}><ion-icon name="trash-outline"></ion-icon></button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            });
                        })()}
                    </tbody>
                </table>
                </div>
            </div>

            {/* ===== BẢNG LƯƠNG ===== */}
            {isAdmin && (
                <PayrollPanel
                    key={id!}
                    teamId={id!}
                    onEditAttendance={(_memberId, date) => {
                        if (date) setAttendanceDate(date);
                        setShowTeamAttendance(true);
                    }}
                />
            )}

            {/* ===== BẢNG KHO HÀNG (INVENTORY) ===== */}
            {isAdmin && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 18 }}>
                <div style={{ padding: '16px 24px', borderBottom: showInventory ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}><ion-icon name="cube-outline" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 6, color: '#d4a574' }}></ion-icon> KHO HÀNG ({inventoryItems.length})</h3>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Quản lý nguyên liệu và thành phẩm</p>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {isAdmin && (
                            <button onClick={() => setShowStockIn(true)} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ion-icon name="add-circle"></ion-icon> Nhập kho
                            </button>
                        )}
                        <button onClick={() => setShowInventory(p => !p)} style={{
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: 'none',
                            padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            {showInventory ? 'Ẩn bảng' : 'Xem chi tiết'}
                            <ion-icon name={showInventory ? "chevron-up-outline" : "chevron-down-outline"}></ion-icon>
                        </button>
                    </div>
                </div>

                {showInventory && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'transparent' }}>
                            {['Tên mặt hàng', 'Tình trạng', 'Số lượng', 'Cập nhật', ''].map((h, i) => (
                                <th key={i} style={{ padding: '10px 16px', textAlign: h === 'Số lượng' ? 'center' : 'left', fontSize: 11, fontWeight: 700, color: h === 'Số lượng' ? '#d4a574' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {inventoryItems.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
                                    <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Chưa có sản phẩm trong kho</p>
                                    <p style={{ fontSize: 14, marginBottom: 24 }}>Khi bạn nhập kho hoặc tạo sản phẩm mới, dữ liệu sẽ xuất hiện tại đây.</p>
                                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                        <button onClick={() => setShowStockIn(true)} style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>+ Nhập kho</button>
                                    </div>
                                </td>
                            </tr>
                        ) : inventoryItems.map(item => {
                            let statusColor = '#16a34a'; let statusBg = 'rgba(22, 163, 74, 0.15)'; let statusLabel = 'Còn hàng';
                            if (item.status === 'OUT_OF_STOCK') { statusColor = '#ef4444'; statusBg = 'rgba(239, 68, 68, 0.15)'; statusLabel = 'Hết hàng'; }
                            else if (item.status === 'LOW_STOCK') { statusColor = '#f59e0b'; statusBg = 'rgba(245, 158, 11, 0.15)'; statusLabel = 'Sắp hết'; }

                            return (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{getInventoryProductName(item)}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Mức báo hết: &lt;= {Number(item.lowStockThreshold).toLocaleString('vi-VN')} {item.unit}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ background: statusBg, color: statusColor, padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }}></div> {statusLabel}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 30px', gap: 6, alignItems: 'baseline', width: '100%', maxWidth: 120, margin: '0 auto' }}>
                                            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: '#3b82f6', letterSpacing: '0.5px' }}>
                                                {Number(item.quantity).toLocaleString('vi-VN')}
                                            </div>
                                            <div style={{ textAlign: 'left', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                                                {item.unit}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button onClick={() => setEditItem({ ...item, name: getInventoryProductName(item) })} style={{ background: 'var(--bg-input)', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Chỉnh sửa</button>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        {isAdmin && <button onClick={() => handleDeleteInventory(item.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, opacity: 0.6 }}><ion-icon name="trash-outline"></ion-icon></button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                </div>
                )}
            </div>
            )}

                        {/* ===== CHAT PANEL (Messenger-style) ===== */}
            {showChat && (
                <div style={{
                    position: 'fixed', right: 80, bottom: 0,
                    width: chatExpanded ? 800 : 440, height: 480,
                    background: 'var(--bg-card, #ffffff)', boxShadow: 'var(--shadow-lg, 0 4px 24px rgba(0,0,0,0.15))',
                    zIndex: 9999, display: 'flex', flexDirection: 'row',
                    border: '1px solid var(--border, #e4e6eb)', borderBottom: 'none',
                    borderTopLeftRadius: 12, borderTopRightRadius: 12,
                    transition: 'width 0.3s ease',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
                    overflow: 'hidden'
                }}>
                    {/* ===== LEFT: conversation list ===== */}
                    <div style={{
                        width: chatExpanded ? 320 : 0, flexShrink: 0,
                        display: 'flex', flexDirection: 'column',
                        borderRight: '1px solid var(--border, #e4e6eb)',
                        background: 'var(--bg-secondary, #fff)',
                        overflow: 'hidden',
                        transition: 'width 0.3s ease'
                    }}>
                        {/* Sidebar header — chỉ 1 nút đóng (X) gọn */}
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border, #e4e6eb)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #050505)', letterSpacing: '-0.5px' }}>Đoạn chat</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button onClick={() => setShowChat(false)} aria-label="Đóng" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-input, #e4e6eb)', border: 'none', color: 'var(--text-primary, #050505)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Đóng chat"
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger, #f02849)'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input, #e4e6eb)'; e.currentTarget.style.color = 'var(--text-primary, #050505)'; }}>
                                    <ion-icon name="close" style={{ fontSize: 22 }}></ion-icon>
                                </button>
                            </div>
                        </div>

                        {/* Search box */}
                        <div style={{ padding: '8px 12px', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input, #f0f2f5)', borderRadius: 20, padding: '8px 12px' }}>
                                <ion-icon name="search-outline" style={{ color: 'var(--text-secondary, #65676b)', fontSize: 16 }}></ion-icon>
                                <input placeholder="Tìm kiếm nhân viên" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary, #050505)' }} />
                            </div>
                        </div>

                        {/* Tab pills: Nhóm / Cá nhân */}
                        <div style={{ display: 'flex', padding: '4px 12px 8px', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => { setChatTab('group'); setDmUserId(null); }} style={{ flex: 1, padding: '8px 12px', borderRadius: 18, border: 'none', cursor: 'pointer', background: chatTab === 'group' ? '#b97820' : 'var(--bg-input, #e4e6eb)', color: chatTab === 'group' ? '#fff' : 'var(--text-primary, #050505)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <ion-icon name="people" style={{ fontSize: 14 }}></ion-icon> Nhóm {chatTab === 'group' && renderUnreadBadge(unreadGroupCount)}
                            </button>
                            <button onClick={() => setChatTab('dm')} style={{ flex: 1, padding: '8px 12px', borderRadius: 18, border: 'none', cursor: 'pointer', background: chatTab === 'dm' ? '#b97820' : 'var(--bg-input, #e4e6eb)', color: chatTab === 'dm' ? '#fff' : 'var(--text-primary, #050505)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <ion-icon name="person" style={{ fontSize: 14 }}></ion-icon> Cá nhân {chatTab === 'dm' && renderUnreadBadge(unreadDmTotal)}
                            </button>
                        </div>

                        {/* Conversation list */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {/* Group chat row (always first when on group tab) */}
                            {chatTab === 'group' && (
                                <div onClick={() => { setChatTab('group'); setDmUserId(null); }} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderRadius: 8, margin: '2px 8px', background: chatTab === 'group' && !dmUserId ? 'rgba(212, 165, 116, 0.15)' : 'transparent' }}
                                    onMouseEnter={e => { if (!(chatTab === 'group' && !dmUserId)) e.currentTarget.style.background = 'var(--bg-card-hover, #f0f2f5)'; }} onMouseLeave={e => { if (!(chatTab === 'group' && !dmUserId)) e.currentTarget.style.background = 'transparent'; }}>
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                                            <ion-icon name="people" style={{ fontSize: 24 }}></ion-icon>
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary, #050505)' }}>Nhóm chung</span>
                                            {renderUnreadBadge(unreadGroupCount)}
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary, #65676b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {team.members?.length || 0} thành viên • Trò chuyện nhóm
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DM rows */}
                            {(chatTab === 'dm' || chatTab === 'group') && (team.members?.filter(m => m.userId !== user?.id) || []).map(m => {
                                const isOnline = onlineUsers.includes(m.userId);
                                const preview = dmPreviews.find(p => p.senderId === m.userId || p.recipientId === m.userId);
                                const unreadCount = unreadDmCounts[m.userId] || 0;
                                const previewText = preview ? (preview.content.length > 35 ? preview.content.substring(0, 35) + '…' : preview.content) : 'Bắt đầu trò chuyện';
                                const previewTime = preview ? new Date(preview.createdAt) : null;
                                const timeLabel = previewTime ? (() => {
                                    const diff = Date.now() - previewTime.getTime();
                                    if (diff < 60000) return 'Vừa xong';
                                    if (diff < 3600000) return `${Math.floor(diff / 60000)} ph`;
                                    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;
                                    return previewTime.toLocaleDateString('vi-VN');
                                })() : '';
                                const isActive = chatTab === 'dm' && dmUserId === m.userId;
                                const isUnread = unreadCount > 0;
                                return (
                                    <div key={m.userId} onClick={() => { setChatTab('dm'); setDmUserId(m.userId); }} style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderRadius: 8, margin: '2px 8px', background: isActive ? 'rgba(212, 165, 116, 0.15)' : (isUnread ? 'rgba(212, 165, 116, 0.08)' : 'transparent') }}
                                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-card-hover, #f0f2f5)'; }} onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isUnread ? 'rgba(212, 165, 116, 0.08)' : 'transparent'; }}>
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: avatarColor(m.fullName || m.username), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>{getInitials(m.fullName || m.username)}</div>
                                            {isOnline && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: '#31a24c', border: '2.5px solid #fff' }} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: isUnread ? 800 : 600, fontSize: 15, color: 'var(--text-primary, #050505)' }}>{m.fullName || m.username}</span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 11, color: isUnread ? '#d4a574' : 'var(--text-secondary, #65676b)', fontWeight: isUnread ? 700 : 500 }}>{timeLabel}</span>
                                                    {renderUnreadBadge(unreadCount)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 13, color: isUnread ? 'var(--text-primary, #050505)' : 'var(--text-secondary, #65676b)', fontWeight: isUnread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {previewText}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ===== RIGHT: chat conversation ===== */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-card, #fff)' }}>
                        {/* Conversation header (Messenger style) — có nút đóng tắt (X) + mở rộng/thu nhỏ */}
                        <div style={{ flexShrink: 0, padding: '10px 12px', borderBottom: '1px solid var(--border, #e4e6eb)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card, #fff)' }}>
                            {chatTab === 'dm' && dmUserId ? (() => {
                                const m = team.members?.find(mem => mem.userId === dmUserId);
                                const isOnline = m ? onlineUsers.includes(m.userId) : false;
                                return (
                                    <>
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: avatarColor(m?.fullName || m?.username || '?'), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15 }}>{getInitials(m?.fullName || m?.username || '?')}</div>
                                            {isOnline && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: '#31a24c', border: '2.5px solid #fff' }} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary, #050505)' }}>{m?.fullName || m?.username}</div>
                                            <div style={{ fontSize: 12, color: isOnline ? '#31a24c' : 'var(--text-secondary, #65676b)' }}>{isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</div>
                                        </div>
                                    </>
                                );
                            })() : (
                                <>
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                        <ion-icon name="people" style={{ fontSize: 22 }}></ion-icon>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary, #050505)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Nhóm chung</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary, #65676b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.members?.length || 0} thành viên</div>
                                    </div>
                                </>
                            )}
                            {/* Nhóm nút hành động bên phải — gọn, kiểu Messenger */}
                            <button title="Tính năng gọi thoại sắp ra mắt" style={{ opacity: 0.5, cursor: 'not-allowed', width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: 'none', color: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ion-icon name="call" style={{ fontSize: 20 }}></ion-icon>
                            </button>
                            <button title="Tính năng gọi video sắp ra mắt" style={{ opacity: 0.5, cursor: 'not-allowed', width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: 'none', color: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ion-icon name="videocam" style={{ fontSize: 20 }}></ion-icon>
                            </button>

                            <button onClick={() => setChatExpanded(!chatExpanded)} style={{ width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-secondary, #65676b)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={chatExpanded ? "Ẩn danh sách" : "Xem danh sách thành viên"} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input, #f0f2f5)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <ion-icon name={chatExpanded ? "chevron-forward-outline" : "people-outline"} style={{ fontSize: 22 }}></ion-icon>
                            </button>
                            <button onClick={() => setShowChat(false)} aria-label="Đóng" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-input, #e4e6eb)', border: 'none', color: 'var(--text-primary, #050505)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Đóng chat"
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger, #f02849)'; e.currentTarget.style.color = '#fff'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input, #e4e6eb)'; e.currentTarget.style.color = 'var(--text-primary, #050505)'; }}>
                                <ion-icon name="close" style={{ fontSize: 22 }}></ion-icon>
                            </button>
                        </div>

                        {/* Messages area */}
                        {(chatTab === 'group' || (chatTab === 'dm' && dmUserId)) ? (
                            <>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg-card, #fff)' }}>
                                    {chatMessages.length === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text-secondary, #65676b)', fontSize: 14, padding: '60px 20px', margin: 'auto' }}>
                                            <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--bg-input, #f0f2f5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                                <ion-icon name="chatbubbles" style={{ fontSize: 48, color: '#d4a574' }}></ion-icon>
                                            </div>
                                            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary, #050505)', marginBottom: 4 }}>Bắt đầu cuộc trò chuyện</div>
                                            <div>Gửi tin nhắn cho {chatTab === 'dm' ? 'bạn bè' : 'nhóm'} của bạn</div>
                                        </div>
                                    )}
                                    {chatMessages.map((msg, idx) => {
                                        const isMe = msg.senderId === user?.id;
                                        const prev = idx > 0 ? chatMessages[idx - 1] : null;
                                        const isFirstOfGroup = !prev || prev.senderId !== msg.senderId;
                                        return (
                                            <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end', marginTop: isFirstOfGroup ? 12 : 2, marginBottom: 2 }}>
                                                {!isMe ? (
                                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(msg.senderName), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0, visibility: isFirstOfGroup ? 'visible' : 'hidden' }}>
                                                        {getInitials(msg.senderName)}
                                                    </div>
                                                ) : (
                                                    <div style={{ width: 28, flexShrink: 0 }} />
                                                )}
                                                <div style={{ maxWidth: '65%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                                    {isFirstOfGroup && !isMe && chatTab === 'group' && (
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary, #65676b)', marginBottom: 2, paddingLeft: 10 }}>{msg.senderName}</div>
                                                    )}
                                                    <div style={{
                                                        background: isMe ? '#d4a574' : 'var(--bg-input, #f0f2f5)',
                                                        color: isMe ? '#fff' : 'var(--text-primary, #050505)',
                                                        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                                        padding: '8px 12px',
                                                        fontSize: 14,
                                                        lineHeight: 1.4,
                                                        wordBreak: 'break-word',
                                                        whiteSpace: 'pre-wrap',
                                                        boxShadow: 'none'
                                                    }}>
                                                        {msg.content}
                                                    </div>
                                                    {msg.attachmentUrl && (
                                                        <div style={{ marginTop: 4, padding: 8, background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, maxWidth: 300 }}>
                                                            {msg.attachmentType?.startsWith('image/') ? (
                                                                <img src={msg.attachmentUrl} alt={msg.attachmentName} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, objectFit: 'contain' }} />
                                                            ) : (
                                                                <>
                                                                    <ion-icon name="document-attach" style={{ fontSize: 24, color: '#d4a574' }}></ion-icon>
                                                                    <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {msg.attachmentName || 'Tệp đính kèm'}
                                                                    </a>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted, #65676b)', marginTop: 2, padding: '0 6px' }}>
                                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {showChatTokens && ` • ${formatTokenCount(estimateTokens(msg.content))} token`}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Attachment preview */}
                                {chatAttachment && (
                                    <div style={{ padding: '10px 16px', background: 'var(--bg-input, #f0f2f5)', borderTop: '1px solid var(--border, #e4e6eb)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary, #050505)' }}>
                                            <ion-icon name="document-text" style={{ color: '#d4a574', fontSize: 20 }}></ion-icon>
                                            <span style={{ maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chatAttachment.name}</span>
                                        </div>
                                        <button onClick={() => setChatAttachment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #65676b)', display: 'flex' }}><ion-icon name="close-circle" style={{ fontSize: 20 }}></ion-icon></button>
                                    </div>
                                )}

                                {/* Chat input (Messenger-style) */}
                                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border, #e4e6eb)', background: 'var(--bg-card, #fff)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={e => { if(e.target.files && e.target.files[0]) setChatAttachment(e.target.files[0]) }} />
                                    <button onClick={() => fileInputRef.current?.click()} style={{ width: 40, height: 40, borderRadius: '50%', background: 'transparent', border: 'none', color: '#d4a574', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Gửi ảnh"
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input, #f0f2f5)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <ion-icon name="image" style={{ fontSize: 24 }}></ion-icon>
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} style={{ width: 40, height: 40, borderRadius: '50%', background: 'transparent', border: 'none', color: '#d4a574', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Đính kèm file"
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input, #f0f2f5)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <ion-icon name="attach" style={{ fontSize: 24 }}></ion-icon>
                                    </button>
                                    <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-input, #f0f2f5)', borderRadius: 20, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border, #e4e6eb)' }}>
                                        <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendChat()} placeholder={chatTab === 'dm' ? "Aa" : "Aa, nhắn cho nhóm..."} style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary, #050505)' }} />
                                    </div>
                                    <button onClick={handleSendChat} disabled={!chatInput.trim() && !chatAttachment} style={{ width: 40, height: 40, borderRadius: '50%', background: chatInput.trim() || chatAttachment ? '#b97820' : 'var(--bg-input, #e4e6eb)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: chatInput.trim() || chatAttachment ? 'pointer' : 'default', flexShrink: 0, transition: 'background 0.15s' }} title="Gửi">
                                        <ion-icon name={chatInput.trim() || chatAttachment ? "send" : "thumbs-up"} style={{ fontSize: 18, marginLeft: chatInput.trim() || chatAttachment ? 2 : 0 }}></ion-icon>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', color: 'var(--text-secondary, #65676b)' }}>
                                <div>
                                    <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'var(--bg-input, #f0f2f5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <ion-icon name="chatbubbles" style={{ fontSize: 60, color: '#d4a574' }}></ion-icon>
                                    </div>
                                    <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text-primary, #050505)', marginBottom: 6 }}>Chào mừng bạn đến với đoạn chat</div>
                                    <div style={{ fontSize: 14 }}>Chọn một cuộc trò chuyện bên trái để bắt đầu nhắn tin</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===== MODALS (preserved) ===== */}
            {/* Video Call Modal */}
            {showVideoCall && (
                <div style={{ position: 'fixed', inset: 0, background: '#111827', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
                    {/* Header */}
                    <div style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', color: '#fff' }}>
                        <h2 style={{ margin: 0, fontWeight: 500, fontSize: 18 }}>Cuộc gọi nhóm {team?.name}</h2>
                        <button onClick={() => setShowVideoCall(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', display: 'flex' }}><ion-icon name="expand"></ion-icon></button>
                    </div>

                    {/* Main Content */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', gap: 16 }}>
                        <div style={{ width: 320, height: 240, borderRadius: 12, background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #4b5563', overflow: 'hidden' }}>
                            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ width: 320, height: 240, borderRadius: 12, background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #4b5563', overflow: 'hidden' }}>
                            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            {!remoteVideoRef.current?.srcObject && <ion-icon name="person" style={{ fontSize: 80, color: '#9ca3af', position: 'absolute' }}></ion-icon>}
                        </div>
                        <div style={{ position: 'absolute', bottom: 40, color: '#fff', fontSize: 20, fontWeight: 500 }}>Đang kết nối WebRTC...</div>
                    </div>

                    {/* Controls */}
                    <div style={{ padding: '32px', display: 'flex', justifyContent: 'center', gap: 24, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                        <button style={{ width: 64, height: 64, borderRadius: '50%', background: '#374151', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ion-icon name="mic-outline"></ion-icon></button>
                        <button style={{ width: 64, height: 64, borderRadius: '50%', background: '#374151', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ion-icon name="videocam-outline"></ion-icon></button>
                        <button onClick={() => {
                            if (localVideoRef.current && localVideoRef.current.srcObject) {
                                (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                            }
                            setShowVideoCall(false);
                        }} style={{ width: 64, height: 64, borderRadius: '50%', background: '#ef4444', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ion-icon name="call-outline" style={{ transform: 'rotate(135deg)' }}></ion-icon></button>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {showAddMember && (
                <div className="modal-overlay" onClick={closeModal} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, padding: 0, borderRadius: 20, overflow: 'hidden', background: 'var(--bg-card)', border: 'none', color: '#1a1a1a', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <div style={{ padding: '24px 32px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Mời thành viên</h2>
                            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Gửi lời mời bằng email cho người bạn muốn thêm vào nhóm.</p>
                        </div>
                        <div style={{ padding: '0 32px 24px' }}>
                            {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
                            {planUsage && (
                                <div style={{ background: planUsage.canAddMember ? '#f8fafc' : '#fff7ed', color: '#475569', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12, border: '1px solid var(--border)' }}>
                                    Đang dùng <strong>{planUsage.usersUsed}/{planUsage.maxUsers}</strong> nhân viên • Gói {planUsage.planName}
                                    {!planUsage.canAddMember && <div style={{ color: '#c2410c', marginTop: 4 }}>Đã hết chỗ cho nhân viên mới. Người đã thuộc xưởng khác của cùng chủ vẫn có thể được thêm.</div>}
                                </div>
                            )}
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Email người được mời</label>
                            <input
                                value={inviteEmail}
                                onChange={e => setInviteEmail(e.target.value)}
                                placeholder="name@example.com"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12, fontSize: 14 }}
                            />
                            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Chỉ chủ nhóm hoặc quản trị viên mới có thể gửi lời mời.</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={closeModal} style={{ flex: 1, background: 'var(--bg-input)', color: '#1f2937', border: '1px solid var(--border)', padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Hủy</button>
                                <button onClick={handleInviteMember} disabled={loading} style={{ flex: 1, background: loading ? '#e5e7eb' : '#b97820', color: loading ? '#9ca3af' : '#fff', border: 'none', padding: '12px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Đang gửi...' : 'Gửi lời mời'}</button>
                            </div>
                        </div>
                        {successMsg && <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}><ion-icon name="checkmark-circle" style={{ color: '#10b981' }}></ion-icon> {successMsg}</div>}
                    </div>
                </div>
            )}

            {/* Create Goal Modal */}
            {showCreateGoal && (
                <div className="modal-overlay" onClick={() => setShowCreateGoal(false)} style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, background: 'var(--bg-card)', color: '#1a1a1a', borderRadius: 16 }}>
                        <h2 style={{ marginBottom: 4, color: '#111' }}>Tạo mục tiêu mới</h2>
                        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>AI sẽ tự động chia nhỏ thành các task.</p>
                        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input value={goalTitle} onChange={e => setGoalTitle(e.target.value)} placeholder="Tên mục tiêu *" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} autoFocus />
                            <input value={goalTarget} onChange={e => setGoalTarget(e.target.value)} placeholder="Sản lượng mục tiêu" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                            <input type="datetime-local" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
                            <button onClick={() => setShowCreateGoal(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                            <button onClick={() => handleCreateGoal(false)} disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: '#f0fdf4', color: '#16a34a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{loading ? 'Đang tạo...' : 'Tạo thủ công'}</button>
                            <button onClick={() => handleCreateGoal(true)} disabled={loading || !trialActive} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#b97820', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: trialActive ? 1 : 0.5 }}>{loading ? 'Đang tạo...' : `AI tạo task (${trialDays} ngày)`}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ad Settings Modal */}
            {showAdSettings && (
                <div className="modal-overlay" onClick={() => setShowAdSettings(false)} style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, background: 'var(--bg-card)', color: '#1a1a1a', borderRadius: 16 }}>
                        <h2 style={{ marginBottom: 4, color: '#111' }}>Cài đặt Marketplace</h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', background: 'var(--bg-input)', borderRadius: 8, marginBottom: 16, marginTop: 16 }}>
                            <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} style={{ width: 16, height: 16 }} />
                            <label style={{ fontSize: 14, fontWeight: 600 }}>Công khai trên Marketplace</label>
                        </div>
                        {isPublished && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <input value={adRegion} onChange={e => setAdRegion(e.target.value)} placeholder="Khu vửc" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                                <input value={adSpecialty} onChange={e => setAdSpecialty(e.target.value)} placeholder="Chuyên môn" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                                <input value={adCapacity} onChange={e => setAdCapacity(e.target.value)} placeholder="Năng suất" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }} />
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                            <button onClick={() => setShowAdSettings(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Thoát</button>
                            <button onClick={handleSaveAdSettings} disabled={loading} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#b97820', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{loading ? 'Đang lưu...' : 'Lưu'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Job Labels Modal */}
            {showLabelModal && selectedMemberForLabels && (
                <div className="modal-overlay" onClick={() => setShowLabelModal(false)} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, background: 'var(--bg-card)', color: '#1a1a1a', borderRadius: 16, padding: '24px' }}>
                        <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 18 }}>Phân vai trò</h2>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                            Gán vai trò cho <b>{formatMemberIdentity(selectedMemberForLabels)}</b>. Bạn có thể chọn từ danh sách hoặc tự nhập ở dưới.
                        </p>
                        {hasDuplicateMemberName(selectedMemberForLabels, duplicateMemberNameKeys) && (
                            <div role="alert" style={{ display: 'flex', gap: 8, padding: '9px 11px', margin: '-8px 0 16px', borderRadius: 10, border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', fontSize: 12, lineHeight: 1.4 }}>
                                <ion-icon name="warning-outline" style={{ fontSize: 16, flexShrink: 0 }}></ion-icon>
                                <span>Người này trùng tên với thành viên khác. Hãy kiểm tra đúng username và mã nhân viên trước khi lưu.</span>
                            </div>
                        )}
                        
                        {teamRoles.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                {teamRoles.map(role => {
                                    const currentRoles = editingLabels.split(',').map(r => r.trim()).filter(r => r);
                                    const isSelected = currentRoles.includes(role);
                                    return (
                                        <button 
                                            key={role}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setEditingLabels(currentRoles.filter(r => r !== role).join(', '));
                                                } else {
                                                    setEditingLabels([...currentRoles, role].join(', '));
                                                }
                                            }}
                                            style={{ 
                                                padding: '6px 12px', 
                                                borderRadius: 12, 
                                                border: isSelected ? '1px solid #d4a574' : '1px solid #e2e8f0', 
                                                background: isSelected ? '#fff7ed' : '#f8fafc', 
                                                color: isSelected ? '#d97706' : '#64748b', 
                                                fontSize: 13, 
                                                fontWeight: 600, 
                                                cursor: 'pointer' 
                                            }}
                                        >
                                            {role}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <input
                            value={editingLabels}
                            onChange={e => setEditingLabels(e.target.value)}
                            placeholder="Nhập vai trò khác (phân cách bởi dấu phẩy)..."
                            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', background: 'var(--bg-input)' }}
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSaveLabels()}
                        />
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                            <button onClick={() => { setShowLabelModal(false); setShowManageRolesModal(true); }} style={{ background: 'transparent', border: 'none', color: '#d4a574', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <ion-icon name="list-circle-outline"></ion-icon> Tạo vai trò
                            </button>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => setShowLabelModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                                <button onClick={handleSaveLabels} disabled={loading} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#b97820', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                    {loading ? 'Đang lưu...' : 'Lưu'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Manage Roles Modal */}
            {showManageRolesModal && (
                <div className="modal-overlay" onClick={() => setShowManageRolesModal(false)} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, background: 'var(--bg-card)', color: '#1a1a1a', borderRadius: 16, padding: '24px' }}>
                        <h2 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 18 }}>Quản lý vai trò</h2>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                            Thêm các vai trò chuẩn để phân công nhanh cho thành viên.
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 200, overflowY: 'auto' }}>
                            {teamRoles.length === 0 ? (
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '10px 0' }}>Chưa có vai trò nào</div>
                            ) : (
                                teamRoles.map(role => (
                                    <div key={role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8 }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{role}</span>
                                        <button onClick={async () => {
                                            const updatedRoles = teamRoles.filter(r => r !== role);
                                            setTeamRoles(updatedRoles);
                                            const newMetadata = JSON.stringify({ ...JSON.parse(team?.metadata || '{}'), roles: updatedRoles });
                                            try {
                                                await teamService.update(team!.id, { metadata: newMetadata });
                                                setTeam(prev => prev ? { ...prev, metadata: newMetadata } : prev);
                                            } catch (e) { /* role update failed — UI handles via toast */ }
                                        }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
                                            <ion-icon name="trash-outline" style={{ fontSize: 16 }}></ion-icon>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={newRoleName}
                                onChange={e => setNewRoleName(e.target.value)}
                                placeholder="Nhập tên vai trò mới..."
                                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none' }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && newRoleName.trim()) {
                                        const r = newRoleName.trim();
                                        if (!teamRoles.includes(r)) {
                                            const updatedRoles = [...teamRoles, r];
                                            setTeamRoles(updatedRoles);
                                            setNewRoleName('');
                                            const newMetadata = JSON.stringify({ ...JSON.parse(team?.metadata || '{}'), roles: updatedRoles });
                                            teamService.update(team!.id, { metadata: newMetadata }).then(() => {
                                                setTeam(prev => prev ? { ...prev, metadata: newMetadata } : prev);
                                            }).catch(() => { /* role persist failure handled by UI */ });
                                        }
                                    }
                                }}
                            />
                            <button onClick={async () => {
                                const r = newRoleName.trim();
                                if (r && !teamRoles.includes(r)) {
                                    const updatedRoles = [...teamRoles, r];
                                    setTeamRoles(updatedRoles);
                                    setNewRoleName('');
                                    const newMetadata = JSON.stringify({ ...JSON.parse(team?.metadata || '{}'), roles: updatedRoles });
                                    try {
                                        await teamService.update(team!.id, { metadata: newMetadata });
                                        setTeam(prev => prev ? { ...prev, metadata: newMetadata } : prev);
                                    } catch (e) { /* role update failure handled by UI */ }
                                }
                            }} style={{ background: '#b97820', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', fontWeight: 600, cursor: 'pointer' }}>
                                Thêm
                            </button>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                            <button onClick={() => setShowManageRolesModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Xong
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Inventory Modal */}
            {showAddInventory && isAdmin && (
                <div className="modal-overlay" onClick={() => setShowAddInventory(false)} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1100, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: '90%', background: 'var(--bg-panel, #fff)', color: 'var(--text-primary, #1a1a1a)', borderRadius: 16, padding: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <h2 style={{ margin: '0 0 24px', fontSize: 20 }}>Thêm sản phẩm mới</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Tên hàng hóa <span style={{ color: '#dc2626' }}>*</span></label>
                                <input value={invName} onChange={e => setInvName(e.target.value)} placeholder="Ví dụ: Cà phê hạt loại A..." style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)', fontSize: 15, outline: 'none', background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} autoFocus />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Đơn vị</label>
                                <InventoryUnitCombobox
                                    value={invUnit}
                                    options={inventoryUnitOptions}
                                    onChange={setInvUnit}
                                />
                                <small style={{ display: 'block', marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                                    Chọn đơn vị có sẵn hoặc nhập tên mới để thêm.
                                </small>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Mức báo sắp hết</label>
                                <input type="text" inputMode="decimal" value={formatInventoryNumberInput(invThreshold)} onChange={e => setInvThreshold(normalizeInventoryNumberInput(e.target.value))} placeholder="Cảnh báo khi nhỏ hơn hoặc bằng (VD: 10.000)" style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)', fontSize: 15, outline: 'none', background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 32 }}>
                            <button onClick={() => setShowAddInventory(false)} style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)', background: 'transparent', color: 'var(--text-primary, #64748b)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                            <button onClick={handleAddInventory} disabled={loading || !invName.trim()} style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: '#b97820', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (loading || !invName.trim()) ? 0.6 : 1 }}>
                                {loading ? 'Đang lưu...' : 'Thêm sản phẩm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stock In Modal */}
            {showStockIn && isAdmin && (
                <div className="modal-overlay" onClick={() => { setShowStockIn(false); setShowStockInProductMenu(false); }} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal" onClick={e => { e.stopPropagation(); setShowStockInProductMenu(false); }} style={{ maxWidth: 500, width: '90%', background: 'var(--bg-panel, #fff)', color: 'var(--text-primary, #1a1a1a)', borderRadius: 16, padding: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <h2 style={{ margin: '0 0 24px', fontSize: 20 }}>Nhập kho</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Chọn hàng hóa <span style={{ color: '#dc2626' }}>*</span></label>
                                <div className="inventory-product-select" onClick={e => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        className={`inventory-product-select__trigger ${showStockInProductMenu ? 'is-open' : ''}`}
                                        onClick={() => setShowStockInProductMenu(current => !current)}
                                        aria-haspopup="listbox"
                                        aria-expanded={showStockInProductMenu}
                                    >
                                        <span className={stockInItemId ? '' : 'is-placeholder'}>
                                            {stockInItemId
                                                ? getInventoryProductName(inventoryItems.find(item => item.id === stockInItemId))
                                                : '-- Chọn hàng hóa --'}
                                        </span>
                                        <ion-icon name={showStockInProductMenu ? 'chevron-up-outline' : 'chevron-down-outline'}></ion-icon>
                                    </button>

                                    {showStockInProductMenu && (
                                        <div className="inventory-product-select__menu" role="listbox">
                                            <button
                                                type="button"
                                                className="inventory-product-select__create"
                                                onClick={() => {
                                                    setShowStockInProductMenu(false);
                                                    setShowAddInventory(true);
                                                }}
                                            >
                                                <ion-icon name="add-circle-outline"></ion-icon>
                                                Tạo sản phẩm mới
                                            </button>

                                            <div className="inventory-product-select__items">
                                                {inventoryItems.length === 0 ? (
                                                    <p className="inventory-product-select__empty">Chưa có sản phẩm nào.</p>
                                                ) : inventoryItems.map(item => (
                                                    <div
                                                        key={item.id}
                                                        className={`inventory-product-option ${stockInItemId === item.id ? 'is-selected' : ''}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="inventory-product-option__name"
                                                            role="option"
                                                            aria-selected={stockInItemId === item.id}
                                                            onClick={() => {
                                                                setStockInItemId(item.id);
                                                                setShowStockInProductMenu(false);
                                                            }}
                                                        >
                                                            <span>{getInventoryProductName(item)}</span>
                                                            <small>{Number(item.quantity ?? 0).toLocaleString('vi-VN')} {item.unit || ''}</small>
                                                        </button>
                                                        <div className="inventory-product-option__actions">
                                                            <button
                                                                type="button"
                                                                title="Chỉnh sửa sản phẩm"
                                                                aria-label={`Chỉnh sửa ${getInventoryProductName(item)}`}
                                                                onClick={() => {
                                                                    setShowStockInProductMenu(false);
                                                                    setEditItem({ ...item, name: getInventoryProductName(item) });
                                                                }}
                                                            >
                                                                <ion-icon name="create-outline"></ion-icon>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="is-delete"
                                                                title="Xóa sản phẩm"
                                                                aria-label={`Xóa ${getInventoryProductName(item)}`}
                                                                onClick={() => handleDeleteInventory(item.id)}
                                                            >
                                                                <ion-icon name="trash-outline"></ion-icon>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Số lượng nhập thêm <span style={{ color: '#dc2626' }}>*</span></label>
                                <input type="text" inputMode="decimal" value={formatInventoryNumberInput(stockInQty)} onChange={e => setStockInQty(normalizeInventoryNumberInput(e.target.value))} placeholder="0" style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)', fontSize: 15, outline: 'none', background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)' }} autoFocus />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 32 }}>
                            <button onClick={() => { setShowStockIn(false); setShowStockInProductMenu(false); }} style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)', background: 'transparent', color: 'var(--text-primary, #64748b)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                            <button onClick={handleStockIn} disabled={loading || !stockInItemId || !stockInQty} style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: '#b97820', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (loading || !stockInItemId || !stockInQty) ? 0.6 : 1 }}>
                                {loading ? 'Đang lưu...' : 'Lưu vào kho'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Edit Inventory Modal */}
            {editItem && isAdmin && (
                <div className="modal-overlay" onClick={() => setEditItem(null)} style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1100, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: '90%', background: 'var(--bg-panel, #fff)', color: 'var(--text-primary, #1a1a1a)', borderRadius: 16, padding: '32px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                        <h2 style={{ margin: '0 0 24px', fontSize: 20 }}>Chỉnh sửa thông tin hàng hóa</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Tên hàng hóa <span style={{ color: '#dc2626' }}>*</span></label>
                                <input value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)', fontSize: 15, outline: 'none', background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} autoFocus />
                            </div>
                            <div style={{ display: 'flex', gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Số lượng <span style={{ color: '#dc2626' }}>*</span></label>
                                    <input type="text" inputMode="decimal" value={formatInventoryNumberInput(editItem.quantity)} onChange={e => setEditItem({ ...editItem, quantity: normalizeInventoryNumberInput(e.target.value) })} style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)', fontSize: 15, outline: 'none', background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Đơn vị</label>
                                    <InventoryUnitCombobox
                                        value={editItem.unit || ''}
                                        options={inventoryUnitOptions}
                                        onChange={unit => setEditItem({ ...editItem, unit })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Mức báo sắp hết</label>
                                <input type="text" inputMode="decimal" value={formatInventoryNumberInput(editItem.lowStockThreshold)} onChange={e => setEditItem({ ...editItem, lowStockThreshold: normalizeInventoryNumberInput(e.target.value) })} style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #cbd5e1)', fontSize: 15, outline: 'none', background: 'var(--bg-input, #f8fafc)', color: 'var(--text-primary, #1a1a1a)', boxSizing: 'border-box' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 32 }}>
                            <button onClick={() => setEditItem(null)} style={{ padding: '12px 24px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)', background: 'transparent', color: 'var(--text-primary, #64748b)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Hủy</button>
                            <button onClick={handleEditInventory} disabled={loading || !editItem.name.trim()} style={{ padding: '12px 24px', borderRadius: 10, border: 'none', background: '#b97820', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: (loading || !editItem.name.trim()) ? 0.6 : 1 }}>
                                {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Modal */}
            {showStatsModal && (
                <div className="modal-overlay" onClick={() => setShowStatsModal(false)} style={{ background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)', zIndex: 10000, position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', transition: 'all 0.3s ease' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1200, width: '92%', background: 'var(--bg-card, #1e293b)', color: 'var(--text-primary, #f8fafc)', borderRadius: 24, padding: '32px', border: '1px solid var(--border, #334155)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border, #334155)', paddingBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <span style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(212,165,116,0.15)', display: 'grid', placeItems: 'center', color: '#d4a574' }}>
                                    <ion-icon name="analytics-outline" style={{ fontSize: 24 }}></ion-icon>
                                </span>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
                                        Báo cáo & Phân tích Thống kê Sản xuất
                                    </h2>
                                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>Dữ liệu thời gian thực của nhóm: <b>{team.name}</b></p>
                                </div>
                            </div>
                            <button onClick={() => setShowStatsModal(false)} style={{ background: 'var(--bg-input, #f1f5f9)', border: 'none', width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}><ion-icon name="close" style={{ fontSize: 22 }}></ion-icon></button>
                        </div>

                        {/* Top Metrics Grid */}
                        {(() => {
                            const total = latestGoalTasks.length;
                            const completed = latestGoalTasks.filter(t => t.status === 'COMPLETED').length;
                            const inProgress = latestGoalTasks.filter(t => t.status === 'IN_PROGRESS').length;
                            const pending = latestGoalTasks.filter(t => t.status === 'PENDING').length;

                            // Calculate total yield rate
                            let totalTarget = 0;
                            let totalActual = 0;
                            latestGoalTasks.forEach(t => {
                                totalTarget += Number(t.outputTarget ?? t.workload ?? 0);
                                totalActual += Number(t.actualOutput ?? 0);
                            });
                            const yieldRate = totalTarget > 0 ? Math.min(100, Math.round((totalActual / totalTarget) * 100)) : 0;

                            return (
                                <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
                                    {[
                                        { label: 'Tổng số công việc', value: total, unit: 'nhiệm vụ', icon: 'clipboard-outline', bg: 'rgba(212,165,116,0.1)', color: '#d4a574' },
                                        { label: 'Đã hoàn thành', value: completed, unit: 'nhiệm vụ', icon: 'checkmark-circle-outline', bg: 'rgba(16,185,129,0.1)', color: '#10b981' },
                                        { label: 'Đang thực hiện', value: inProgress, unit: 'nhiệm vụ', icon: 'sync-outline', bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
                                        { label: 'Hiệu suất sản lượng', value: `${yieldRate}%`, unit: `${totalActual}/${totalTarget} mục tiêu`, icon: 'trending-up-outline', bg: 'rgba(245,158,11,0.1)', color: '#f59e0b' }
                                    ].map((m, idx) => (
                                        <div key={idx} style={{ background: 'var(--bg-secondary, #1e293b)', padding: '20px', borderRadius: 16, border: '1px solid var(--border, #334155)', display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ width: 48, height: 48, borderRadius: 12, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color, fontSize: 24 }}>
                                                <ion-icon name={m.icon}></ion-icon>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>{m.value}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>{m.label}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{m.unit}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Main Dashboard Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 24 }}>

                                    {/* Left Column: Radial Chart & Completion Rate Details */}
                                    <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: '24px', borderRadius: 18, border: '1px solid var(--border, #334155)', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <ion-icon name="pie-chart-outline" style={{ color: '#d4a574' }}></ion-icon>
                                            Phân tích tỷ lệ hoàn thành
                                        </h3>

                                        {(() => {
                                            const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
                                            const rad = 60;
                                            const circ = 2 * Math.PI * rad;
                                            const offset = circ - (rate / 100) * circ;
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '12px 0' }}>
                                                    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
                                                        <svg style={{ transform: 'rotate(-90deg)', width: 140, height: 140 }}>
                                                            <circle cx="70" cy="70" r={rad} fill="transparent" stroke="var(--border, #334155)" strokeWidth="10" />
                                                            <circle cx="70" cy="70" r={rad} fill="transparent" stroke="url(#radialGoldGradMain)" strokeWidth="12" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }} />
                                                            <defs>
                                                                <linearGradient id="radialGoldGradMain" x1="0%" y1="0%" x2="100%" y2="100%">
                                                                    <stop offset="0%" stopColor="#f59e0b" />
                                                                    <stop offset="100%" stopColor="#d4a574" />
                                                                </linearGradient>
                                                            </defs>
                                                        </svg>
                                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                                                            <span style={{ fontSize: 32, fontWeight: 900 }}>{rate}%</span>
                                                            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>Tỷ lệ đạt</span>
                                                        </div>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Tổng quan công việc</h4>
                                                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                            Tiến độ chung của toàn đội đạt <b>{rate}%</b>. Có <b>{completed}</b> nhiệm vụ đã được xác nhận hoàn thành, <b>{inProgress}</b> nhiệm vụ đang tiến hành, và <b>{pending}</b> nhiệm vụ đang chờ xử lý.
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Horizontal Task Breakdown Chart */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                                                <span>Trạng thái công việc chi tiết</span>
                                                <span>{completed} / {total} hoàn thành</span>
                                            </div>
                                            <div style={{ height: 16, background: 'var(--border, #334155)', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
                                                <div style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%`, background: '#10b981', transition: 'width 0.4s' }} title={`Hoàn thành: ${completed}`} />
                                                <div style={{ width: `${total > 0 ? (inProgress / total) * 100 : 0}%`, background: '#3b82f6', transition: 'width 0.4s' }} title={`Đang làm: ${inProgress}`} />
                                                <div style={{ width: `${total > 0 ? (pending / total) * 100 : 0}%`, background: '#94a3b8', transition: 'width 0.4s' }} title={`Chờ xử lý: ${pending}`} />
                                            </div>
                                            <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></span> Hoàn thành ({completed})</span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }}></span> Đang làm ({inProgress})</span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }}></span> Chờ xử lý ({pending})</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Yield Target vs. Actual (Real CSS/SVG Bar Charts) */}
                                    <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: '24px', borderRadius: 18, border: '1px solid var(--border, #334155)', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <ion-icon name="cube-outline" style={{ color: '#d4a574' }}></ion-icon>
                                            Tổng hợp sản lượng theo đơn vị mục tiêu
                                        </h3>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                                            {(() => {
                                                const map: Record<string, { target: number; actual: number }> = {};
                                                latestGoalTasks.forEach(t => {
                                                    const unit = (t.unit && t.unit.trim()) ? t.unit : 'kg';
                                                    const target = Number(t.outputTarget ?? t.workload ?? 0);
                                                    const actual = Number(t.actualOutput ?? 0);
                                                    if (!map[unit]) map[unit] = { target: 0, actual: 0 };
                                                    map[unit].target += target;
                                                    map[unit].actual += actual;
                                                });
                                                const items = Object.entries(map);
                                                if (items.length === 0) {
                                                    return <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Chưa có dữ liệu sản lượng.</div>;
                                                }
                                                return items.map(([unit, val]) => {
                                                    const pct = val.target > 0 ? Math.min(100, Math.round((val.actual / val.target) * 100)) : 0;
                                                    return (
                                                        <div key={unit} style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: 14, border: '1px solid var(--border, #334155)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ion-icon name="pricetag-outline" style={{ color: '#d4a574', fontSize: 14 }}></ion-icon> Đơn vị: {unit}</span>
                                                                <span style={{ color: '#d4a574' }}>{val.actual} / {val.target} {unit} ({pct}%)</span>
                                                            </div>
                                                            <div style={{ height: 20, background: 'var(--bg-input, #0f172a)', borderRadius: 10, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                                <div style={{ height: '100%', background: 'linear-gradient(90deg, #d4a574 0%, #f59e0b 100%)', width: `${pct}%`, borderRadius: 10, transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                                                <span style={{ position: 'absolute', right: 10, fontSize: 11, fontWeight: 800, color: pct > 80 ? '#fff' : 'var(--text-secondary)' }}>{pct}%</span>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom Grid: Employee Performance & Stage Breakdown */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 24 }}>

                                    {/* Left: Employee Productivity Ranking */}
                                    <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: '24px', borderRadius: 18, border: '1px solid var(--border, #334155)' }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 18px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <ion-icon name="people-outline" style={{ color: '#d4a574' }}></ion-icon>
                                            Xếp hạng hiệu suất nhân sự
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
                                            {(() => {
                                                const map: Record<string, { total: number; completed: number; name: string }> = {};
                                                latestGoalTasks.forEach(t => {
                                                    const mId = t.memberId || 'unassigned';
                                                    const mName = t.memberName || 'Chưa giao';
                                                    if (!map[mId]) map[mId] = { total: 0, completed: 0, name: mName };
                                                    map[mId].total += 1;
                                                    if (t.status === 'COMPLETED') map[mId].completed += 1;
                                                });

                                                const items = Object.values(map).sort((a, b) => {
                                                    const pctA = a.total > 0 ? (a.completed / a.total) : 0;
                                                    const pctB = b.total > 0 ? (b.completed / b.total) : 0;
                                                    return pctB - pctA;
                                                });

                                                if (items.length === 0) {
                                                    return <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Chưa có nhân sự phụ trách.</div>;
                                                }
                                                return items.map((m, i) => {
                                                    const pct = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
                                                    const rankGold = i === 0 && pct > 0;
                                                    return (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-card, #1e293b)', padding: '12px 16px', borderRadius: 14, border: rankGold ? '1px solid #f59e0b' : '1px solid var(--border, #334155)', position: 'relative' }}>
                                                            {rankGold && (
                                                                <span style={{ position: 'absolute', top: -8, right: 12, background: 'linear-gradient(135deg, #f59e0b, #d4a574)', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase' }}>Top 1</span>
                                                            )}
                                                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: avatarColor(m.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                                                                {getInitials(m.name)}
                                                            </div>
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                                                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.name}</span>
                                                                    <span style={{ color: pct === 100 ? '#10b981' : '#d4a574' }}>{m.completed}/{m.total} task ({pct}%)</span>
                                                                </div>
                                                                <div style={{ height: 6, background: 'var(--bg-input, #0f172a)', borderRadius: 3, overflow: 'hidden' }}>
                                                                    <div style={{ height: '100%', background: pct === 100 ? '#10b981' : 'linear-gradient(90deg, #d4a574 0%, #f59e0b 100%)', width: `${pct}%`, borderRadius: 3, transition: 'width 0.5s ease' }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>

                                    {/* Right: Production Stage Distribution Chart */}
                                    <div style={{ background: 'var(--bg-secondary, #1e293b)', padding: '24px', borderRadius: 18, border: '1px solid var(--border, #334155)', display: 'flex', flexDirection: 'column' }}>
                                        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 18px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <ion-icon name="git-network-outline" style={{ color: '#d4a574' }}></ion-icon>
                                            Phân bổ theo giai đoạn sản xuất
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
                                            {(() => {
                                                const map: Record<string, number> = {};
                                                let maxCount = 0;
                                                latestGoalTasks.forEach(t => {
                                                    const stage = t.productionStage || 'Chưa phân loại';
                                                    map[stage] = (map[stage] || 0) + 1;
                                                    if (map[stage] > maxCount) maxCount = map[stage];
                                                });
                                                const items = Object.entries(map);
                                                if (items.length === 0) {
                                                    return <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Không có giai đoạn nào.</div>;
                                                }
                                                return items.map(([stage, count], i) => {
                                                    return (
                                                        <div key={i} style={{ background: 'var(--bg-card, #1e293b)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border, #334155)', display: 'flex', alignItems: 'center', gap: 16 }}>
                                                            <div style={{ width: 100, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                                {stage}
                                                            </div>
                                                            <div style={{ flex: 1, height: 16, background: 'var(--bg-input, #0f172a)', borderRadius: 8, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                                <span style={{ position: 'absolute', right: 8, fontSize: 10, fontWeight: 800, color: '#fff' }}>{count} task</span>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                </div>
                                </>
                            );
                        })()}

                        {/* Footer buttons */}
                        <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #334155)', paddingTop: 20, textAlign: 'right' }}>
                            <button onClick={() => setShowStatsModal(false)} style={{ background: '#b97820', color: '#fff', border: 'none', padding: '12px 36px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 14, boxShadow: '0 4px 12px rgba(185,120,32,0.24)', transition: 'all 0.2s' }}>Đóng báo cáo</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Schedule Modal */}
            {showScheduleModal && (() => {
                const year = calendarDate.getFullYear();
                const month = calendarDate.getMonth();
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const selectedDate = new Date(selectedCalendarDate);
                selectedDate.setHours(0, 0, 0, 0);

                const normalizeDate = (value?: string | null) => {
                    if (!value) return null;
                    const parsed = new Date(value);
                    if (Number.isNaN(parsed.getTime())) return null;
                    parsed.setHours(0, 0, 0, 0);
                    return parsed;
                };

                const getTaskEnd = (task: Task) => normalizeDate(task.dueTime || task.deadline);
                const getTaskStart = (task: Task) => normalizeDate(task.startTime || task.actualStart || task.createdAt);
                const isTaskOverdue = (task: Task) => {
                    const end = getTaskEnd(task);
                    return !!end && end.getTime() < today.getTime() && task.status !== 'COMPLETED';
                };
                const isSameDay = (a: Date | null, b: Date) => !!a && a.getTime() === b.getTime();
                const isActiveStatus = (task: Task) => !['COMPLETED', 'CANCELLED'].includes(task.status);
                const isTaskOnDate = (task: Task, date: Date) => {
                    const start = getTaskStart(task);
                    const end = getTaskEnd(task);
                    const isBetween = !!start && !!end && date.getTime() >= start.getTime() && date.getTime() <= end.getTime() && isActiveStatus(task);
                    return isSameDay(start, date) || isSameDay(end, date) || isBetween;
                };
                const tasksForDate = (date: Date) => latestGoalTasks
                    .filter(task => isTaskOnDate(task, date))
                    .sort((a, b) => {
                        const aDueToday = isSameDay(getTaskEnd(a), date) ? 0 : 1;
                        const bDueToday = isSameDay(getTaskEnd(b), date) ? 0 : 1;
                        if (aDueToday !== bDueToday) return aDueToday - bDueToday;
                        return (getTaskEnd(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (getTaskEnd(b)?.getTime() || Number.MAX_SAFE_INTEGER);
                    });
                const selectedTasks = tasksForDate(selectedDate);
                const selectedDueTasks = selectedTasks.filter(task => isSameDay(getTaskEnd(task), selectedDate));
                const selectedWorkTasks = selectedTasks.filter(task => !isSameDay(getTaskEnd(task), selectedDate));
                const activeTasks = latestGoalTasks
                    .filter(task => isActiveStatus(task))
                    .sort((a, b) => (getTaskEnd(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (getTaskEnd(b)?.getTime() || Number.MAX_SAFE_INTEGER));
                const overdueTasks = latestGoalTasks.filter(isTaskOverdue);
                const scheduledTasks = latestGoalTasks.filter(task => getTaskEnd(task) || getTaskStart(task));
                const completedCount = latestGoalTasks.filter(task => task.status === 'COMPLETED').length;
                const completionRate = latestGoalTasks.length ? Math.round((completedCount / latestGoalTasks.length) * 100) : 0;
                const dayMs = 24 * 60 * 60 * 1000;
                const daysFromToday = (date: Date) => Math.round((date.getTime() - today.getTime()) / dayMs);
                const dueSoonTasks = activeTasks.filter(task => {
                    const end = getTaskEnd(task);
                    if (!end) return false;
                    const remaining = daysFromToday(end);
                    return remaining >= 0 && remaining <= 3;
                });
                const noDeadlineTasks = activeTasks.filter(task => !getTaskEnd(task));
                const taskStarts = latestGoalTasks.map(getTaskStart).filter((date): date is Date => !!date);
                const taskEnds = latestGoalTasks.map(getTaskEnd).filter((date): date is Date => !!date);
                const planStart = normalizeDate(latestGoal?.createdAt)
                    || (taskStarts.length ? new Date(Math.min(...taskStarts.map(date => date.getTime()))) : null);
                const planEnd = normalizeDate(latestGoal?.deadline)
                    || (taskEnds.length ? new Date(Math.max(...taskEnds.map(date => date.getTime()))) : null);
                const planRemainingDays = planEnd ? daysFromToday(planEnd) : null;
                const getTaskProgress = (task: Task) => {
                    const actual = Number(task.actualOutput ?? 0);
                    const target = Number(task.outputTarget ?? 0);
                    if (target > 0) return Math.min(100, Math.max(0, Math.round((actual / target) * 100)));
                    return Math.min(100, Math.max(0, Number(task.completionPercentage) || (task.status === 'COMPLETED' ? 100 : 0)));
                };
                const getDeadlineMeta = (task: Task) => {
                    if (task.status === 'COMPLETED') return { label: 'Đã hoàn thành', tone: 'success', detail: 'Công việc đã hoàn tất' };
                    if (task.status === 'CANCELLED') return { label: 'Đã hủy', tone: 'muted', detail: 'Công việc không còn thực hiện' };
                    const end = getTaskEnd(task);
                    if (!end) return { label: 'Chưa đặt hạn', tone: 'muted', detail: 'Cần bổ sung hạn hoàn thành' };
                    const remaining = daysFromToday(end);
                    if (remaining < 0) return { label: `Quá hạn ${Math.abs(remaining)} ngày`, tone: 'danger', detail: 'Chưa hoàn thành đúng thời hạn' };
                    if (remaining === 0) return { label: 'Hết hạn hôm nay', tone: 'danger', detail: 'Cần hoàn thành trong hôm nay' };
                    if (remaining <= 3) return { label: `Còn ${remaining} ngày`, tone: 'warning', detail: 'Sắp đến hạn hoàn thành' };
                    return { label: `Còn ${remaining} ngày`, tone: 'safe', detail: 'Tiến độ vẫn trong kế hoạch' };
                };
                const prioritizedTasks = [...latestGoalTasks].sort((a, b) => {
                    const toneRank: Record<string, number> = { danger: 0, warning: 1, muted: 2, safe: 3, success: 4 };
                    const rankDifference = toneRank[getDeadlineMeta(a).tone] - toneRank[getDeadlineMeta(b).tone];
                    if (rankDifference !== 0) return rankDifference;
                    return (getTaskEnd(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (getTaskEnd(b)?.getTime() || Number.MAX_SAFE_INTEGER);
                });

                const monthStart = new Date(year, month, 1);
                const monthDays = new Date(year, month + 1, 0).getDate();
                const mondayOffset = monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1;
                const prevMonthDays = new Date(year, month, 0).getDate();
                const calendarCells: { day: number; date: Date; isCurrentMonth: boolean }[] = [];

                for (let i = mondayOffset - 1; i >= 0; i--) {
                    const day = prevMonthDays - i;
                    calendarCells.push({ day, date: new Date(year, month - 1, day), isCurrentMonth: false });
                }
                for (let day = 1; day <= monthDays; day++) {
                    calendarCells.push({ day, date: new Date(year, month, day), isCurrentMonth: true });
                }
                while (calendarCells.length % 7 !== 0 || calendarCells.length < 35) {
                    const day = calendarCells.length - (mondayOffset + monthDays) + 1;
                    calendarCells.push({ day, date: new Date(year, month + 1, day), isCurrentMonth: false });
                }

                const goToMonth = (offset: number) => {
                    const next = new Date(year, month + offset, 1);
                    next.setHours(0, 0, 0, 0);
                    setCalendarDate(next);
                    setSelectedCalendarDate(next);
                };

                const formatFullDate = (date: Date | null) => date
                    ? date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : 'Chưa cập nhật';
                const planCountdown = latestGoal?.status === 'COMPLETED'
                    ? { label: 'Đã hoàn thành', tone: 'success' }
                    : planRemainingDays === null
                        ? { label: 'Chưa đặt hạn', tone: 'muted' }
                        : planRemainingDays < 0
                            ? { label: `Quá hạn ${Math.abs(planRemainingDays)} ngày`, tone: 'danger' }
                            : planRemainingDays === 0
                                ? { label: 'Hết hạn hôm nay', tone: 'danger' }
                                : { label: `Còn ${planRemainingDays} ngày`, tone: planRemainingDays <= 3 ? 'warning' : 'safe' };
                const alertContent = overdueTasks.length > 0
                    ? { tone: 'danger', title: `${overdueTasks.length} công việc đã quá hạn`, text: 'Các công việc này chưa hoàn thành và cần được xử lý ngay.' }
                    : dueSoonTasks.length > 0
                        ? { tone: 'warning', title: `${dueSoonTasks.length} công việc sắp đến hạn`, text: 'Còn tối đa 3 ngày để hoàn thành các công việc ưu tiên.' }
                        : noDeadlineTasks.length > 0
                            ? { tone: 'muted', title: `${noDeadlineTasks.length} công việc chưa có hạn`, text: 'Hãy bổ sung hạn hoàn thành để theo dõi tiến độ chính xác.' }
                            : { tone: 'success', title: 'Kế hoạch đang đúng tiến độ', text: 'Hiện không có công việc quá hạn hoặc sắp đến hạn.' };

                const formatMonthTitle = calendarDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
                const selectedTitle = selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
                const selectedSubtitle = selectedDate.getTime() === today.getTime()
                    ? 'Hôm nay'
                    : `${selectedDueTasks.length} hạn chót, ${selectedWorkTasks.length} việc đang làm`;

                return (
                    <div ref={scheduleModalRef} className="schedule-modal-overlay" onClick={() => setShowScheduleModal(false)}>
                        <section className="schedule-modal" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Lịch sản xuất">
                            <header className="schedule-modal__header schedule-modal__reveal">
                                <div>
                                    <p className="schedule-modal__eyebrow">{latestGoal?.title || 'Kế hoạch hiện tại'}</p>
                                    <h2>Lịch sản xuất</h2>
                                    <span>Theo dõi thời hạn, tiến độ và cảnh báo công việc</span>
                                </div>
                                <button type="button" className="schedule-modal__close" onClick={() => setShowScheduleModal(false)} aria-label="Đóng lịch sản xuất">
                                    <ion-icon name="close-outline"></ion-icon>
                                </button>
                            </header>

                            <section className="schedule-plan-window schedule-modal__reveal" aria-label="Thời gian kế hoạch">
                                <div className="schedule-plan-date">
                                    <span>Bắt đầu</span>
                                    <strong>{formatFullDate(planStart)}</strong>
                                </div>
                                <div className="schedule-plan-track" aria-label={`Tiến độ ${completionRate}%`}>
                                    <div className="schedule-plan-track__labels">
                                        <span>Tiến độ kế hoạch</span>
                                        <strong>{completionRate}%</strong>
                                    </div>
                                    <div className="schedule-plan-track__bar"><i style={{ width: `${completionRate}%` }} /></div>
                                    <span className={`schedule-plan-countdown tone-${planCountdown.tone}`}>{planCountdown.label}</span>
                                </div>
                                <div className="schedule-plan-date is-end">
                                    <span>Hạn hoàn thành</span>
                                    <strong>{formatFullDate(planEnd)}</strong>
                                </div>
                            </section>

                            <div className={`schedule-alert tone-${alertContent.tone} schedule-modal__reveal`} role="status">
                                <span className="schedule-alert__icon" aria-hidden="true">
                                    <ion-icon name={alertContent.tone === 'success' ? 'checkmark-circle-outline' : 'warning-outline'}></ion-icon>
                                </span>
                                <div>
                                    <strong>{alertContent.title}</strong>
                                    <span>{alertContent.text}</span>
                                </div>
                            </div>

                            <div className="schedule-tabs schedule-modal__reveal" role="tablist" aria-label="Chế độ xem lịch sản xuất">
                                <button type="button" role="tab" aria-selected={scheduleView === 'overview'} className={scheduleView === 'overview' ? 'is-active' : ''} onClick={() => setScheduleView('overview')}>
                                    <ion-icon name="warning-outline"></ion-icon>
                                    Tiến độ & cảnh báo
                                </button>
                                <button type="button" role="tab" aria-selected={scheduleView === 'calendar'} className={scheduleView === 'calendar' ? 'is-active' : ''} onClick={() => setScheduleView('calendar')}>
                                    <ion-icon name="calendar-outline"></ion-icon>
                                    Lịch tháng
                                </button>
                            </div>

                            <div className="schedule-view-content schedule-modal__reveal" key={scheduleView}>
                                {scheduleView === 'overview' ? (
                                    <div className="schedule-overview">
                                        <section className="schedule-overview__main">
                                            <div className="schedule-section-head">
                                                <div>
                                                    <span>Công việc theo mức độ ưu tiên</span>
                                                    <strong>Thời hạn và tiến độ thực hiện</strong>
                                                </div>
                                                <em>{latestGoalTasks.length} việc</em>
                                            </div>

                                            {prioritizedTasks.length === 0 ? (
                                                <div className="schedule-empty schedule-empty--overview">
                                                    <ion-icon name="clipboard-outline"></ion-icon>
                                                    <strong>Chưa có công việc trong kế hoạch</strong>
                                                    <span>Tạo công việc mới để bắt đầu theo dõi thời hạn và tiến độ.</span>
                                                </div>
                                            ) : (
                                                <div className="schedule-work-list">
                                                    {prioritizedTasks.map(task => {
                                                        const deadlineMeta = getDeadlineMeta(task);
                                                        const progress = getTaskProgress(task);
                                                        const start = getTaskStart(task);
                                                        const end = getTaskEnd(task);
                                                        return (
                                                            <article className={`schedule-work-item tone-${deadlineMeta.tone}`} key={task.id}>
                                                                <div className="schedule-work-item__top">
                                                                    <div>
                                                                        <strong>{task.title}</strong>
                                                                        <span>{task.productionStage || 'Chưa gắn công đoạn'} · {task.memberName || 'Chưa giao người phụ trách'}</span>
                                                                    </div>
                                                                    <mark className={`tone-${deadlineMeta.tone}`}>{deadlineMeta.label}</mark>
                                                                </div>
                                                                <div className="schedule-work-item__dates">
                                                                    <span><ion-icon name="play-outline"></ion-icon>Bắt đầu <strong>{formatFullDate(start)}</strong></span>
                                                                    <i aria-hidden="true"></i>
                                                                    <span><ion-icon name="flag-outline"></ion-icon>Hết hạn <strong>{formatFullDate(end)}</strong></span>
                                                                </div>
                                                                <div className="schedule-work-item__progress">
                                                                    <div><i style={{ width: `${progress}%` }} /></div>
                                                                    <strong>{progress}%</strong>
                                                                </div>
                                                                <small>{deadlineMeta.detail}</small>
                                                            </article>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </section>

                                        <aside className="schedule-overview__aside">
                                            <section className="schedule-progress-card">
                                                <span>Tiến độ tổng thể</span>
                                                <strong>{completionRate}%</strong>
                                                <div><i style={{ width: `${completionRate}%` }} /></div>
                                                <small>{completedCount}/{latestGoalTasks.length} công việc đã hoàn thành</small>
                                            </section>

                                            <div className="schedule-compact-stats">
                                                <div><span>Đang thực hiện</span><strong>{activeTasks.length}</strong></div>
                                                <div className={overdueTasks.length ? 'is-danger' : ''}><span>Quá hạn</span><strong>{overdueTasks.length}</strong></div>
                                                <div className={dueSoonTasks.length ? 'is-warning' : ''}><span>Sắp đến hạn</span><strong>{dueSoonTasks.length}</strong></div>
                                                <div><span>Hoàn thành</span><strong>{completedCount}</strong></div>
                                            </div>

                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    className="schedule-primary-action"
                                                    onClick={() => {
                                                        setShowScheduleModal(false);
                                                        if (!selectedGoalId && goals.length > 0) setSelectedGoalId(goals[0].id);
                                                        setShowAddTask(true);
                                                    }}
                                                >
                                                    <ion-icon name="add-outline"></ion-icon>
                                                    Tạo công việc mới
                                                </button>
                                            )}
                                        </aside>
                                    </div>
                                ) : (
                                    <>
                                    <div className="schedule-layout schedule-layout--calendar">
                                        <div className="schedule-calendar-panel">
                                            <div className="schedule-calendar-toolbar">
                                                <button type="button" onClick={() => goToMonth(-1)} aria-label="Tháng trước">
                                                    <ion-icon name="chevron-back-outline"></ion-icon>
                                                </button>
                                                <div>
                                                    <strong>{formatMonthTitle}</strong>
                                                    <span>{scheduledTasks.length} việc có lịch</span>
                                                    <button
                                                        type="button"
                                                        className="schedule-today-jump"
                                                        onClick={() => {
                                                            const current = new Date();
                                                            current.setHours(0, 0, 0, 0);
                                                            setCalendarDate(new Date(current.getFullYear(), current.getMonth(), 1));
                                                            setSelectedCalendarDate(current);
                                                        }}
                                                    >
                                                        Hôm nay
                                                    </button>
                                                </div>
                                                <button type="button" onClick={() => goToMonth(1)} aria-label="Tháng sau">
                                                    <ion-icon name="chevron-forward-outline"></ion-icon>
                                                </button>
                                            </div>

                                            <div className="schedule-weekdays">
                                                {['Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'CN'].map(day => <span key={day}>{day}</span>)}
                                            </div>

                                            <div className="schedule-calendar-grid">
                                                {calendarCells.map((cell, index) => {
                                                    cell.date.setHours(0, 0, 0, 0);
                                                    const dayTasks = tasksForDate(cell.date);
                                                    const hasOverdue = dayTasks.some(isTaskOverdue);
                                                    const hasActive = dayTasks.some(task => isActiveStatus(task));
                                                    const hasCompleted = dayTasks.some(task => task.status === 'COMPLETED');
                                                    const isSelected = cell.date.getTime() === selectedDate.getTime();
                                                    const isTodayCell = cell.date.getTime() === today.getTime();
                                                    const tone = hasOverdue ? 'danger' : hasActive ? 'progress' : hasCompleted ? 'success' : dayTasks.length > 0 ? 'planned' : 'empty';

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={`${cell.date.toISOString()}-${index}`}
                                                            className={`schedule-day tone-${tone}${cell.isCurrentMonth ? '' : ' is-muted'}${isSelected ? ' is-selected' : ''}${isTodayCell ? ' is-today' : ''}`}
                                                            onClick={() => {
                                                                const selected = new Date(cell.date);
                                                                selected.setHours(0, 0, 0, 0);
                                                                setCalendarDate(new Date(selected.getFullYear(), selected.getMonth(), 1));
                                                                setSelectedCalendarDate(selected);
                                                            }}
                                                            aria-label={`${cell.day}, ${dayTasks.length} công việc`}
                                                        >
                                                            <span className="schedule-day__top">
                                                                <span className="schedule-day__number">{cell.day}</span>
                                                                {isTodayCell && <span className="schedule-day__today">Nay</span>}
                                                            </span>
                                                            {dayTasks.length > 0 && (
                                                                <span className="schedule-day__dots">
                                                                    {dayTasks.slice(0, 4).map(task => <i key={task.id} className={`status-${task.status.toLowerCase()}`} />)}
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <aside className="schedule-detail-panel">
                                            <section className="schedule-card schedule-card--selected">
                                                <div className="schedule-card__head">
                                                    <div>
                                                        <span>{selectedSubtitle}</span>
                                                        <strong>{selectedTitle}</strong>
                                                    </div>
                                                    <em>{selectedTasks.length} việc</em>
                                                </div>

                                                {selectedTasks.length === 0 ? (
                                                    <div className="schedule-empty schedule-empty--calendar">
                                                        <ion-icon name="calendar-clear-outline"></ion-icon>
                                                        <strong>Không có công việc trong ngày</strong>
                                                        <span>Chọn ngày có chấm màu để xem chi tiết.</span>
                                                    </div>
                                                ) : (
                                                    <div className="schedule-task-list">
                                                        {selectedTasks.map(task => {
                                                            const deadlineMeta = getDeadlineMeta(task);
                                                            return (
                                                                <article className={`schedule-task tone-${deadlineMeta.tone}`} key={task.id}>
                                                                    <div>
                                                                        <strong>{task.title}</strong>
                                                                        <span>{task.memberName || 'Chưa giao người phụ trách'}</span>
                                                                        <small>{formatFullDate(getTaskStart(task))} → {formatFullDate(getTaskEnd(task))}</small>
                                                                    </div>
                                                                    <mark className={`tone-${deadlineMeta.tone}`}>{deadlineMeta.label}</mark>
                                                                </article>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </section>

                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    className="schedule-primary-action"
                                                    onClick={() => {
                                                        setShowScheduleModal(false);
                                                        if (!selectedGoalId && goals.length > 0) setSelectedGoalId(goals[0].id);
                                                        setShowAddTask(true);
                                                    }}
                                                >
                                                    <ion-icon name="add-outline"></ion-icon>
                                                    Tạo công việc mới
                                                </button>
                                            )}
                                        </aside>
                                    </div>

                                    <footer className="schedule-legend">
                                        <span><i className="legend-progress" />Đang làm</span>
                                        <span><i className="legend-danger" />Quá hạn</span>
                                        <span><i className="legend-success" />Hoàn thành</span>
                                        <span><i className="legend-planned" />Có lịch</span>
                                    </footer>
                                    </>
                                )}
                            </div>
                        </section>
                    </div>
                );
            })()}

            {/* Legacy schedule modal kept disabled while the new calendar UI is active. */}
            {false && showScheduleModal && (
                <div className="modal-overlay" onClick={() => setShowScheduleModal(false)} style={{ background: 'rgba(10, 10, 12, 0.85)', backdropFilter: 'blur(10px)', zIndex: 10000, position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', transition: 'all 0.3s ease' }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1250, width: '92%', background: '#121214', color: '#ffffff', borderRadius: 20, padding: '24px', border: '1px solid #232328', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Inter', sans-serif" }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #232328', paddingBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <span style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(59, 130, 246, 0.15)', display: 'grid', placeItems: 'center', color: '#3b82f6' }}>
                                    <ion-icon name="calendar-outline" style={{ fontSize: 24 }}></ion-icon>
                                </span>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                                        Lịch trình & Kế hoạch Sản xuất
                                    </h2>
                                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8e8e93' }}>Theo dõi lịch hạn công việc và tiến độ trực quan</p>
                                </div>
                            </div>
                            <button onClick={() => setShowScheduleModal(false)} style={{ background: 'rgba(255, 255, 255, 0.08)', border: 'none', width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#ffffff', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}><ion-icon name="close" style={{ fontSize: 22 }}></ion-icon></button>
                        </div>

                        {/* Calendar Body Layout (Split Panel) */}
                        {(() => {
                            const year = calendarDate.getFullYear();
                            const month = calendarDate.getMonth();

                            // Days calculations
                            const numDays = new Date(year, month + 1, 0).getDate();
                            const startDay = new Date(year, month, 1).getDay(); // Sunday=0, Monday=1
                            const offset = startDay === 0 ? 6 : startDay - 1; // Align to Monday start

                            const days = [];

                            // Prev month padding
                            const prevMonthNumDays = new Date(year, month, 0).getDate();
                            for (let i = offset - 1; i >= 0; i--) {
                                days.push({ day: prevMonthNumDays - i, isCurrentMonth: false, monthOffset: -1 });
                            }

                            // Current month days
                            for (let d = 1; d <= numDays; d++) {
                                days.push({ day: d, isCurrentMonth: true, monthOffset: 0 });
                            }

                            // Next month padding to fill grid to 35 or 42 cells
                            const totalCells = days.length <= 35 ? 35 : 42;
                            const nextPadding = totalCells - days.length;
                            for (let d = 1; d <= nextPadding; d++) {
                                days.push({ day: d, isCurrentMonth: false, monthOffset: 1 });
                            }

                            // Filter tasks for current calendar view
                            const getTasksForDay = (cellDay: number, cellMonthOffset: number) => {
                                const targetMonth = month + cellMonthOffset;
                                const targetDate = new Date(year, targetMonth, cellDay);
                                targetDate.setHours(0,0,0,0);

                                return latestGoalTasks.filter(t => {
                                    const start = t.createdAt ? new Date(t.createdAt) : null;
                                    if (start) start.setHours(0,0,0,0);
                                    const end = (t.dueTime || t.deadline) ? new Date(t.dueTime || t.deadline) : null;
                                    if (end) end.setHours(0,0,0,0);

                                    const isStart = start && start.getTime() === targetDate.getTime();
                                    const isEnd = end && end.getTime() === targetDate.getTime();
                                    const isBetween = start && end && targetDate.getTime() > start.getTime() && targetDate.getTime() < end.getTime() && t.status === 'IN_PROGRESS';

                                    return isStart || isEnd || isBetween;
                                });
                            };

                            const handlePrevMonth = () => {
                                setCalendarDate(new Date(year, month - 1, 1));
                            };

                            const handleNextMonth = () => {
                                setCalendarDate(new Date(year, month + 1, 1));
                            };

                            const selectedTasks = getTasksForDay(selectedCalendarDay, 0);

                            return (
                                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24, alignItems: 'start', width: '100%' }}>

                                    {/* Left Side: Calendar Grid */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        {/* Month Header Controller */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>
                                                Tháng {month + 1}, {year}
                                            </h3>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button onClick={handlePrevMonth} style={{ width: 32, height: 32, borderRadius: 8, background: '#1e1e24', color: '#ffffff', border: '1px solid #2d2d34', cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#2a2a32'} onMouseLeave={e => e.currentTarget.style.background = '#1e1e24'}>
                                                    <ion-icon name="chevron-back-outline" style={{ fontSize: 16 }}></ion-icon>
                                                </button>
                                                <button onClick={handleNextMonth} style={{ width: 32, height: 32, borderRadius: 8, background: '#1e1e24', color: '#ffffff', border: '1px solid #2d2d34', cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#2a2a32'} onMouseLeave={e => e.currentTarget.style.background = '#1e1e24'}>
                                                    <ion-icon name="chevron-forward-outline" style={{ fontSize: 16 }}></ion-icon>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Days Header */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, textAlign: 'center', fontWeight: 600, fontSize: 13, color: '#8e8e93' }}>
                                            {['Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'CN'].map(d => (
                                                <div key={d} style={{ padding: '6px 0' }}>{d}</div>
                                            ))}
                                        </div>

                                        {/* Days Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                                            {days.map((item, idx) => {
                                                const cellDate = new Date(year, month + item.monthOffset, item.day);
                                                cellDate.setHours(0,0,0,0);

                                                // Find events for this cell
                                                const dayEvents: any[] = [];
                                                latestGoalTasks.forEach(t => {
                                                    const start = t.createdAt ? new Date(t.createdAt) : null;
                                                    if (start) start.setHours(0,0,0,0);
                                                    const end = (t.dueTime || t.deadline) ? new Date(t.dueTime || t.deadline) : null;
                                                    if (end) end.setHours(0,0,0,0);

                                                    const isStart = start && start.getTime() === cellDate.getTime();
                                                    const isEnd = end && end.getTime() === cellDate.getTime();
                                                    const isBetween = start && end && cellDate.getTime() > start.getTime() && cellDate.getTime() < end.getTime() && t.status === 'IN_PROGRESS';

                                                    if (isStart) dayEvents.push({ type: 'START', task: t });
                                                    if (isEnd) dayEvents.push({ type: 'END', task: t });
                                                    if (isBetween) dayEvents.push({ type: 'BETWEEN', task: t });
                                                });

                                                const isSelected = item.isCurrentMonth && item.day === selectedCalendarDay;
                                                const hasStart = dayEvents.some(e => e.type === 'START');
                                                const hasEnd = dayEvents.some(e => e.type === 'END');
                                                const hasBetween = dayEvents.some(e => e.type === 'BETWEEN');
                                                const hasTasks = dayEvents.length > 0;

                                                let borderStyle = '1px solid #232328';
                                                let bgStyle = '#16161a';
                                                let colorStyle = item.isCurrentMonth ? '#ffffff' : '#4e4e54';
                                                let shadowStyle = 'none';

                                                if (hasEnd) {
                                                    borderStyle = '1px solid #ef4444';
                                                    bgStyle = 'rgba(239,68,68,0.06)';
                                                } else if (hasBetween) {
                                                    borderStyle = '1px solid #f59e0b';
                                                    bgStyle = 'rgba(245,158,11,0.06)';
                                                } else if (hasStart) {
                                                    borderStyle = '1px solid #3b82f6';
                                                    bgStyle = 'rgba(59,130,246,0.06)';
                                                }

                                                if (isSelected) {
                                                    borderStyle = '1.5px solid #e2b053';
                                                    bgStyle = '#1e1e1e';
                                                    shadowStyle = '0 0 12px rgba(226, 176, 83, 0.15)';
                                                }

                                                return (
                                                     <div
                                                         key={idx}
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             if (item.monthOffset !== 0) {
                                                                 setCalendarDate(new Date(year, month + item.monthOffset, 1));
                                                             }
                                                             setSelectedCalendarDay(item.day);
                                                         }}
                                                         style={{
                                                             aspectRatio: '1/1',
                                                             minHeight: 80,
                                                             borderRadius: 10,
                                                             border: borderStyle,
                                                             background: bgStyle,
                                                             boxShadow: shadowStyle,
                                                             padding: '10px',
                                                             display: 'flex',
                                                             flexDirection: 'column',
                                                             justifyContent: 'space-between',
                                                             cursor: 'pointer',
                                                             position: 'relative',
                                                             transition: 'all 0.2s ease',
                                                             opacity: item.isCurrentMonth ? 1 : 0.45
                                                         }}
                                                     >
                                                         {/* Day number */}
                                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                             <span style={{ fontSize: 14, fontWeight: 700, color: colorStyle }}>{item.day}</span>
                                                             {hasEnd && (
                                                                 <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} title="Hạn chót nhiệm vụ!" />
                                                             )}
                                                         </div>

                                                         {/* Task List Pills (Only if present) */}
                                                          {hasTasks && (
                                                              <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                                                                  {dayEvents.slice(0, 3).map((ev, evIdx) => {
                                                                      let dotColor = '#94a3b8';
                                                                      if (ev.type === 'START') dotColor = '#3b82f6';
                                                                      else if (ev.type === 'END') dotColor = '#ef4444';
                                                                      else if (ev.type === 'BETWEEN') dotColor = '#f59e0b';
                                                                      if (ev.task.status === 'COMPLETED') dotColor = '#10b981';

                                                                      return (
                                                                          <span
                                                                              key={evIdx}
                                                                              style={{
                                                                                  width: 6,
                                                                                  height: 6,
                                                                                  borderRadius: '50%',
                                                                                  background: dotColor
                                                                              }}
                                                                              title={`${ev.task.title}`}
                                                                          />
                                                                      );
                                                                  })}
                                                              </div>
                                                          )}
                                                     </div>
                                                 );
                                             })}
                                        </div>

                                        {/* Legend indicator */}
                                        <div style={{ display: 'flex', gap: 16, fontSize: 12, fontWeight: 500, color: '#8e8e93', borderTop: '1px solid #232328', paddingTop: 16, flexWrap: 'wrap' }}>
                                             <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }}></span> Đang làm</span>
                                             <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></span> Quá hạn</span>
                                             <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></span> Hoàn thành</span>
                                             <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8e8e93' }}></span> Chờ xử lý</span>
                                        </div>
                                    </div>

                                    {/* Right Side: Selected Day Details & Deadlines List */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        {/* Selected Day Details Card */}
                                        <div style={{ background: '#1c1c1e', padding: '20px', borderRadius: 16, border: '1px solid #2d2d34', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>Ngày {selectedCalendarDay}/{month + 1}</span>
                                                <span style={{ fontSize: 12, fontWeight: 500, color: '#8e8e93', background: '#2c2c2e', padding: '3px 10px', borderRadius: 12 }}>{selectedTasks.length} công việc</span>
                                            </h3>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 120, justifyContent: selectedTasks.length === 0 ? 'center' : 'flex-start', alignItems: selectedTasks.length === 0 ? 'center' : 'stretch' }}>
                                                {selectedTasks.length === 0 ? (
                                                    <>
                                                        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '1.5px dashed #3a3a3c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93', marginBottom: 4 }}>
                                                            <ion-icon name="calendar-outline" style={{ fontSize: 28 }}></ion-icon>
                                                        </div>
                                                        <div style={{ textAlign: 'center', color: '#8e8e93', fontSize: 13, fontWeight: 500 }}>Không có lịch trình nào vào ngày này.</div>
                                                    </>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                                                        {selectedTasks.map(t => {
                                                            const isTaskOverdue = (t.dueTime || t.deadline) && new Date(t.dueTime || t.deadline!).getTime() < Date.now() && t.status !== 'COMPLETED';
                                                            const inProgress = t.status === 'IN_PROGRESS';

                                                            let pillBg = '#262629';
                                                            let pillBorder = '1px solid #3a3a3c';
                                                            let pillColor = '#ffffff';

                                                            if (isTaskOverdue) {
                                                                pillBg = 'rgba(239,68,68,0.1)';
                                                                pillBorder = '1px solid #ef4444';
                                                                pillColor = '#ef4444';
                                                            } else if (inProgress) {
                                                                pillBg = 'rgba(245,158,11,0.1)';
                                                                pillBorder = '1px solid #f59e0b';
                                                                pillColor = '#f59e0b';
                                                            } else if (t.status === 'COMPLETED') {
                                                                pillBg = 'rgba(16,185,129,0.1)';
                                                                pillBorder = '1px solid #10b981';
                                                                pillColor = '#10b981';
                                                            }

                                                            return (
                                                                <div key={t.id} style={{ background: pillBg, border: pillBorder, color: pillColor, padding: '12px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>{t.title}</span>
                                                                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: '#1c1c1e', color: pillColor }}>
                                                                            {STATUS_COLORS[t.status]?.label || t.status}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8e8e93' }}>
                                                                        <span>Giai đoạn: {t.productionStage || '—'}</span>
                                                                        <span>Nhân viên chính: {t.memberName || 'Chưa giao'}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Highlight Panel: In progress & Deadlines list */}
                                        <div style={{ background: '#1c1c1e', padding: '20px', borderRadius: 16, border: '1px solid #2d2d34', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
                                                Công việc Đang làm & Hạn chót
                                            </h3>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 140, justifyContent: 'center', alignItems: 'center' }}>
                                                {latestGoalTasks.filter(t => t.status === 'IN_PROGRESS').length === 0 ? (
                                                    <>
                                                        <div style={{ width: 56, height: 56, borderRadius: 12, border: '1.5px solid #3a3a3c', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8e8e93', marginBottom: 4 }}>
                                                            <ion-icon name="checkmark-outline" style={{ fontSize: 28 }}></ion-icon>
                                                        </div>
                                                        <div style={{ fontSize: 13, color: '#8e8e93', fontWeight: 500, textAlign: 'center', marginBottom: 12 }}>Không có công việc nào đang thực hiện.</div>
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => {
                                                                    setShowScheduleModal(false);
                                                                    if (!selectedGoalId && goals.length > 0) setSelectedGoalId(goals[0].id);
                                                                    setShowAddTask(true);
                                                                }}
                                                                style={{
                                                                    width: '85%',
                                                                    background: '#cbd5e1',
                                                                    color: 'var(--text-primary)',
                                                                    border: 'none',
                                                                    padding: '10px 16px',
                                                                    borderRadius: 10,
                                                                    fontWeight: 700,
                                                                    fontSize: 13,
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: 6,
                                                                    transition: 'background 0.2s'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                                                                onMouseLeave={e => e.currentTarget.style.background = '#cbd5e1'}
                                                            >
                                                                <ion-icon name="add" style={{ fontSize: 16 }}></ion-icon>
                                                                Tạo công việc mới
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                                                        {latestGoalTasks.filter(t => t.status === 'IN_PROGRESS').map(t => {
                                                            const dueTime = t.dueTime || t.deadline;
                                                            const formatted = dueTime ? new Date(dueTime).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Không có hạn';
                                                            return (
                                                                <div key={t.id} style={{ background: '#262629', padding: '10px 12px', borderRadius: 10, border: '1px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                                        <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{t.title}</div>
                                                                        <div style={{ fontSize: 10, color: '#8e8e93', marginTop: 2 }}>Giai đoạn: {t.productionStage || '—'}</div>
                                                                    </div>
                                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>{formatted}</div>
                                                                        <div style={{ fontSize: 9, color: '#8e8e93', textTransform: 'uppercase', marginTop: 1 }}>Hạn chót</div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            );
                        })()}

                        {/* Footer buttons */}
                        <div style={{ marginTop: 12, borderTop: '1px solid #232328', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowScheduleModal(false)} style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', border: 'none', padding: '10px 32px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}>Đóng</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Lịch sử vào ra ca */}
            {showAttendanceHistory && (
                <div
                    ref={attendanceHistoryModalRef}
                    className="attendance-history-modal__backdrop"
                    onClick={() => setShowAttendanceHistory(false)}
                >
                    <section
                        className="attendance-history-modal__panel"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="attendance-history-title"
                        onClick={event => event.stopPropagation()}
                    >
                        <header className="attendance-history-modal__header">
                            <div className="attendance-history-modal__heading">
                                <span aria-hidden="true"><ion-icon name="time-outline"></ion-icon></span>
                                <div>
                                    <h3 id="attendance-history-title">Lịch sử vào/ra ca của bạn</h3>
                                    <p>Theo dõi thời gian làm việc và trạng thái từng ca.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="attendance-history-modal__close"
                                onClick={() => setShowAttendanceHistory(false)}
                                aria-label="Đóng lịch sử vào ra ca"
                            >
                                <ion-icon name="close-outline"></ion-icon>
                            </button>
                        </header>
                        <div className="attendance-history-modal__body">
                            {attendanceHistory.length === 0 ? (
                                <div className="attendance-history-modal__empty">Chưa có lịch sử chấm công nào.</div>
                            ) : (
                                attendanceHistory.map((item, idx) => (
                                    <article key={idx} className="attendance-history-modal__card">
                                        <div className="attendance-history-modal__card-header">
                                            <span className="attendance-history-modal__date">Ngày {new Date(item.date).toLocaleDateString('vi-VN')}</span>
                                            <span className={`attendance-history-modal__status ${item.checkOutTime ? 'is-complete' : 'is-active'}`}>
                                                {item.checkOutTime ? 'Đã hoàn thành' : 'Đang làm việc'}
                                            </span>
                                        </div>
                                        <div className="attendance-history-modal__details">
                                            <div><ion-icon name="log-in-outline"></ion-icon><span>Vào ca</span><strong>{item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong></div>
                                            <div><ion-icon name="log-out-outline"></ion-icon><span>Tan ca</span><strong>{item.checkOutTime ? new Date(item.checkOutTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong></div>
                                            <div className="is-hours"><ion-icon name="timer-outline"></ion-icon><span>Giờ thường</span><strong>{item.regularHours !== undefined ? `${formatAttendanceHourValue(item.regularHours)} giờ` : '--'}</strong></div>
                                            <div className="is-overtime"><ion-icon name="flash-outline"></ion-icon><span>Tăng ca</span><strong>{Number(item.overtimeHours) > 0 ? `+${formatAttendanceHourValue(item.overtimeHours)} giờ` : '0 giờ'}</strong></div>
                                        </div>
                                    </article>
                                ))
                            )}
                        </div>
                        <footer className="attendance-history-modal__footer">
                            <button type="button" onClick={() => setShowAttendanceHistory(false)}>Đóng</button>
                        </footer>
                    </section>
                </div>
            )}

            {/* Modal Quản lý chấm công nhóm */}
            {showTeamAttendance && (
                <div
                    ref={teamAttendanceModalRef}
                    className="attendance-modal__backdrop"
                    onClick={() => setShowTeamAttendance(false)}
                >
                    <section
                        className="attendance-modal__panel"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="team-attendance-title"
                        onClick={event => event.stopPropagation()}
                    >
                        <header className="attendance-modal__header attendance-modal__animate">
                            <div className="attendance-modal__heading">
                                <span className="attendance-modal__heading-icon" aria-hidden="true">
                                    <ion-icon name="time-outline"></ion-icon>
                                </span>
                                <div>
                                    <p>Chấm công &amp; lương</p>
                                    <h2 id="team-attendance-title">Cài đặt và sửa chấm công</h2>
                                    <span>Cấu hình một lần, hệ thống tự tính giờ thường, tăng ca và tiền lương.</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="attendance-modal__close"
                                onClick={() => setShowTeamAttendance(false)}
                                aria-label="Đóng quản lý chấm công"
                            >
                                <ion-icon name="close-outline"></ion-icon>
                            </button>
                        </header>

                        <section className="attendance-modal__settings attendance-modal__animate" aria-labelledby="attendance-settings-title">
                            <div className="attendance-modal__settings-heading">
                                <div>
                                    <p>Cài đặt chấm công &amp; lương</p>
                                    <h3 id="attendance-settings-title">Một cấu hình chung cho toàn xưởng</h3>
                                </div>
                                <span>
                                    Ca đã ghi nhận vẫn giữ cấu hình cũ
                                </span>
                            </div>
                            <div className="attendance-modal__settings-form">
                                <label>
                                    <span>Giờ vào ca</span>
                                    <input
                                        type="time"
                                        value={attendanceSettingsDraft.workStartTime}
                                        onChange={event => setAttendanceSettingsDraft(current => ({ ...current, workStartTime: event.target.value }))}
                                    />
                                </label>
                                <label>
                                    <span>Giờ tan ca</span>
                                    <input
                                        type="time"
                                        value={attendanceSettingsDraft.workEndTime}
                                        onChange={event => setAttendanceSettingsDraft(current => ({ ...current, workEndTime: event.target.value }))}
                                    />
                                </label>
                                <label>
                                    <span>Giờ làm chuẩn</span>
                                    <div className="attendance-modal__number-input">
                                        <input
                                            type="number"
                                            min="0.25"
                                            max="24"
                                            step="0.25"
                                            value={attendanceSettingsDraft.standardHours}
                                            onChange={event => setAttendanceSettingsDraft(current => ({ ...current, standardHours: Number(event.target.value) }))}
                                        />
                                        <small>giờ/ngày</small>
                                    </div>
                                </label>
                                <label>
                                    <span>Đơn giá mỗi giờ</span>
                                    <div className="attendance-modal__number-input">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={attendanceSettingsDraft.hourlyRateVnd.toLocaleString('vi-VN')}
                                            onChange={event => setAttendanceSettingsDraft(current => ({
                                                ...current,
                                                hourlyRateVnd: Number(event.target.value.replace(/\D/g, '').slice(0, 8)) || 0,
                                            }))}
                                        />
                                        <small>đ/giờ</small>
                                    </div>
                                </label>
                                <label>
                                    <span>Hệ số tăng ca</span>
                                    <div className="attendance-modal__number-input">
                                        <input
                                            type="number"
                                            min="1"
                                            max="3"
                                            step="0.05"
                                            value={attendanceSettingsDraft.overtimeMultiplier}
                                            onChange={event => setAttendanceSettingsDraft(current => ({ ...current, overtimeMultiplier: Number(event.target.value) }))}
                                        />
                                        <small>lần</small>
                                    </div>
                                </label>
                                <button
                                    type="button"
                                    className={`attendance-modal__settings-save ${attendanceSettingsSaved ? 'is-saved' : ''}`}
                                    disabled={savingAttendanceSettings}
                                    onClick={() => void saveAttendanceSettings()}
                                >
                                    <ion-icon name={attendanceSettingsSaved ? 'checkmark-circle-outline' : 'save-outline'}></ion-icon>
                                    {savingAttendanceSettings ? 'Đang lưu…' : attendanceSettingsSaved ? 'Đã lưu' : 'Lưu cài đặt'}
                                </button>
                            </div>
                            <p className="attendance-modal__settings-note">
                                Ca hiện tại: <strong>{attendanceSettings.workStartTime}–{attendanceSettings.workEndTime}</strong>
                                <span>•</span>
                                Giờ chuẩn: <strong>{attendanceSettings.standardHours.toLocaleString('vi-VN')}h</strong>
                                <span>•</span>
                                OT tính từ <strong>{attendanceSettings.workEndTime}</strong>
                                <span>•</span>
                                Đơn giá: <strong>{attendanceSettings.hourlyRateVnd.toLocaleString('vi-VN')}đ/giờ</strong>
                                <span>•</span>
                                OT: <strong>×{attendanceSettings.overtimeMultiplier.toLocaleString('vi-VN')}</strong>
                            </p>
                        </section>

                        <div className="attendance-modal__date-filter attendance-modal__animate">
                            <div>
                                <label htmlFor="attendance-date">Ngày cần xem</label>
                                <input id="attendance-date" type="date" value={attendanceDate} onChange={event => setAttendanceDate(event.target.value)} />
                            </div>
                            <span>Hệ thống tự tính giờ thường và OT từ giờ vào/ra. Nhân viên không thể tự sửa.</span>
                        </div>

                        <div className="attendance-modal__summary attendance-modal__animate" aria-label="Tổng quan chấm công">
                            <div className="attendance-modal__summary-card">
                                <span>Đã chấm công</span>
                                <strong>{teamAttendanceData.length}/{attendanceSummary.employees}</strong>
                                <small>{attendanceSummary.missing} người chưa vào ca</small>
                            </div>
                            <div className="attendance-modal__summary-card is-active">
                                <span>Đang làm việc</span>
                                <strong>{attendanceSummary.active}</strong>
                                <small>Đã vào ca, chưa tan ca</small>
                            </div>
                            <div className="attendance-modal__summary-card is-complete">
                                <span>Ca hoàn thành</span>
                                <strong>{attendanceSummary.completed}</strong>
                                <small>Đã ghi nhận tan ca</small>
                            </div>
                            <div className="attendance-modal__summary-card is-hours">
                                <span>Giờ ghi nhận</span>
                                <strong>{formatAttendanceHourValue(attendanceSummary.totalHours)}h</strong>
                                <small>{formatAttendanceHourValue(attendanceSummary.regularHours)}h thường · {formatAttendanceHourValue(attendanceSummary.overtimeHours)}h OT</small>
                            </div>
                        </div>

                        <div className="attendance-modal__body attendance-modal__animate">
                            {attendanceError && <div className="attendance-modal__error" role="alert">{attendanceError}</div>}
                            {attendanceRows.length === 0 ? (
                                <div className="attendance-modal__empty">
                                    <div className="attendance-modal__empty-icon" aria-hidden="true">
                                        <ion-icon name="calendar-clear-outline"></ion-icon>
                                    </div>
                                     <h3>Xưởng chưa có thành viên</h3>
                                     <p>Mời nhân viên vào xưởng để bắt đầu quản lý chấm công.</p>
                                    <button type="button" onClick={() => setShowTeamAttendance(false)}>Đóng</button>
                                </div>
                            ) : (
                                <div className="attendance-modal__table-shell">
                                    <table className="attendance-modal__table">
                                        <thead>
                                            <tr>
                                                <th>Nhân viên</th>
                                                 <th>Vào ca</th>
                                                 <th>Tan ca</th>
                                                 <th>Tổng giờ</th>
                                                 <th>Giờ thường</th>
                                                 <th>Tăng ca</th>
                                                 <th>Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                        {attendanceRows.map(({ member, attendance: item }) => {
                                            const isEditing = Boolean(item && editingAttendance?.id === item.id);
                                            const employeeName = member.fullName || member.username;
                                            return <Fragment key={member.userId}>
                                                <tr>
                                                    <td>
                                                        <div className="attendance-modal__employee">
                                                            <span style={{ backgroundColor: avatarColor(employeeName) }}>{getInitials(employeeName)}</span>
                                                            <div>
                                                                <strong>{employeeName}</strong>
                                                                 <small>{member.jobLabels?.join(', ') || 'Chưa phân công vị trí'}</small>
                                                            </div>
                                                        </div>
                                                    </td>
                                                     <td>{item?.checkInTime ? new Date(item.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</td>
                                                     <td>{item?.checkOutTime ? new Date(item.checkOutTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</td>
                                                     <td className="attendance-modal__hours">
                                                         {item?.workedHours !== undefined || item?.actualWorkHours !== undefined
                                                             ? `${formatAttendanceHourValue(item.workedHours ?? item.actualWorkHours)}h` : '--'}
                                                     </td>
                                                     <td className="attendance-modal__hours">
                                                        {item?.regularHours !== undefined ? `${formatAttendanceHourValue(item.regularHours)}h` : '--'}
                                                    </td>
                                                    <td className="attendance-modal__overtime">
                                                        {(Number(item?.overtimeHours) || 0) > 0 ? `+${formatAttendanceHourValue(item?.overtimeHours)}h` : '--'}
                                                    </td>
                                                    <td className="attendance-modal__actions-cell">
                                                        {item && <button onClick={() => {
                                                                 // Convert to format required by datetime-local: YYYY-MM-DDThh:mm
                                                                 const toLocalString = (dateStr?: string | null) => {
                                                                     if (!dateStr) return '';
                                                                     const d = new Date(dateStr);
                                                                    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                                                                    return d.toISOString().slice(0,16);
                                                                };
                                                                 setEditingAttendance({
                                                                     id: item.id,
                                                                     checkInTime: toLocalString(item.checkInTime),
                                                                     checkOutTime: toLocalString(item.checkOutTime),
                                                                     reason: '',
                                                                 });
                                                                 setAttendanceError('');
                                                                 void attendanceService.getCorrections(item.id)
                                                                     .then(setAttendanceCorrections)
                                                                     .catch(() => setAttendanceCorrections([]));
                                                             }} className="attendance-modal__edit">
                                                                <ion-icon name="create-outline"></ion-icon>
                                                                Sửa
                                                             </button>}
                                                    </td>
                                                </tr>
                                                {isEditing && editingAttendance && <tr className="attendance-modal__correction-row"><td colSpan={7}>
                                                    <div className="attendance-modal__correction">
                                                        <div><label>Giờ vào</label><input className="attendance-modal__time-input" type="datetime-local" value={editingAttendance.checkInTime} onChange={event => setEditingAttendance({ ...editingAttendance, checkInTime: event.target.value })} /></div>
                                                        <div><label>Giờ ra</label><input className="attendance-modal__time-input" type="datetime-local" value={editingAttendance.checkOutTime} onChange={event => setEditingAttendance({ ...editingAttendance, checkOutTime: event.target.value })} /></div>
                                                        <div className="attendance-modal__reason"><label>Lý do sửa công <span>*</span></label><input value={editingAttendance.reason} onChange={event => setEditingAttendance({ ...editingAttendance, reason: event.target.value })} placeholder="Ví dụ: Nhân viên quên checkout" maxLength={500} /></div>
                                                        <div className="attendance-modal__actions">
                                                            <button onClick={() => void saveAttendanceCorrection()} className="attendance-modal__action is-save">Lưu & tính lại</button>
                                                            <button onClick={() => setEditingAttendance(null)} className="attendance-modal__action is-cancel">Hủy</button>
                                                        </div>
                                                    </div>
                                                    {attendanceCorrections.length > 0 && <div className="attendance-modal__correction-history">
                                                        <h4>Lịch sử sửa công</h4>
                                                        {attendanceCorrections.map(correction => <article key={correction.id}>
                                                            <div><strong>{correction.actorName}</strong><time>{new Date(correction.createdAt).toLocaleString('vi-VN')}</time></div>
                                                            <p>{correction.reason}</p>
                                                            <small>{correction.oldCheckInTime ? new Date(correction.oldCheckInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}–{correction.oldCheckOutTime ? new Date(correction.oldCheckOutTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'} → {new Date(correction.newCheckInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}–{new Date(correction.newCheckOutTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
                                                        </article>)}
                                                    </div>}
                                                </td></tr>}
                                            </Fragment>;
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

/** @deprecated Kept temporarily for route compatibility; use PayrollPanel. */
export function SalaryPanel({ teamId }: { teamId: string }) {
    const [salaryData, setSalaryData] = useState<SalaryReport[]>([]);
    const [loadingSalary, setLoadingSalary] = useState(false);
    const [showSalary, setShowSalary] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [hourlyRateOverride, setHourlyRateOverride] = useState<Record<string, number>>({});
    const [editingRate, setEditingRate] = useState<string | null>(null);
    const [tempRate, setTempRate] = useState('');

    // Bonus state
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [bonusAmount, setBonusAmount] = useState('');
    const [bonusReason, setBonusReason] = useState('');
    const [isSavingBonus, setIsSavingBonus] = useState(false);

    const loadSalary = async (month = selectedMonth) => {
        setLoadingSalary(true);
        try {
            const data = await taskService.getSalaryReport(teamId, month);
            setSalaryData(data);
        } catch { /* ignore */ }
        setLoadingSalary(false);
    };

    useEffect(() => {
        if (showSalary) {
            loadSalary();
        }
    }, [selectedMonth, showSalary, teamId]);

    const handleRateEdit = (memberId: string, currentRate: number) => {
        setEditingRate(memberId);
        setTempRate(Math.round(currentRate).toLocaleString('vi-VN'));
    };

    const handleRateSave = (memberId: string) => {
        const newRate = Number(tempRate.replace(/\D/g, ''));
        if (!isNaN(newRate) && newRate > 0) {
            setHourlyRateOverride(prev => ({ ...prev, [memberId]: newRate }));
        }
        setEditingRate(null);
    };

    const handleRateInput = (value: string) => {
        const digits = value.replace(/\D/g, '').slice(0, 10);
        setTempRate(digits ? Number(digits).toLocaleString('vi-VN') : '');
    };

    const handleSaveBonus = async (userId: string) => {
        if (!bonusAmount) return;
        const [year, month] = selectedMonth.split('-').map(Number);
        setIsSavingBonus(true);
        try {
            await taskService.saveSalaryBonus(teamId, {
                userId, year, month,
                amount: parseFloat(bonusAmount.replace(/,/g, '')),
                reason: bonusReason
            });
            await loadSalary();
            setExpandedRow(null);
            setBonusAmount('');
            setBonusReason('');
        } catch (e) {
            console.error("Failed to save bonus", e);
        }
        setIsSavingBonus(false);
    };

    const handleDeleteBonus = async (bonusId: string) => {
        if (!window.confirm("Bạn có chắc muốn xóa khoản thưởng/phụ cấp này?")) return;
        setIsSavingBonus(true);
        try {
            await taskService.deleteSalaryBonus(teamId, bonusId);
            await loadSalary();
        } catch (e) {
            console.error("Failed to delete bonus", e);
        }
        setIsSavingBonus(false);
    };

    const getEffectiveRate = (memberId: string, defaultRate: number) => {
        return hourlyRateOverride[memberId] || defaultRate;
    };

    const getBillableRegularHours = (report: SalaryReport) => (
        (report.regularHours && report.regularHours > 0) ? report.regularHours : report.totalWorkload
    );

    const getTotalWorkHours = (report: SalaryReport) => (
        getBillableRegularHours(report) + (report.overtimeHours || 0)
    );

    const calculateSalary = (report: SalaryReport) => {
        const rate = getEffectiveRate(report.memberId, report.hourlyRate);
        const billableHours = getBillableRegularHours(report);
        const overtimeHours = report.overtimeHours || 0;
        const overtimeRate = report.overtimeRate || (rate * 1.5);
        const bonus = report.bonusAmount || 0;
        return Math.round((billableHours * rate) + (overtimeHours * overtimeRate)) + bonus;
    };

    const totalSalary = salaryData.reduce((sum, s) => sum + calculateSalary(s), 0);
    const totalTasks = salaryData.reduce((sum, s) => sum + s.totalTasks, 0);
    const totalCompleted = salaryData.reduce((sum, s) => sum + s.completedTasks, 0);
    const totalRegularHours = salaryData.reduce((sum, s) => sum + getBillableRegularHours(s), 0);
    const totalOvertimeHours = salaryData.reduce((sum, s) => sum + (s.overtimeHours || 0), 0);
    const totalWorkHours = totalRegularHours + totalOvertimeHours;
    const avgCompletion = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;


    return (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 18 }}>
            {/* Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                        <ion-icon name="card-outline" style={{ fontSize: 18, verticalAlign: 'middle', marginRight: 6, color: '#d4a574' }}></ion-icon> BẢNG LƯƠNG NHÂN VIÊN
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Theo dõi & quản lý chi phí nhân sự</p>
                </div>
                <button onClick={() => setShowSalary(p => !p)} style={{
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: 'none',
                    padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    {showSalary ? 'Ẩn bảng' : 'Xem chi tiết'}
                    <ion-icon name={showSalary ? "chevron-up-outline" : "chevron-down-outline"}></ion-icon>
                </button>
            </div>

            {/* Month Selector & Content */}
            {showSalary && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                    <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-input)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button
                                onClick={() => {
                                    const [y, m] = selectedMonth.split('-').map(Number);
                                    const prev = new Date(y, m - 2);
                                    setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
                                }}
                                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                            </button>
                            <select
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(e.target.value)}
                                style={{
                                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                                    background: 'var(--bg-card)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                    cursor: 'pointer', outline: 'none'
                                }}
                            >
                                {Array.from({ length: 12 }, (_, i) => {
                                    const d = new Date();
                                    d.setMonth(d.getMonth() - i);
                                    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                                    return <option key={val} value={val} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</option>;
                                })}
                            </select>
                            <button
                                onClick={() => {
                                    const [y, m] = selectedMonth.split('-').map(Number);
                                    const next = new Date(y, m);
                                    const now = new Date();
                                    if (next <= now) {
                                        setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
                                    }
                                }}
                                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                            </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                Tự động cập nhật theo giờ công
                            </span>
                        </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)' }}>
                        {/* Summary Stats */}
                        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                            {[
                                { label: 'Tổng nhân viên', value: salaryData.length, icon: '👥', color: 'var(--text-primary)' },
                                { label: 'Tổng giờ công', value: `${totalWorkHours.toFixed(1)}h`, icon: '⏱', color: 'var(--text-primary)' },
                                { label: 'Hoàn thành', value: `${avgCompletion}%`, icon: '✅', color: '#10b981' },
                                { label: 'Tổng quỹ lương', value: `${(totalSalary / 1000000).toFixed(1)}M`, icon: '💰', color: '#d4a574' }
                            ].map((stat, i) => (
                                <div key={i} style={{
                                    padding: 16, borderRadius: 12, background: 'var(--bg-input)',
                                    border: '1px solid var(--border)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={{ fontSize: 18 }}>{stat.icon}</span>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{stat.label}</span>
                                    </div>
                                    <div style={{ fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {loadingSalary ? (
                            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
                                <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: '#d4a574', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }}></div>
                                <p>Đang tải dữ liệu...</p>
                            </div>
                        ) : (salaryData.length === 0 || salaryData.every(s => getTotalWorkHours(s) === 0)) ? (
                            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
                                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Chưa có dữ liệu bảng lương</p>
                                <p style={{ fontSize: 14 }}>Khi nhân viên phát sinh giờ công hoặc được cấu hình lương, dữ liệu sẽ hiển thị.</p>
                            </div>
                        ) : (
                            <div style={{ padding: '0 28px 24px' }}>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr 1.3fr',
                                    gap: 12, padding: '12px 16px',
                                    background: 'var(--bg-input, rgba(255, 255, 255, 0.03))', borderRadius: '12px 12px 0 0',
                                    borderBottom: '1px solid var(--border)'
                                }}>
                                    {['Nhân viên', 'Tổng task', 'Hoàn thành', 'Giờ công (Thường + Tăng ca)', 'Tiền/1 giờ', 'Lương thực nhận'].map((h, i) => (
                                        <div key={i} style={{
                                            fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                                            textTransform: 'uppercase', letterSpacing: '0.05em',
                                            textAlign: i >= 1 ? 'center' : 'left'
                                        }}>{h}</div>
                                    ))}
                                </div>

                                {salaryData.map((s, idx) => {
                                    const salary = calculateSalary(s);
                                    const completionRate = s.totalTasks > 0 ? Math.round((s.completedTasks / s.totalTasks) * 100) : 0;
                                    const isEditing = editingRate === s.memberId;
                                    const regularHours = getBillableRegularHours(s);
                                    const overtimeHours = s.overtimeHours || 0;

                                    return (
                                        <div key={s.memberId}>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr 1.3fr',
                                                gap: 12, padding: '14px 16px',
                                                borderBottom: '1px solid var(--border)',
                                                alignItems: 'center',
                                                background: expandedRow === s.memberId ? 'var(--bg-input, rgba(255,255,255,0.05))' : idx % 2 === 0 ? 'transparent' : 'var(--bg-input, rgba(255,255,255,0.02))',
                                                cursor: 'pointer'
                                            }} onClick={() => setExpandedRow(expandedRow === s.memberId ? null : s.memberId)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{
                                                    width: 40, height: 40, borderRadius: 12,
                                                    background: ['#d4a574', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'][idx % 6],
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: '#fff', fontWeight: 700, fontSize: 14
                                                }}>
                                                    {(s.memberName || '?').split(' ').slice(-2).map(w => w[0]).join('').toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{s.memberName}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ID: {s.memberId?.slice(0, 8)}...</div>
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.totalTasks}</div>
                                            </div>

                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    padding: '4px 10px', borderRadius: 20,
                                                    background: completionRate >= 80 ? 'rgba(16, 185, 129, 0.1)' : completionRate >= 50 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                    color: completionRate >= 80 ? '#10b981' : completionRate >= 50 ? '#f59e0b' : '#ef4444'
                                                }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700 }}>{s.completedTasks}</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{completionRate}%</div>
                                            </div>

                                            {/* Workload */}
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {regularHours.toFixed(1)}h
                                                </div>
                                                {overtimeHours > 0 ? (
                                                    <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>+ {overtimeHours.toFixed(1)}h TC</div>
                                                ) : <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>giờ thường</div>}
                                            </div>

                                            {/* Hourly Rate */}
                                            <div style={{ textAlign: 'center' }}>
                                                {isEditing ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                                        <div style={{
                                                            width: 118,
                                                            height: 36,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            overflow: 'hidden',
                                                            borderRadius: 9,
                                                            border: '1px solid var(--primary)',
                                                            background: 'var(--bg-input)',
                                                            boxShadow: '0 0 0 3px var(--primary-soft)',
                                                        }}>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={tempRate}
                                                                onChange={e => handleRateInput(e.target.value)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleRateSave(s.memberId);
                                                                    if (e.key === 'Escape') setEditingRate(null);
                                                                }}
                                                                autoFocus
                                                                aria-label={`Đơn giá mỗi giờ của ${s.memberName}`}
                                                                style={{
                                                                    width: '100%', minWidth: 0, padding: '0 4px 0 10px',
                                                                    border: 'none', outline: 'none', fontSize: 13,
                                                                    fontWeight: 700, textAlign: 'right',
                                                                    background: 'transparent', color: 'var(--text-primary)'
                                                                }}
                                                            />
                                                            <span style={{
                                                                flexShrink: 0, paddingRight: 9, color: 'var(--text-secondary)',
                                                                fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap'
                                                            }}>đ/giờ</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRateSave(s.memberId)}
                                                            aria-label="Lưu đơn giá"
                                                            title="Lưu (Enter)"
                                                            style={{
                                                                width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                padding: 0, background: '#10b981', color: '#fff', border: 'none',
                                                                borderRadius: 9, fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                                                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
                                                            }}
                                                        >✓</button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setEditingRate(null)}
                                                            aria-label="Hủy chỉnh sửa đơn giá"
                                                            title="Hủy (Esc)"
                                                            style={{
                                                                width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                padding: 0, background: 'var(--danger-soft)', color: 'var(--danger)',
                                                                border: '1px solid rgba(239, 68, 68, 0.24)', borderRadius: 9,
                                                                fontSize: 15, fontWeight: 800, cursor: 'pointer'
                                                            }}
                                                        >✕</button>
                                                    </div>
                                                ) : (
                                                    <div
                                                        onClick={() => handleRateEdit(s.memberId, s.hourlyRate)}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                                            padding: '4px 10px', borderRadius: 8,
                                                            background: hourlyRateOverride[s.memberId] ? 'rgba(212,165,116,0.1)' : 'var(--bg-input, rgba(255,255,255,0.05))',
                                                            color: hourlyRateOverride[s.memberId] ? '#d4a574' : '#64748b', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                                            border: hourlyRateOverride[s.memberId] ? '1px dashed #d4a574' : '1px dashed var(--border)'
                                                        }}
                                                        title="Nhấp để chỉnh sửa đơn giá"
                                                    >
                                                        {getEffectiveRate(s.memberId, s.hourlyRate).toLocaleString('vi-VN')}
                                                        <span style={{ fontSize: 10 }}>đ'</span>
                                                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Salary */}
                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ color: '#d4a574', fontWeight: 800, fontSize: 15 }}>
                                                    {salary.toLocaleString('vi-VN')} đ'
                                                </div>
                                            </div>
                                            </div>

                                        {expandedRow === s.memberId && (
                                            <div style={{ padding: '16px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
                                                <div style={{ fontWeight: 700, marginBottom: 12 }}>CÁCH TÍNH THỰC NHẬN</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px', gap: 12, marginBottom: 8 }}>
                                                    <div style={{ color: 'var(--text-secondary)' }}>Lương thường</div>
                                                    <div style={{ color: 'var(--text-secondary)' }}>{regularHours.toFixed(1)}h × {getEffectiveRate(s.memberId, s.hourlyRate).toLocaleString('vi-VN')}đ</div>
                                                    <div style={{ textAlign: 'right', fontWeight: 600 }}>{Math.round(regularHours * getEffectiveRate(s.memberId, s.hourlyRate)).toLocaleString('vi-VN')} đ</div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px', gap: 12, marginBottom: 8 }}>
                                                    <div style={{ color: 'var(--text-secondary)' }}>Tăng ca</div>
                                                    <div style={{ color: 'var(--text-secondary)' }}>{overtimeHours.toFixed(1)}h × {getEffectiveRate(s.memberId, s.hourlyRate).toLocaleString('vi-VN')}đ × 150%</div>
                                                    <div style={{ textAlign: 'right', fontWeight: 600 }}>{Math.round(overtimeHours * getEffectiveRate(s.memberId, s.hourlyRate) * 1.5).toLocaleString('vi-VN')} đ</div>
                                                </div>
                                                
                                                {s.bonusAmount ? (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                                                        <div style={{ color: '#10b981', fontWeight: 600 }}>Thưởng / phụ cấp</div>
                                                        <div style={{ color: 'var(--text-secondary)' }}>{s.bonusReason} 
                                                            <button onClick={() => handleDeleteBonus(s.bonusId!)} disabled={isSavingBonus} style={{ marginLeft: 12, background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>Xóa</button>
                                                        </div>
                                                        <div style={{ textAlign: 'right', fontWeight: 600, color: '#10b981' }}>+ {s.bonusAmount.toLocaleString('vi-VN')} đ</div>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                                                        {!isSavingBonus ? (
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr 1.5fr auto', gap: 12, alignItems: 'center' }}>
                                                                <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981', whiteSpace: 'nowrap' }}>+ Thêm thưởng</span>
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="Số tiền (VD: 500,000)" 
                                                                    value={bonusAmount} 
                                                                    onClick={e => e.stopPropagation()} 
                                                                    onChange={e => {
                                                                        const val = e.target.value.replace(/\D/g, '');
                                                                        setBonusAmount(val ? Number(val).toLocaleString('en-US') : '');
                                                                    }} 
                                                                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 'bold' }} 
                                                                />
                                                                <input 
                                                                    type="text" 
                                                                    placeholder="Lý do (VD: Thưởng KPIs)..." 
                                                                    value={bonusReason} 
                                                                    onClick={e => e.stopPropagation()} 
                                                                    onChange={e => setBonusReason(e.target.value)} 
                                                                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} 
                                                                />
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleSaveBonus(s.memberId); }} 
                                                                    disabled={isSavingBonus || !bonusAmount} 
                                                                    style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, opacity: (!bonusAmount || isSavingBonus) ? 0.6 : 1 }}
                                                                >Lưu</button>
                                                            </div>
                                                        ) : <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Đang lưu...</div>}
                                                    </div>
                                                )}
                                                
                                                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 150px', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                                                    <div style={{ fontWeight: 700 }}>THỰC NHẬN</div>
                                                    <div></div>
                                                    <div style={{ textAlign: 'right', fontWeight: 800, color: '#d4a574' }}>{salary.toLocaleString('vi-VN')} đ</div>
                                                </div>
                                            </div>
                                        )}
                                        </div>
                                    );
                                })}

                                {/* Total Row */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr 1.3fr',
                                    gap: 12, padding: '18px 16px',
                                    background: 'var(--bg-input, rgba(255, 255, 255, 0.03))',
                                    borderTop: '1px solid var(--border)',
                                    borderRadius: '0 0 16px 16px',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Tổng cộng</div>
                                    <div style={{ textAlign: 'center', color: 'var(--text-primary)' }}><span style={{ fontSize: 16, fontWeight: 800 }}>{totalTasks}</span></div>
                                    <div style={{ textAlign: 'center', color: '#10b981' }}><span style={{ fontSize: 16, fontWeight: 800 }}>{totalCompleted}</span></div>
                                    <div style={{ textAlign: 'center', color: 'var(--text-primary)' }}>
                                        <span style={{ fontSize: 16, fontWeight: 800 }}>{totalWorkHours.toFixed(1)}h</span>
                                        {totalOvertimeHours > 0 && <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>+ {totalOvertimeHours.toFixed(1)}h TC</div>}
                                    </div>
                                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>—</div>
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{
                                            color: '#d4a574', fontWeight: 900, fontSize: 17
                                        }}>
                                            {totalSalary.toLocaleString('vi-VN')} đ'
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--bg-input, rgba(255, 255, 255, 0.03))' }}>
                            <button
                                onClick={async () => {
                                    try {
                                        const res = await taskService.exportSalaryExcel(teamId, selectedMonth);
                                        const url = window.URL.createObjectURL(new Blob([res.data]));
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.setAttribute('download', `bang-luong-${teamId}-${selectedMonth}.xlsx`);
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                    } catch (err) {
                                        console.error(err);
                                        alert('Lỗi: ' + (err instanceof Error ? err.message : 'Không thể xuất file Excel bảng lương.'));
                                    }
                                }}
                                style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                Xuất Excel
                            </button>
                            <button
                                onClick={async () => {
                                    if (totalSalary <= 0) {
                                        alert('Hiện tại chưa thể phát lương do chưa có dữ liệu lương cần thanh toán.');
                                        return;
                                    }
                                    if (window.confirm(`Bạn có chắc chắn muốn thanh toán tổng cộng ${totalSalary.toLocaleString('vi-VN')} đ cho nhân viên?`)) {
                                        try {
                                            const res = await taskService.payoutSalary(teamId, selectedMonth);
                                            const checkoutUrl = res.checkoutUrl;
                                            if (checkoutUrl) {
                                                window.open(checkoutUrl, '_blank');
                                            } else {
                                                alert('Không nhận được URL thanh toán từ PayOS');
                                            }
                                        } catch (err: any) {
                                            alert(err.response?.data?.error || 'Thanh toán thất bại hoặc không có số dư.');
                                        }
                                    }
                                }}
                                style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#b97820', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                            >
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                Phát lương
                            </button>
                        </div>
                    </div>
                </div>
            )}


            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

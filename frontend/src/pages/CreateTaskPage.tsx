import { useState, useRef, useEffect, type ClipboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useParams, useNavigate } from 'react-router-dom';
import { teamService, aiWorkflowService, goalService, getTrialStatus } from '../services/groupService';
import { isPaymentRequiredError } from '../services/api';
import type { AiParseResult, AiV2PlanDraft } from '../services/groupService';
import type { Team, TeamMemberInfo } from '../types/types';
import { estimateTokens, formatTokenCount } from '../utils/tokenUsage';
import {
    formatMemberIdentity,
    getDuplicateMemberNameKeys,
    hasDuplicateMemberName,
} from '../utils/memberIdentity';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    result?: AiParseResult;
    timestamp: Date;
    isConfirmed?: boolean;
    isCancelled?: boolean;
    isArchived?: boolean;
}

interface TaskConversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    conversationState: AiConversationState;
    createdAt: Date;
    updatedAt: Date;
}

type AiConversationMode = 'IDLE' | 'WAITING_CLARIFICATION' | 'DRAFT_READY';

interface AiConversationState {
    mode: AiConversationMode;
    originalText?: string;
    intent?: 'PRODUCTION_PLAN' | 'OPERATION_TASK' | 'UNKNOWN';
    previousFields?: Record<string, any>;
    missingFields?: string[];
}

const idleConversation: AiConversationState = { mode: 'IDLE' };

const createConversationId = () =>
    `task-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const reviveMessages = (items: ChatMessage[]) =>
    items.map(message => ({
        ...message,
        timestamp: new Date(message.timestamp)
    }));

const getConversationTitle = (messages: ChatMessage[]) => {
    const draftTitle = [...messages]
        .reverse()
        .find(message => message.result?.title?.trim())
        ?.result?.title?.trim();
    const firstRequest = messages
        .find(message => message.role === 'user' && message.content.trim())
        ?.content.trim();
    const title = (draftTitle || firstRequest || 'Đoạn chat mới').replace(/\s+/g, ' ');

    return title.length > 52 ? `${title.slice(0, 49)}...` : title;
};

const upsertConversation = (
    conversations: TaskConversation[],
    id: string,
    messages: ChatMessage[],
    conversationState: AiConversationState
) => {
    if (messages.length === 0) return conversations;

    const existing = conversations.find(conversation => conversation.id === id);
    const now = new Date();
    const nextConversation: TaskConversation = {
        id,
        title: getConversationTitle(messages),
        messages,
        conversationState,
        createdAt: existing?.createdAt || messages[0]?.timestamp || now,
        updatedAt: now
    };

    return [
        nextConversation,
        ...conversations.filter(conversation => conversation.id !== id)
    ];
};

const priorityLabel = (priority: number) => {
    if (priority >= 4) return 'high';
    if (priority <= 1) return 'low';
    return 'medium';
};

const priorityNumber = (priority?: string) => {
    const value = priority?.toLowerCase();
    if (value === 'high') return 4;
    if (value === 'low') return 1;
    return 2;
};

const draftToResult = (draft: AiV2PlanDraft): AiParseResult => ({
    title: draft.goalTitle || 'Mục tiêu mới',
    description: `Tôi đã tạo bản nháp gồm ${draft.tasks?.length || 0} công việc. Vui lòng xem lại trước khi lưu.`,
    quantity: draft.outputTarget || null,
    quantityNumber: null,
    unit: null,
    deadline: draft.deadline || null,
    priority: priorityLabel(draft.priority || 2),
    needsClarification: false,
    source: 'ai-v2',
    tasks: (draft.tasks || []).map((task) => ({
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        workload: task.workload,
        suggestedAssignee: task.suggestedAssigneeName || undefined,
        suggestedAssigneeId: task.suggestedAssigneeId,
        suggestedReason: task.suggestedReason,
    })),
});

const resultToDraft = (result: AiParseResult): AiV2PlanDraft => ({
    goalTitle: result.title || 'Mục tiêu mới',
    outputTarget: result.quantity || result.description || '',
    deadline: result.deadline,
    priority: priorityNumber(result.priority),
    tasks: (result.tasks || []).map((task) => ({
        title: task.title || task.description || 'Công việc mới',
        description: task.description || task.title || '',
        priority: task.priority || 2,
        workload: task.workload || 1,
        suggestedAssigneeId: task.suggestedAssigneeId || null,
        suggestedAssigneeName: task.suggestedAssignee || null,
        suggestedReason: task.suggestedReason || null,
    })),
});

const normalizeVietnameseText = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ'/g, 'd')
        .replace(/\s+/g, ' ')
        .trim();

const getRequestedAddedTaskTitle = (instruction: string) => {
    const normalized = normalizeVietnameseText(instruction);
    const match = normalized.match(
        /\bthem(?:\s+\d+)?\s+(?:muc|task|cong viec)(?:\s+nua)?(?:\s+(?:la|ve|cho))?\s*[:\-]?\s*(.+)$/
    );
    if (!match) return null;

    const title = match[1]
        .replace(/^(?:muc|task|cong viec)\s*(?:so)?\s*\d+\s*(?:la|:|-)?\s*/, '')
        .replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, '');
    if (!title) return null;

    const knownTitles: Record<string, string> = {
        'van chuyen': 'Vận chuyển',
        'giao hang': 'Giao hàng',
        'giao hang thanh pham': 'Giao hàng thành phẩm',
        'ban giao': 'Bàn giao',
        'dong goi': 'Đóng gói',
        'kiem tra chat luong': 'Kiểm tra chất lượng',
    };
    return knownTitles[title] || `${title.charAt(0).toUpperCase()}${title.slice(1)}`;
};

const getRequestedRemovedTaskIndex = (instruction: string, taskCount: number) => {
    const normalized = normalizeVietnameseText(instruction);
    if (!/\b(xoa|bo|loai bo)\b/.test(normalized)) return null;

    const numberMatch = normalized.match(
        /\b(?:xoa|bo|loai bo)(?:\s+di)?\s+(?:muc|task|cong viec)?\s*(?:so)?\s*(\d+)\b/
    );
    if (numberMatch) {
        const index = Number(numberMatch[1]) - 1;
        return index >= 0 && index < taskCount ? index : null;
    }

    if (/\b(?:muc|task|cong viec)?\s*cuoi\b/.test(normalized)) {
        return taskCount > 0 ? taskCount - 1 : null;
    }
    return null;
};

const applyDeterministicRevision = (
    instruction: string,
    original: AiV2PlanDraft
): AiV2PlanDraft | null => {
    const removedTaskIndex = getRequestedRemovedTaskIndex(instruction, original.tasks.length);
    if (removedTaskIndex !== null) {
        return {
            ...original,
            tasks: original.tasks.filter((_, index) => index !== removedTaskIndex),
        };
    }

    const addedTaskTitle = getRequestedAddedTaskTitle(instruction);
    if (addedTaskTitle) {
        return {
            ...original,
            tasks: [
                ...original.tasks,
                {
                    title: addedTaskTitle,
                    description: `Thực hiện công việc ${addedTaskTitle.toLowerCase()} theo yêu cầu của kế hoạch.`,
                    priority: 3,
                    workload: 1,
                    suggestedAssigneeId: null,
                    suggestedAssigneeName: null,
                    suggestedReason: 'Chưa tìm thấy người phụ trách phù hợp. Bạn có thể chọn thủ công.',
                },
            ],
        };
    }

    return null;
};

const ensureRequestedRevision = (
    instruction: string,
    original: AiV2PlanDraft,
    revised: AiV2PlanDraft
) => {
    const addedTaskTitle = getRequestedAddedTaskTitle(instruction);
    if (addedTaskTitle && revised.tasks.length <= original.tasks.length) {
        return {
            ...revised,
            tasks: [
                ...original.tasks,
                {
                    title: addedTaskTitle,
                    description: `Thực hiện công việc ${addedTaskTitle.toLowerCase()} theo yêu cầu của kế hoạch.`,
                    priority: 3,
                    workload: 1,
                    suggestedAssigneeId: null,
                    suggestedAssigneeName: null,
                    suggestedReason: 'Chưa tìm thấy người phụ trách phù hợp. Bạn có thể chọn thủ công.',
                },
            ],
        };
    }

    const removedTaskIndex = getRequestedRemovedTaskIndex(instruction, original.tasks.length);
    if (removedTaskIndex !== null && revised.tasks.length >= original.tasks.length) {
        return {
            ...revised,
            tasks: original.tasks.filter((_, index) => index !== removedTaskIndex),
        };
    }

    return revised;
};

function friendlyTaskError(error?: string) {
    const text = error || '';
    const lower = text.toLowerCase();
    if (lower.includes('payment_required') || lower.includes('hết hạn gói miễn phí')) {
        return 'Gói miễn phí đã hết hạn.';
    }
    if (lower.includes('could not execute statement') || (lower.includes('constraint') && lower.includes('sql'))) {
        return 'Không thể lưu kế hoạch do dữ liệu bị trùng hoặc không hợp lệ. Vui lòng bấm tạo lại.';
    }
    return text || 'Không thể tạo công việc, vui lòng thử lại';
}

function normalizeComposerPaste(value: string) {
    return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function CreateTaskPage() {
    const { id: teamId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const chatInputRef = useRef<HTMLTextAreaElement>(null);
    const categoryMenuRef = useRef<HTMLDivElement>(null);

    const [team, setTeam] = useState<Team | null>(null);
    const [category, setCategory] = useState('Rang xay');
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [priority, setPriority] = useState('Trung bình');
    const categoryOptions = ['Rang xay', 'Sơ chế', 'Đóng gói'];

    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        try {
            const pathSegments = window.location.pathname.split('/');
            const idx = pathSegments.indexOf('groups');
            const tid = idx >= 0 && idx + 1 < pathSegments.length ? pathSegments[idx + 1] : null;
            if (tid) {
                const saved = localStorage.getItem(`ai_task_chat_${tid}`);
                if (saved) {
                    return JSON.parse(saved).map((m: any) => ({
                        ...m,
                        timestamp: new Date(m.timestamp)
                    }));
                }
            }
        } catch (e) {
            // mapping failure returns empty list, UI tolerates it.
        }
        return [];
    });
    const [conversationState, setConversationState] = useState<AiConversationState>(() => {
        try {
            const pathSegments = window.location.pathname.split('/');
            const idx = pathSegments.indexOf('groups');
            const tid = idx >= 0 && idx + 1 < pathSegments.length ? pathSegments[idx + 1] : null;
            if (tid) {
                const saved = localStorage.getItem(`ai_task_state_${tid}`);
                if (saved) return JSON.parse(saved);
            }
        } catch (e) {
            // fallback idle
        }
        return idleConversation;
    });
    const [activeConversationId, setActiveConversationId] = useState(() => {
        if (!teamId) return createConversationId();
        return localStorage.getItem(`ai_task_active_conversation_${teamId}`) || createConversationId();
    });
    const [conversations, setConversations] = useState<TaskConversation[]>(() => {
        if (!teamId) return [];

        try {
            const saved = localStorage.getItem(`ai_task_conversations_${teamId}`);
            if (!saved) return [];

            return JSON.parse(saved).map((conversation: TaskConversation) => ({
                ...conversation,
                messages: reviveMessages(conversation.messages || []),
                createdAt: new Date(conversation.createdAt),
                updatedAt: new Date(conversation.updatedAt)
            }));
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState(false);
    const [trialActive, setTrialActive] = useState(true);
    const [trialDays, setTrialDays] = useState(30);

    const [showTokens, setShowTokens] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const totalTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);

    const handleCopyMessage = (content: string) => {
        navigator.clipboard.writeText(content);
        alert('Đã copy nội dung!');
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!teamId || teamId === 'undefined') {
            navigate('/groups');
            return;
        }
        teamService.getDetail(teamId).then(setTeam).catch(() => { });
        getTrialStatus().then(s => { 
            setTrialActive(s.aiTrialActive); 
            setTrialDays(s.daysRemaining); 
        }).catch(() => { });
    }, [teamId, navigate]);

    useEffect(() => {
        document.body.classList.add('task-studio-mode');
        return () => document.body.classList.remove('task-studio-mode');
    }, []);

    useEffect(() => {
        if (!categoryOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!categoryMenuRef.current?.contains(event.target as Node)) {
                setCategoryOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [categoryOpen]);

    useEffect(() => {
        if (!teamId) return;
        if (messages.length > 0) {
            localStorage.setItem(`ai_task_chat_${teamId}`, JSON.stringify(messages));
        } else {
            localStorage.removeItem(`ai_task_chat_${teamId}`);
        }
    }, [messages, teamId]);

    useEffect(() => {
        if (!teamId) return;
        if (conversationState.mode === 'IDLE') {
            localStorage.removeItem(`ai_task_state_${teamId}`);
        } else {
            localStorage.setItem(`ai_task_state_${teamId}`, JSON.stringify(conversationState));
        }
    }, [conversationState, teamId]);

    useEffect(() => {
        if (!teamId) return;
        localStorage.setItem(`ai_task_active_conversation_${teamId}`, activeConversationId);
    }, [activeConversationId, teamId]);

    useEffect(() => {
        if (!teamId) return;
        if (conversations.length === 0) {
            localStorage.removeItem(`ai_task_conversations_${teamId}`);
            return;
        }
        localStorage.setItem(`ai_task_conversations_${teamId}`, JSON.stringify(conversations));
    }, [conversations, teamId]);

    useEffect(() => {
        if (messages.length === 0) return;
        setConversations(previous =>
            upsertConversation(previous, activeConversationId, messages, conversationState)
        );
    }, [activeConversationId, conversationState, messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    const clearHistory = () => {
        if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện này?')) {
            const nextConversationId = createConversationId();
            setMessages([]);
            setConversations([]);
            setActiveConversationId(nextConversationId);
            setConversationState(idleConversation);
            setInput('');
            if (teamId) {
                localStorage.removeItem(`ai_task_chat_${teamId}`);
                localStorage.removeItem(`ai_task_state_${teamId}`);
                localStorage.removeItem(`ai_task_conversations_${teamId}`);
                localStorage.setItem(`ai_task_active_conversation_${teamId}`, nextConversationId);
            }
        }
    };

    const handleComposerPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const pastedText = event.clipboardData.getData('text');
        if (!pastedText) return;

        event.preventDefault();
        const textarea = event.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const cleanText = normalizeComposerPaste(pastedText);
        const nextValue = `${input.slice(0, start)}${cleanText}${input.slice(end)}`;

        setInput(nextValue);
        window.setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + cleanText.length;
        }, 0);
    };

    const hasDraftTasks = (result?: AiParseResult) =>
        Boolean(result && !result.needsClarification && (result.tasks?.length || 0) > 0);

    const findActiveDraftMessage = (items: ChatMessage[]) =>
        [...items].reverse().find(msg =>
            hasDraftTasks(msg.result)
            && !msg.isConfirmed
            && !msg.isCancelled
            && !msg.isArchived
        );

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const activeDraftMessage = findActiveDraftMessage(messages);
        const activeDraft = activeDraftMessage?.result;

        const userMsg: ChatMessage = {
            id: Date.now().toString() + '-user',
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            if (activeDraft) {
                const currentDraft = resultToDraft(activeDraft);
                const localRevision = applyDeterministicRevision(userMsg.content, currentDraft);
                const apiDraft = localRevision
                    || await aiWorkflowService.revise(teamId || '', userMsg.content, currentDraft);

                // If AI couldn't process the revision, show the friendly aiNote message
                if (!localRevision && apiDraft.aiNote) {
                    const aiNoteMsg: ChatMessage = {
                        id: Date.now().toString() + '-ai',
                        role: 'assistant',
                        content: apiDraft.aiNote,
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiNoteMsg]);
                    return;
                }

                if (!localRevision && (!apiDraft.tasks || apiDraft.tasks.length === 0)) {
                    throw new Error('AI_RETURNED_EMPTY_TASKS');
                }

                const revisedDraft = localRevision
                    || ensureRequestedRevision(userMsg.content, currentDraft, apiDraft);
                const res = draftToResult(revisedDraft);
                const removedTaskIndex = getRequestedRemovedTaskIndex(userMsg.content, currentDraft.tasks.length);
                const changeSummary = removedTaskIndex !== null
                    ? `Đã xóa công việc số ${removedTaskIndex + 1}.`
                    : 'Tôi đã sửa draft theo yêu cầu.';
                const aiMsg: ChatMessage = {
                    id: Date.now().toString() + '-ai',
                    role: 'assistant',
                    content: `${changeSummary} Bản mới có ${revisedDraft.tasks.length} công việc.`,
                    result: res,
                    timestamp: new Date()
                };
                setConversationState({ mode: 'DRAFT_READY' });
                setMessages(prev => [
                    ...prev.map(message =>
                        message.id === activeDraftMessage?.id
                            ? { ...message, isArchived: true }
                            : message
                    ),
                    aiMsg
                ]);
                return;
            }

            const extractContext = conversationState.mode === 'WAITING_CLARIFICATION'
                ? {
                    mode: conversationState.mode,
                    originalText: conversationState.originalText || userMsg.content,
                    intent: conversationState.intent,
                    previousFields: conversationState.previousFields,
                    missingFields: conversationState.missingFields
                }
                : undefined;

            const extracted = await aiWorkflowService.extract(teamId || '', userMsg.content, extractContext);

            if (extracted.intent === 'UNKNOWN' || extracted.missingFields?.length > 0) {
                setConversationState({
                    mode: 'WAITING_CLARIFICATION',
                    originalText: conversationState.originalText || userMsg.content,
                    intent: extracted.intent,
                    previousFields: extracted.fields || {},
                    missingFields: extracted.missingFields || []
                });
                const aiMsg: ChatMessage = {
                    id: Date.now().toString() + '-ai',
                    role: 'assistant',
                    content: extracted.clarifyingQuestion || 'Tôi cần thêm thông tin trước khi tạo công việc.',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMsg]);
                return;
            }

            const draft = await aiWorkflowService.plan(teamId || '', extracted.intent, extracted.fields);

            if (!draft.tasks || draft.tasks.length === 0) {
                throw new Error('AI_RETURNED_EMPTY_TASKS');
            }

            const res = draftToResult(draft);
            setConversationState({ mode: 'DRAFT_READY' });

            const aiMsg: ChatMessage = {
                id: Date.now().toString() + '-ai',
                role: 'assistant',
                content: res.description || 'Tôi đã tạo draft công việc. Vui lòng xác nhận bên dưới.',
                result: res,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (e: any) {
            if (isPaymentRequiredError(e)) {
                setTrialActive(false);
                window.dispatchEvent(new CustomEvent('payment-required'));
                return;
            }

            const raw = e?.response?.data?.message || e?.response?.data?.detail || e?.response?.data?.error || e?.message || '';
            const rawLower = String(raw).toLowerCase();
            const status = e?.response?.status;

            let friendlyMsg = 'Hệ thống gặp gián đoạn tạm thời. Bạn thử gửi lại yêu cầu giúp ORCA nhé!';

            if (status === 502 || status === 503 || rawLower.includes('bad gateway') || rawLower.includes('cannot reach ai') || rawLower.includes('gemini') || rawLower.includes('empty_tasks')) {
                friendlyMsg = 'Hệ thống AI đang bận hoặc gián đoạn tạm thời. Bạn chờ vài giây rồi gửi lại giúp ORCA nhé!';
            } else if (status === 500 || rawLower.includes('internal server error')) {
                friendlyMsg = 'Hệ thống gặp sự cố kỹ thuật tạm thời. Vui lòng thử lại sau giây lát!';
            } else if (rawLower.includes('network') || rawLower.includes('failed to fetch') || rawLower.includes('econnrefused')) {
                friendlyMsg = 'Không thể kết nối đến máy chủ. Bạn kiểm tra lại đường truyền mạng giúp ORCA nhé!';
            } else if (raw && !rawLower.includes('exception') && !rawLower.includes('http') && !rawLower.includes('502') && !rawLower.includes('500') && !rawLower.includes('json')) {
                friendlyMsg = raw;
            }

            const errorMsg: ChatMessage = {
                id: Date.now().toString() + '-err',
                role: 'assistant',
                content: friendlyMsg,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGoal = async (result: AiParseResult) => {
        if (!teamId) return;
        setLoading(true);
        try {
            await goalService.create({
                teamId,
                title: result.title || 'Mục tiêu mới',
                outputTarget: result.quantity || result.description || '',
                rawInstruction: result.description || '',
                deadline: result.deadline || undefined,
                priority: priorityNumber(result.priority),
                useAi: false,
                chatLog: JSON.stringify(messages),
                tasks: result.tasks || []
            } as any);

            // Stay on the page and show success message
            const successMsg: ChatMessage = {
                id: Date.now().toString() + '-success',
                role: 'assistant',
                content: '🎉 **Tuyệt vời!** Công việc đã được phân bổ thành công vào nhóm. Vui lòng bấm vào "Quay lại tổng quan" để xem chi tiết, hoặc bạn có thể tiếp tục tạo mục tiêu mới ở đây.',
                timestamp: new Date()
            };
            setMessages(prev => {
                const activeMessage = findActiveDraftMessage(prev);
                return [
                    ...prev.map(message =>
                        message.id === activeMessage?.id
                            ? { ...message, isConfirmed: true }
                            : message
                    ),
                    successMsg
                ];
            });

        } catch (e: any) {
            const msgStr = e?.response?.data?.error || e?.response?.data?.message || e.message || 'Không thể tạo công việc, vui lòng thử lại';
            if (isPaymentRequiredError(e)) {
                setTrialActive(false);
                window.dispatchEvent(new CustomEvent('payment-required'));
                return;
            }
            const errorMsg: ChatMessage = {
                id: Date.now().toString() + '-err',
                role: 'assistant',
                content: msgStr,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelDraft = (msgId: string) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isCancelled: true } : m));
    };

    const handleRevertDraft = (historyMsgId: string) => {
        setMessages(prev => {
            return prev.map(message => {
                if (message.id === historyMsgId) {
                    return { ...message, isArchived: false };
                }
                if (message.result && !message.isConfirmed && !message.isCancelled) {
                    return { ...message, isArchived: true };
                }
                return message;
            });
        });

        setTimeout(() => {
            const el = document.getElementById(`msg-${historyMsgId}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    const handleDuplicateDraft = (historyMsgId: string) => {
        const sourceMsg = messages.find(m => m.id === historyMsgId);
        if (!sourceMsg || !sourceMsg.result) return;
        
        const newMsg: ChatMessage = {
            ...sourceMsg,
            id: Date.now().toString() + '-dup',
            isConfirmed: false,
            isCancelled: false,
            isArchived: false,
            timestamp: new Date()
        };
        
        setMessages(prev => {
            const archivedPrev = prev.map(m => {
                if (m.result && !m.isConfirmed && !m.isCancelled) {
                    return { ...m, isArchived: true };
                }
                return m;
            });
            return [...archivedPrev, newMsg];
        });
        
        setTimeout(() => {
            const el = document.getElementById(`msg-${newMsg.id}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    const handleNewConversation = () => {
        if (loading) return;

        setConversations(previous =>
            upsertConversation(previous, activeConversationId, messages, conversationState)
        );
        setActiveConversationId(createConversationId());
        setMessages([]);
        setConversationState(idleConversation);
        setInput('');
        setShowHistory(false);
        window.setTimeout(() => chatInputRef.current?.focus(), 0);
    };

    const handleOpenConversation = (conversationId: string) => {
        if (loading || conversationId === activeConversationId) return;

        const selectedConversation = conversations.find(
            conversation => conversation.id === conversationId
        );
        if (!selectedConversation) return;

        setConversations(previous =>
            upsertConversation(previous, activeConversationId, messages, conversationState)
        );
        setActiveConversationId(selectedConversation.id);
        setMessages(reviveMessages(selectedConversation.messages));
        setConversationState(selectedConversation.conversationState || idleConversation);
        setInput('');
        setShowHistory(false);
    };

    const hasActiveDraft = Boolean(findActiveDraftMessage(messages)?.result);
    const recentConversations = conversations
        .slice()
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (!team) {
        return (
            <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', opacity: 0.5 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}><ion-icon name="time-outline" style={{ fontSize: '40px' }}></ion-icon></div>
                    <p>Đang tải dữ liệu...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="task-gpt-page">
            <style>{`
                body.task-studio-mode .topbar {
                    display: none;
                }
                body.task-studio-mode .layout-content {
                    padding: 0;
                    background: var(--bg-primary);
                }
                body.task-studio-mode .layout-main {
                    background: var(--bg-primary);
                }
                body.task-studio-mode .sidebar {
                    background: var(--bg-secondary);
                    border-right: 1px solid var(--border);
                    box-shadow: none;
                }
                body.task-studio-mode .sidebar-logo {
                    border-bottom: 0;
                    margin-bottom: 20px;
                }
                body.task-studio-mode .logo-text {
                    color: var(--primary) !important;
                    -webkit-text-fill-color: var(--primary);
                    letter-spacing: 0.12em;
                }
                body.task-studio-mode .logo-icon {
                    color: var(--primary) !important;
                    background: var(--bg-secondary);
                    box-shadow: inset 0 0 0 1px var(--border);
                }
                body.task-studio-mode .nav-label {
                    color: var(--text-secondary);
                    opacity: 1;
                }
                body.task-studio-mode .nav-item {
                    color: var(--text-primary);
                    background: transparent;
                    border-radius: 10px;
                    font-weight: 520;
                }
                body.task-studio-mode .nav-item.active,
                body.task-studio-mode .nav-item:hover {
                    color: var(--primary);
                    background: rgba(50, 34, 20, 0.04);
                    box-shadow: none;
                    transform: none;
                }
                body.task-studio-mode .nav-item.active::before {
                    display: none;
                }
                .task-gpt-page {
                    height: 100vh;
                    display: flex;
                    color: var(--text-primary);
                    background: var(--bg-primary);
                    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    overflow: hidden;
                }
                .task-gpt-sidebar {
                    width: ${sidebarOpen ? '260px' : '0px'};
                    opacity: ${sidebarOpen ? 1 : 0};
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-secondary);
                    border-right: ${sidebarOpen ? '1px solid var(--border)' : 'none'};
                    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-in-out;
                    overflow: hidden;
                    white-space: nowrap;
                }
                .task-gpt-conversation-item {
                    width: 100%;
                    display: block;
                    padding: 10px 12px;
                    overflow: hidden;
                    color: var(--text-primary);
                    background: transparent;
                    border: 0;
                    border-radius: 8px;
                    font-size: 14px;
                    line-height: 1.35;
                    text-align: left;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: background-color 160ms ease, transform 160ms ease;
                }
                .task-gpt-conversation-item:hover {
                    background: var(--bg-primary);
                }
                .task-gpt-conversation-item.active {
                    background: var(--bg-primary);
                    font-weight: 650;
                }
                @media (prefers-reduced-motion: reduce) {
                    .task-gpt-conversation-item {
                        transition: none;
                    }
                }
                .task-gpt-content {
                    flex: 1;
                    display: grid;
                    grid-template-rows: auto minmax(0, 1fr) auto;
                    min-width: 0;
                    position: relative;
                }
                .task-gpt-topbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    min-height: 56px;
                    padding: 0 26px;
                    background: var(--bg-primary);
                }
                .task-gpt-model {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-primary);
                    font-size: 18px;
                    font-weight: 650;
                }
                .task-gpt-actions {
                    display: inline-flex;
                    align-items: center;
                    gap: 16px;
                    color: var(--text-primary);
                    font-size: 14px;
                    font-weight: 650;
                }
                .task-gpt-action {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: inherit;
                    background: transparent;
                    border: 0;
                    font: inherit;
                    cursor: pointer;
                }
                .task-gpt-chat {
                    min-height: 0;
                    overflow-y: auto;
                    padding: 34px 24px 170px;
                }
                .task-gpt-inner {
                    width: min(1200px, 100%);
                    margin: 0 auto;
                    display: grid;
                    gap: 28px;
                }
                .task-gpt-empty {
                    min-height: min(58vh, 560px);
                    display: grid;
                    align-content: center;
                    justify-items: center;
                    text-align: center;
                }
                .task-gpt-empty h1 {
                    margin: 0 0 14px;
                    color: var(--text-primary);
                    font-size: clamp(1.8rem, 3vw, 2.6rem);
                    font-weight: 650;
                    letter-spacing: 0;
                }
                .task-gpt-empty p {
                    max-width: 620px;
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 16px;
                    line-height: 1.6;
                }
                .task-gpt-suggestions {
                    margin-top: 28px;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 12px;
                    width: min(880px, 100%);
                }
                .task-gpt-suggestion {
                    min-height: 54px;
                    padding: 0 16px;
                    color: var(--text-primary);
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 14px;
                    font: inherit;
                    font-size: 14px;
                    font-weight: 520;
                    text-align: left;
                    cursor: pointer;
                }
                .task-gpt-suggestion:hover {
                    background: var(--bg-card-hover);
                }
                .task-gpt-message-row {
                    display: flex;
                    width: 100%;
                }
                .task-gpt-message-row.user {
                    justify-content: flex-end;
                }
                .task-gpt-message-row.assistant {
                    justify-content: flex-start;
                }
                .task-gpt-bubble {
                    max-width: min(960px, 90%);
                    color: var(--text-primary);
                    font-size: 16px;
                    line-height: 1.72;
                }
                .task-gpt-message-row.user .task-gpt-bubble {
                    max-width: min(720px, 75%);
                    padding: 11px 18px;
                    background: var(--bg-secondary);
                    border-radius: 22px;
                }
                .task-gpt-message-row.assistant .task-gpt-bubble {
                    padding: 0;
                    background: transparent;
                }
                .task-gpt-assistant-head {
                    margin-bottom: 8px;
                    color: var(--text-primary);
                    font-size: 15px;
                    font-weight: 650;
                }
                .task-gpt-message-actions {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-top: 14px;
                    color: var(--text-secondary);
                    font-size: 18px;
                }
                .task-gpt-token {
                    margin-left: auto;
                    color: var(--text-muted);
                    font-size: 12px;
                    font-weight: 650;
                }
                .task-gpt-result {
                    margin-top: 20px;
                    padding: 18px;
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    background: var(--bg-card);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
                }
                .task-gpt-loading {
                    color: var(--text-secondary);
                    font-size: 16px;
                    line-height: 1.6;
                }
                .task-gpt-composer-wrap {
                    position: sticky;
                    bottom: 0;
                    z-index: 10;
                    padding: 18px 24px 14px;
                    background: var(--bg-primary);
                    border-top: 1px solid var(--border);
                }
                .task-gpt-composer {
                    width: min(1200px, 100%);
                    min-height: 74px;
                    margin: 0 auto;
                    display: grid;
                    grid-template-columns: auto minmax(0, 1fr) auto;
                    align-items: end;
                    gap: 10px;
                    padding: 10px 12px 10px 16px;
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 28px;
                    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.08);
                }
                .task-gpt-icon-btn,
                .task-gpt-send {
                    width: 42px;
                    height: 42px;
                    display: grid;
                    place-items: center;
                    border: 0;
                    border-radius: 50%;
                    font: inherit;
                    cursor: pointer;
                }
                .task-gpt-icon-btn {
                    color: var(--text-primary);
                    background: transparent;
                    font-size: 24px;
                }
                .task-gpt-textarea {
                    width: 100%;
                    max-height: 170px;
                    min-height: 42px;
                    padding: 9px 4px;
                    color: var(--text-primary);
                    background: transparent;
                    border: 0;
                    outline: 0;
                    resize: none;
                    font: inherit;
                    font-size: 16px;
                    line-height: 1.5;
                }
                .task-gpt-textarea:focus,
                .task-gpt-textarea:focus-visible {
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                }
                .task-gpt-textarea::placeholder {
                    color: var(--text-muted);
                }
                .task-gpt-mode {
                    min-height: 34px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 0 10px;
                    color: var(--text-secondary);
                    background: transparent;
                    border: 0;
                    font: inherit;
                    font-size: 14px;
                }
                .task-gpt-mode:focus,
                .task-gpt-mode:focus-visible {
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                }
                .task-gpt-send {
                    color: var(--bg-primary);
                    background: var(--text-primary);
                    font-size: 18px;
                }
                .task-gpt-send:disabled {
                    background: var(--border);
                    color: var(--text-muted);
                    cursor: not-allowed;
                }
                .task-gpt-disclaimer {
                    width: min(880px, 100%);
                    margin: 8px auto 0;
                    color: var(--text-muted);
                    font-size: 12px;
                    text-align: center;
                }
                .markdown-content p {
                    margin: 0 0 12px;
                }
                .markdown-content p:last-child {
                    margin-bottom: 0;
                }
                .markdown-content table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 12px 0;
                    font-size: 13px;
                    background: var(--bg-card);
                }
                .markdown-content th,
                .markdown-content td {
                    border: 1px solid var(--border);
                    padding: 10px;
                    text-align: left;
                }
                .markdown-content th {
                    background: var(--bg-secondary);
                    font-weight: 700;
                }
                @media (max-width: 760px) {
                    .task-gpt-topbar {
                        padding-inline: 16px;
                    }
                    .task-gpt-chat {
                        padding-inline: 16px;
                    }
                    .task-gpt-suggestions {
                        grid-template-columns: 1fr;
                    }
                    .task-gpt-message-row.user .task-gpt-bubble,
                    .task-gpt-bubble {
                        max-width: 92%;
                    }
                    .task-gpt-mode {
                        display: none;
                    }
                    .task-gpt-composer {
                        grid-template-columns: auto minmax(0, 1fr) auto;
                    }
                }
            `}</style>

            <aside className="task-gpt-sidebar">
                <div style={{ padding: '16px' }}>
                    <button
                        type="button"
                        onClick={handleNewConversation}
                        disabled={loading}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                        onMouseOver={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseOut={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ion-icon name="add-outline" style={{ fontSize: 18 }}></ion-icon>
                            Tạo mới
                        </span>
                        <ion-icon name="create-outline" style={{ fontSize: 16 }}></ion-icon>
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', position: 'relative' }}>
                    <div style={{ position: 'sticky', top: '-12px', background: 'var(--bg-secondary)', padding: '12px 0 12px 0', zIndex: 10, fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Gần đây <ion-icon name="time-outline"></ion-icon>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
                        {recentConversations.length === 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '40px', opacity: 0.6, gap: '12px', padding: '0 10px', textAlign: 'center' }}>
                                <ion-icon name="chatbox-ellipses-outline" style={{ fontSize: '36px' }}></ion-icon>
                                <span style={{ fontSize: '13px', whiteSpace: 'normal', lineHeight: '1.4' }}>
                                    Lịch sử đang trống.<br/>Hãy bắt đầu một đoạn chat mới nhé.
                                </span>
                            </div>
                        )}
                        {recentConversations.map(conversation => (
                            <button
                                key={conversation.id}
                                type="button"
                                onClick={() => handleOpenConversation(conversation.id)}
                                className={`task-gpt-conversation-item ${conversation.id === activeConversationId ? 'active' : ''}`}
                                title={conversation.title}
                            >
                                {conversation.title}
                            </button>
                        ))}
                    </div>
                </div>
            </aside>

            <div className="task-gpt-content">
                <header className="task-gpt-topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button className="task-gpt-action" type="button" onClick={() => setSidebarOpen(prev => !prev)} title="Đóng/Mở Sidebar">
                            <ion-icon name="menu-outline"></ion-icon>
                        </button>
                        <button className="task-gpt-action" type="button" onClick={() => navigate(`/groups/${teamId}`)}>
                            <ion-icon name="chevron-back-outline"></ion-icon>
                            ORCA
                        </button>
                    </div>
                    <div className="task-gpt-actions">
                        <button className="task-gpt-action" type="button" onClick={() => setShowHistory(true)}>
                            <ion-icon name="time-outline"></ion-icon>
                            <span style={{ marginLeft: 4, fontWeight: 600 }}>Lịch sử</span>
                        </button>
                        <button className="task-gpt-action" type="button" onClick={() => setShowTokens(prev => !prev)}>
                            <ion-icon name="ellipsis-horizontal"></ion-icon>
                        </button>
                    </div>
                </header>

            {showHistory && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--bg-primary)', width: 600, maxWidth: '90%', maxHeight: '80%', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Lịch sử công việc đã xác nhận</h3>
                            <button onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--text-muted)' }}><ion-icon name="close-outline"></ion-icon></button>
                        </div>
                        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                            {messages.filter(m => hasDraftTasks(m.result) && m.isConfirmed).length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>Chưa có bản ghi nào được xác nhận.</div>
                            ) : (
                                messages.filter(m => hasDraftTasks(m.result) && m.isConfirmed).map(msg => (
                                    <div key={msg.id} style={{ marginBottom: 16, padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{msg.result?.title || msg.result?.description || msg.content}</div>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                                            <span>Xác nhận lúc: {msg.timestamp.toLocaleString()}</span>
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <button onClick={() => { handleRevertDraft(msg.id); setShowHistory(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><ion-icon name="eye-outline"></ion-icon> Xem chi tiết</button>
                                                <button onClick={() => { handleDuplicateDraft(msg.id); setShowHistory(false); }} style={{ background: 'none', border: 'none', color: '#b97820', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><ion-icon name="copy-outline"></ion-icon> Tạo lại</button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}



            <main className="task-gpt-chat">
                <div className="task-gpt-inner">
                    {messages.length === 0 && !loading ? (
                        <section className="task-gpt-empty">
                            <h1>Hôm nay bạn muốn tạo công việc gì?</h1>
                            <p>Mô tả kế hoạch rang xay, đóng gói, QC hoặc đơn hàng. ORCA sẽ phân tích và đề xuất task có cấu trúc cho nhóm.</p>
                            <div className="task-gpt-suggestions">
                                {[
                                    'Rang 120kg Arabica trước 17:00 hôm nay',
                                    'Chia việc QC và đóng gói cho đơn hàng mới',
                                    'Tạo kế hoạch sản xuất cho tuần này',
                                    'Phân công nhóm xử lý batch đang trễ',
                                ].map(suggestion => (
                                    <button
                                        key={suggestion}
                                        className="task-gpt-suggestion"
                                        type="button"
                                        onClick={() => {
                                            setInput(suggestion);
                                            window.setTimeout(() => chatInputRef.current?.focus(), 0);
                                        }}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </section>
                    ) : (
                        <>
                            {messages.map(msg => (
                                <div key={msg.id} id={`msg-${msg.id}`} className={`task-gpt-message-row ${msg.role}`}>
                                    <article className="task-gpt-bubble">
                                        {msg.role === 'assistant' && <div className="task-gpt-assistant-head">ORCA</div>}
                                        <div className="markdown-content">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{friendlyTaskError(msg.content)}</ReactMarkdown>
                                        </div>
                                        {msg.result && !msg.result.needsClarification && !msg.isArchived && (
                                            <div className="task-gpt-result">
                                                <AiResultRefinementForm
                                                    result={msg.result}
                                                    members={team?.members || []}
                                                    onConfirm={(finalData) => handleCreateGoal(finalData)}
                                                    onAsk={(question) => {
                                                        setInput(question);
                                                        chatInputRef.current?.focus();
                                                    }}
                                                    isConfirmed={msg.isConfirmed}
                                                    isCancelled={msg.isCancelled}
                                                    isArchived={msg.isArchived}
                                                    onCancel={() => handleCancelDraft(msg.id)}
                                                />
                                            </div>
                                        )}
                                        {msg.result && msg.isArchived && (
                                            <div style={{
                                                marginTop: 12,
                                                padding: '10px 12px',
                                                borderRadius: 10,
                                                background: '#f5f3ff',
                                                color: '#6d28d9',
                                                fontSize: 13,
                                                fontWeight: 600
                                            }}>
                                                Bản trước gồm {msg.result.tasks?.length || 0} công việc đã được chuyển vào lịch sử.
                                            </div>
                                        )}
                                        {msg.role === 'assistant' && (
                                            <div className="task-gpt-message-actions">
                                                <ion-icon name="copy-outline" onClick={() => handleCopyMessage(msg.content)} style={{ cursor: 'pointer' }} title="Copy"></ion-icon>
                                                <ion-icon name="thumbs-up-outline" onClick={() => alert('Cảm ơn bạn đã đánh giá!')} style={{ cursor: 'pointer' }} title="Hữu ích"></ion-icon>
                                                <ion-icon name="thumbs-down-outline" onClick={() => alert('Cảm ơn bạn đã đánh giá!')} style={{ cursor: 'pointer' }} title="Chưa tốt"></ion-icon>

                                                {showTokens && <span className="task-gpt-token">{formatTokenCount(estimateTokens(msg.content))} token</span>}
                                            </div>
                                        )}
                                    </article>
                                </div>
                            ))}
                            {loading && (
                                <div className="task-gpt-message-row assistant">
                                    <article className="task-gpt-bubble task-gpt-loading">ORCA đang phân tích kế hoạch...</article>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>
            </main>

            <footer className="task-gpt-composer-wrap">
                <div className="task-gpt-composer">
                    <button className="task-gpt-icon-btn" type="button" aria-label="Thêm nội dung">
                        <ion-icon name="add-outline"></ion-icon>
                    </button>
                    <textarea
                        ref={chatInputRef}
                        className="task-gpt-textarea"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onPaste={handleComposerPaste}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={hasActiveDraft ? 'Nhập yêu cầu sửa draft, ví dụ: Rút gọn còn 2 task' : 'Nhập yêu cầu, ví dụ: Rang 120kg Arabica trước 17:00 hôm nay'}
                        disabled={loading}
                        rows={1}
                    />
                    <button
                        className="task-gpt-send"
                        type="button"
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        aria-label="Gửi"
                    >
                        <ion-icon name={loading ? 'hourglass-outline' : 'arrow-up-outline'}></ion-icon>
                    </button>
                </div>
            </footer>
            </div>
        </div>
    );

    return (
        <div className="task-studio-page">
            <style>{`
                body.task-studio-mode .topbar {
                    display: none;
                }
                body.task-studio-mode .layout-content {
                    padding: 0;
                    background: #f7f3ed;
                }
                body.task-studio-mode .layout-main {
                    background: #f7f3ed;
                }
                body.task-studio-mode .sidebar {
                    background: #f4f0e8;
                    border-right: 1px solid #e4d9ca;
                    box-shadow: none;
                }
                body.task-studio-mode .sidebar-logo,
                body.task-studio-mode .nav-label,
                body.task-studio-mode .nav-text,
                body.task-studio-mode .nav-icon {
                    color: #5b3a1f !important;
                }
                body.task-studio-mode .nav-item {
                    color: #5b3a1f;
                    background: transparent;
                    border-radius: 0;
                }
                body.task-studio-mode .nav-item.active,
                body.task-studio-mode .nav-item:hover {
                    background: rgba(255, 171, 102, 0.18);
                    color: #8a4f22;
                }
                body.task-studio-mode .sidebar-user {
                    border-top-color: #e4d9ca;
                }
                .task-studio-page {
                    min-height: 100vh;
                    padding: clamp(28px, 4vw, 56px) clamp(28px, 6vw, 112px);
                    color: #4d3928;
                    background:
                        radial-gradient(circle at 52% 18%, rgba(255, 255, 255, 0.72), transparent 34%),
                        linear-gradient(180deg, #fbf8f3 0%, #f7f1e9 100%);
                    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
                .task-studio-shell {
                    width: min(1320px, 100%);
                    margin: 0 auto;
                    display: grid;
                    justify-items: center;
                    gap: 28px;
                }
                .task-studio-top {
                    width: 100%;
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    align-items: center;
                    gap: 16px;
                }
                .task-studio-back,
                .task-studio-ghost {
                    min-height: 34px;
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    padding: 0;
                    color: #8a5a2f;
                    background: transparent;
                    border: 0;
                    font: inherit;
                    font-size: 12px;
                    font-weight: 800;
                    cursor: pointer;
                }
                .task-studio-title {
                    text-align: center;
                }
                .task-studio-title h1 {
                    margin: 0 0 7px;
                    color: #3d2b1d;
                    font-size: 13px;
                    font-weight: 500;
                    letter-spacing: 0;
                }
                .task-studio-title p {
                    margin: 0;
                    color: #a49487;
                    font-family: Georgia, "Times New Roman", serif;
                    font-size: 13px;
                    font-style: italic;
                }
                .task-studio-card {
                    width: min(1080px, 100%);
                    min-height: clamp(300px, 34vh, 430px);
                    display: flex;
                    flex-direction: column;
                    padding: clamp(30px, 3.2vw, 44px);
                    background: rgba(255, 255, 255, 0.82);
                    border: 1px solid rgba(213, 198, 181, 0.78);
                    border-radius: 4px;
                    box-shadow: 0 18px 46px rgba(83, 58, 37, 0.09);
                }
                .task-studio-card-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 20px;
                    color: #8a4f22;
                    font-size: 11px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }
                .task-studio-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    color: #58c99c;
                    font-size: 10px;
                    font-weight: 900;
                }
                .task-studio-status::before {
                    content: "";
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: currentColor;
                    box-shadow: 0 0 0 4px rgba(88, 201, 156, 0.12);
                }
                .task-studio-input {
                    flex: 1;
                    width: 100%;
                    min-height: clamp(190px, 23vh, 300px);
                    padding: 0;
                    color: #4d3928;
                    background: transparent;
                    border: 0;
                    resize: none;
                    outline: none;
                    font: inherit;
                    font-size: clamp(1.35rem, 2.2vw, 2rem);
                    font-weight: 800;
                    line-height: 1.45;
                }
                .task-studio-input::placeholder {
                    color: rgba(79, 64, 52, 0.16);
                }
                .task-studio-tools {
                    display: flex;
                    justify-content: flex-end;
                    gap: 14px;
                    color: #c8b8a7;
                    font-size: 16px;
                }
                .task-studio-meta {
                    width: min(1080px, 100%);
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: clamp(28px, 4vw, 64px);
                }
                .task-studio-field {
                    min-height: 56px;
                    border-bottom: 1px solid #e8ded3;
                }
                .task-studio-field label {
                    display: block;
                    margin-bottom: 8px;
                    color: #b1a093;
                    font-size: 10px;
                    font-weight: 900;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                }
                .task-studio-select,
                .task-studio-time {
                    width: 100%;
                    min-height: 28px;
                    color: #3d2b1d;
                    background: transparent;
                    border: 0;
                    outline: 0;
                    font: inherit;
                    font-size: 13px;
                    font-weight: 850;
                }
                .task-studio-priority {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    min-height: 28px;
                }
                .task-studio-priority button {
                    padding: 0;
                    color: #8b6f58;
                    background: transparent;
                    border: 0;
                    font: inherit;
                    font-size: 13px;
                    font-weight: 850;
                    cursor: pointer;
                }
                .task-studio-priority button.active {
                    color: #3d2b1d;
                }
                .task-studio-priority button.active::before {
                    content: "";
                    display: inline-block;
                    width: 22px;
                    height: 2px;
                    margin-right: 7px;
                    vertical-align: middle;
                    background: #b87536;
                    box-shadow: 10px 0 0 #b87536;
                }
                .task-studio-cta {
                    min-width: 340px;
                    min-height: 64px;
                    margin-top: 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    color: #704018;
                    background: #ffb06f;
                    border: 0;
                    border-radius: 8px;
                    font: inherit;
                    font-size: 16px;
                    font-weight: 900;
                    cursor: pointer;
                    box-shadow: 0 18px 32px rgba(255, 176, 111, 0.28);
                    transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
                }
                .task-studio-cta:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    box-shadow: none;
                }
                .task-studio-cta:not(:disabled):hover {
                    transform: translateY(-1px);
                    box-shadow: 0 22px 38px rgba(255, 176, 111, 0.34);
                }
                .task-studio-note {
                    margin: 0;
                    color: #b6a79a;
                    font-size: 11px;
                    font-weight: 600;
                }
                .task-studio-thread {
                    width: min(1080px, 100%);
                    display: grid;
                    gap: 14px;
                    margin-top: 10px;
                }
                .task-studio-message {
                    padding: 16px 18px;
                    border: 1px solid #eadfd4;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.72);
                    color: #4d3928;
                    line-height: 1.65;
                    box-shadow: 0 10px 24px rgba(83, 58, 37, 0.06);
                }
                .task-studio-message.user {
                    background: rgba(255, 176, 111, 0.18);
                    border-color: rgba(255, 176, 111, 0.42);
                }
                .task-studio-message.assistant {
                    background: rgba(255, 255, 255, 0.86);
                }
                .task-studio-loading {
                    color: #8a5a2f;
                    font-weight: 800;
                }
                .task-studio-token {
                    display: inline-block;
                    margin-top: 8px;
                    color: #a49487;
                    font-size: 11px;
                    font-weight: 800;
                }
                .task-studio-result {
                    margin-top: 14px;
                }
                .task-studio-result .ai-refine-card {
                    box-shadow: none !important;
                }
                @media (max-width: 900px) {
                    .task-studio-page {
                        padding: 26px 18px;
                    }
                    .task-studio-top {
                        grid-template-columns: 1fr;
                        justify-items: center;
                    }
                    .task-studio-back,
                    .task-studio-ghost {
                        justify-self: stretch;
                    }
                    .task-studio-meta {
                        grid-template-columns: 1fr;
                        gap: 18px;
                    }
                    .task-studio-card {
                        padding: 22px;
                        min-height: 300px;
                    }
                    .task-studio-input {
                        min-height: 180px;
                        font-size: 1.25rem;
                    }
                    .task-studio-cta {
                        width: 100%;
                    }
                }
            `}</style>

            <div className="task-studio-shell">
                <div className="task-studio-top">
                    <button className="task-studio-back" onClick={() => navigate(`/groups/${teamId}`)}>
                        <ion-icon name="arrow-back-outline"></ion-icon>
                        Tổng quan
                    </button>
                    <div className="task-studio-title">
                        <h1>Thiết lập Công việc</h1>
                        <p>Studio Minimalist · Quy trình Vận hành Cao cấp</p>
                    </div>
                    <button className="task-studio-ghost" onClick={() => {
                        setInput('Rang 120kg Arabica Cầu Đất trước 17:00 hôm nay, chia việc cho rang, QC và đóng gói.');
                        window.setTimeout(() => chatInputRef.current?.focus(), 0);
                    }}>
                        Xem ví dụ
                    </button>
                </div>

                <section className="task-studio-card" aria-label="Trợ lý AI ORCA">
                    <div className="task-studio-card-head">
                        <span>✦ Trợ lý AI ORCA</span>
                        {trialActive ? (
                            <span className="task-studio-status">Sẵn sàng</span>
                        ) : (
                            <button
                                type="button"
                                className="task-studio-status"
                                onClick={() => navigate('/upgrade')}
                                style={{ cursor: 'pointer', border: 0 }}
                            >
                                Nâng cấp gói
                            </button>
                        )}
                    </div>
                    <textarea
                        ref={chatInputRef}
                        className="task-studio-input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onPaste={handleComposerPaste}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={trialActive ? 'Mô tả nhiệm vụ hoặc kế hoạch rang xay của bạn tại đây...' : 'Dùng thử đã hết hạn'}
                        disabled={!trialActive || loading}
                    />
                    <div className="task-studio-tools" aria-hidden="true">
                        <ion-icon name="mic-outline"></ion-icon>
                        <ion-icon name="attach-outline"></ion-icon>
                    </div>
                </section>

                <section className="task-studio-meta" aria-label="Thông tin công việc">
                    <div className="task-studio-field">
                        <label>Nhóm công tác</label>
                        <select className="task-studio-select" value={category} onChange={event => setCategory(event.target.value)}>
                            {categoryOptions.map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>
                    <div className="task-studio-field">
                        <label>Mức độ ưu tiên</label>
                        <div className="task-studio-priority">
                            {['Thấp', 'Trung bình', 'Cao'].map(level => (
                                <button
                                    key={level}
                                    type="button"
                                    className={priority === level ? 'active' : ''}
                                    onClick={() => setPriority(level)}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="task-studio-field">
                        <label>Thời hạn</label>
                        <button className="task-studio-time" type="button">
                            Hôm nay, 17:00
                        </button>
                    </div>
                </section>

                <button
                    className="task-studio-cta"
                    onClick={handleSend}
                    disabled={!trialActive || loading || !input.trim()}
                >
                    {loading ? 'Đang phân tích...' : 'Khởi tạo Nhiệm vụ'}
                    <ion-icon name="arrow-forward-outline"></ion-icon>
                </button>
                <p className="task-studio-note">⊙ ORCA sẽ tự động phân loại và giao việc cho các thành viên liên quan.</p>

                {(messages.length > 0 || loading) && (
                    <section className="task-studio-thread" aria-label="Kết quả AI">
                        {messages.map(msg => (
                            <article key={msg.id} className={`task-studio-message ${msg.role}`}>
                                <div className="markdown-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{friendlyTaskError(msg.content)}</ReactMarkdown>
                                </div>
                                {msg.result && !msg.result.needsClarification && (
                                    <div className="task-studio-result">
                                            <AiResultRefinementForm
                                                result={msg.result}
                                                members={team?.members || []}
                                                onConfirm={(finalData) => handleCreateGoal(finalData)}
                                                onAsk={(question) => {
                                                    setInput(question);
                                                chatInputRef.current?.focus();
                                            }}
                                        />
                                    </div>
                                )}
                                {showTokens && <span className="task-studio-token">{formatTokenCount(estimateTokens(msg.content))} token</span>}
                            </article>
                        ))}
                        {loading && <div className="task-studio-message assistant task-studio-loading">Đang phân tích...</div>}
                        <div ref={messagesEndRef} />
                    </section>
                )}

                <div style={{ display: 'flex', gap: 12, minHeight: 28 }}>
                    {messages.length > 0 && (
                        <button className="task-studio-ghost" onClick={clearHistory}>
                            <ion-icon name="trash-outline"></ion-icon>
                            Xóa lịch sử
                        </button>
                    )}
                    <button className="task-studio-ghost" onClick={() => setShowTokens(prev => !prev)}>
                        <ion-icon name="analytics-outline"></ion-icon>
                        {showTokens ? `${formatTokenCount(totalTokens)} token` : 'Xem token'}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            padding: '32px 24px', // Reduced side padding
            fontFamily: "'Inter', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center' // Center the content
        }}>
            <style>{`
                .main-content-layout {
                    width: 100%;
                    max-width: 1440px;
                    display: grid;
                    grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
                    gap: 32px;
                    align-items: start;
                }
                .task-select-trigger {
                    width: 100%;
                    min-height: 46px;
                    padding: 0 42px 0 14px;
                    border-radius: 10px;
                    border: 1px solid var(--border);
                    background: rgba(255, 255, 255, 0.03);
                    color: var(--text-primary);
                    font: 500 14px/1 var(--font);
                    text-align: left;
                    cursor: pointer;
                    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
                }
                .task-select-trigger:hover,
                .task-select-trigger[aria-expanded="true"] {
                    background: rgba(255, 255, 255, 0.055);
                    border-color: rgba(212, 165, 116, 0.5);
                    box-shadow: 0 0 0 3px rgba(212, 165, 116, 0.12);
                }
                .task-select-menu {
                    position: absolute;
                    z-index: 30;
                    top: calc(100% + 8px);
                    left: 0;
                    right: 0;
                    padding: 6px;
                    margin: 0;
                    list-style: none;
                    border-radius: 12px;
                    border: 1px solid rgba(212, 165, 116, 0.24);
                    background: #0c1322;
                    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
                    overflow: hidden;
                }
                .task-select-option {
                    width: 100%;
                    min-height: 38px;
                    padding: 0 12px;
                    border: 0;
                    border-radius: 8px;
                    background: transparent;
                    color: #d1bfae;
                    font: 500 14px/1 var(--font);
                    text-align: left;
                    cursor: pointer;
                    transition: background 0.18s, color 0.18s, box-shadow 0.18s;
                }
                .task-select-option:hover {
                    background: rgba(212, 165, 116, 0.12);
                    color: #fdf8f4;
                }
                .task-select-option.active {
                    background: rgba(212, 165, 116, 0.16);
                    color: #fdf8f4;
                    box-shadow: inset 3px 0 0 #d4a574;
                    font-weight: 700;
                }
                @media (max-width: 980px) {
                    .main-content-layout {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>

            {/* Navigation Header */}
            <div style={{ width: '100%', maxWidth: 1440, marginBottom: 32 }}>
                <button
                    onClick={() => navigate(`/groups/${teamId}`)}
                    style={{
                        background: 'none', border: 'none', color: '#d4a574',
                        fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                        cursor: 'pointer', padding: 0, marginBottom: 16
                    }}
                >
                    <ion-icon name="arrow-back-outline"></ion-icon> Quay lại tổng quan
                </button>
                <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Tạo công việc mới
                </h1>
                <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 15 }}>
                    Mô tả nhiệm vụ cần thực hiện, AI sẽ phân tích và chuẩn hóa thành task có cấu trúc.
                </p>
            </div>

            {/* Split Layout */}
            <div className="main-content-layout">

                {/* Left Panel: Group Info Form */}
                <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    padding: 24,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                        <span style={{ color: '#ec4899', fontSize: 20 }}><ion-icon name="business-outline"></ion-icon></span>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Thông tin nhóm</h2>
                    </div>

                    <div style={{ marginBottom: 20 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                            Tên nhóm
                        </label>
                        <input
                            type="text"
                            value={team!.name}
                            readOnly
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: 10,
                                border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                color: 'var(--text-secondary)', fontSize: 14, outline: 'none', cursor: 'not-allowed'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                            Danh mục
                        </label>
                        <div ref={categoryMenuRef} style={{ position: 'relative' }}>
                            <button
                                type="button"
                                className="task-select-trigger"
                                aria-haspopup="listbox"
                                aria-expanded={categoryOpen}
                                onClick={() => setCategoryOpen(open => !open)}
                            >
                                {category}
                            </button>
                            <ion-icon name="chevron-down-outline" style={{ position: 'absolute', right: 14, top: '50%', transform: `translateY(-50%) rotate(${categoryOpen ? 180 : 0}deg)`, color: 'var(--text-secondary)', pointerEvents: 'none', transition: 'transform 0.2s' }}></ion-icon>
                            {categoryOpen && (
                                <ul className="task-select-menu" role="listbox">
                                    {categoryOptions.map(option => (
                                        <li key={option}>
                                            <button
                                                type="button"
                                                className={`task-select-option ${category === option ? 'active' : ''}`}
                                                role="option"
                                                aria-selected={category === option}
                                                onClick={() => {
                                                    setCategory(option);
                                                    setCategoryOpen(false);
                                                }}
                                            >
                                                {option}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                            Mức ưu tiên
                        </label>
                        <div style={{ display: 'flex', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                            {['Thấp', 'Trung bình', 'Cao'].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setPriority(level)}
                                    style={{
                                        flex: 1, padding: '10px 0', fontSize: 13, fontWeight: 600,
                                        border: 'none', borderRight: level !== 'Cao' ? '1px solid var(--border)' : 'none',
                                        background: priority === level ? '#b97820' : 'transparent',
                                        color: priority === level ? '#ffffff' : 'var(--text-secondary)',
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Team Members with Job Labels */}
                    {team!.members && team!.members!.length > 0 && (
                        <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <ion-icon name="people-outline" style={{ color: '#d4a574', fontSize: 18 }}></ion-icon>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Thành viên nhóm ({team!.members!.length})</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {team!.members!.map((m: any) => {
                                    const initials = (m.fullName || m.username || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                                    const colors = ['#d4a574', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
                                    let hash = 0;
                                    for (const c of (m.username || '')) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
                                    const bgColor = colors[hash];
                                    return (
                                        <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: bgColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                                {initials}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {m.fullName || m.username}
                                                </div>
                                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                                    {m.jobLabels && m.jobLabels.length > 0 ? (
                                                        m.jobLabels.map((label: string, idx: number) => (
                                                            <span key={idx} style={{ background: 'rgba(212, 165, 116, 0.12)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700 }}>
                                                                {label}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa gán nhãn</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                                <ion-icon name="information-circle-outline" style={{ fontSize: 12, verticalAlign: 'middle' }}></ion-icon>{' '}
                                AI sẽ tự động phân công dựa trên nhãn dán công việc.
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Panel: AI Chat interface */}
                <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
                    display: 'flex', flexDirection: 'column',
                    height: 'clamp(560px, calc(100vh - 220px), 680px)',
                    minHeight: 0,
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#d4a574', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>
                                <ion-icon name="sparkles"></ion-icon>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>AI Xử Lý Công Việc</h3>
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Mô tả mục tiêu một cách tự nhiên</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button onClick={() => setShowTokens(prev => !prev)} style={{ background: showTokens ? 'rgba(167,139,250,0.12)' : 'none', border: '1px solid var(--border)', color: showTokens ? '#7c3aed' : 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6 }}>
                                <ion-icon name="analytics-outline"></ion-icon> {showTokens ? `${formatTokenCount(totalTokens)} token` : 'Xem token'}
                            </button>
                            {messages.length > 0 && (
                                <button onClick={clearHistory} style={{ background: 'none', border: '1px solid var(--border)', color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6 }}>
                                    <ion-icon name="trash-outline"></ion-icon> Xóa lịch sử
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setInput('Rang 120kg Arabica Cầu Đất trước 17:00 ngày mai, ưu tiên cao, cần chia việc cho rang, QC và đóng gói.');
                                    window.setTimeout(() => chatInputRef.current?.focus(), 0);
                                }}
                                style={{ background: 'none', border: 'none', color: '#d4a574', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                                <ion-icon name="book-outline"></ion-icon> Xem ví dụ
                            </button>
                        </div>
                    </div>

                    {/* Trial Banner */}
                    <div style={{ background: trialActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', padding: '8px 24px', fontSize: 12, fontWeight: 600, color: trialActive ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)' }}>
                        <ion-icon name={trialActive ? "checkmark-circle" : "warning"}></ion-icon> {trialActive ? `Còn ${trialDays} ngày dùng thử API` : 'Hết hạn dùng thử API. Vui lòng nâng cấp.'}
                    </div>

                    {/* Chat Area */}
                    <div style={{
                        flex: 1, minHeight: 0, padding: '24px', overflowY: 'auto',
                        display: 'flex', flexDirection: 'column', gap: 16,
                        background: 'var(--bg-input)' // Slight off-white background to match screenshot
                    }}>
                        {messages.length === 0 ? (
                            <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.5 }}>
                                <ion-icon name="chatbubbles-outline" style={{ fontSize: '48px', marginBottom: '12px' }}></ion-icon>
                                <p style={{ margin: 0, fontSize: '15px' }}>Hãy mô tả công việc của bạn...</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    width: '100%'
                                }}>
                                    {msg.role === 'user' ? (
                                        <div style={{
                                            maxWidth: '75%',
                                            padding: '14px 18px',
                                            borderRadius: '20px',
                                            borderBottomRightRadius: '4px',
                                            background: '#d4a574',
                                            color: '#fff',
                                            fontSize: '15px',
                                            lineHeight: '1.6',
                                        }}>
                                            {friendlyTaskError(msg.content)}
                                        </div>
                                    ) : (msg.result && !msg.result.needsClarification) ? (
                                        /* Case 1: Interactive Refinement Form (Matches Screenshot) */
                                        <AiResultRefinementForm
                                            result={msg.result}
                                            members={team?.members || []}
                                            onConfirm={(finalData) => handleCreateGoal(finalData)}
                                            onAsk={(question) => {
                                                setInput(question);
                                                chatInputRef.current?.focus();
                                            }}
                                        />
                                    ) : (
                                        /* Case 2: Clarification Question OR standard assistant msg */
                                        <div style={{
                                            maxWidth: '85%',
                                            padding: '16px 20px',
                                            borderRadius: '20px',
                                            borderBottomLeftRadius: '4px',
                                            background: msg.result?.needsClarification ? '#fff9db' : '#f1f5f9', // Yellowish for questions
                                            border: msg.result?.needsClarification ? '1px solid #f9eb97' : 'none',
                                            color: 'var(--text-primary)',
                                            fontSize: '15px',
                                            lineHeight: '1.6',
                                            alignSelf: 'flex-start',
                                            boxShadow: msg.result?.needsClarification ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
                                        }}>
                                            {msg.result?.needsClarification && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 700, fontSize: 13, color: '#d97706' }}>
                                                    <ion-icon name="alert-circle"></ion-icon> AI CẦN XÁC NHẬN THÊM
                                                </div>
                                            )}
                                            <div className="markdown-content">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{friendlyTaskError(msg.content)}</ReactMarkdown>
                                            </div>

                                            {/* Show Suggested Questions even in clarification mode */}
                                            {msg.result?.suggestedQuestions && msg.result.suggestedQuestions.length > 0 && (
                                                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                    {msg.result.suggestedQuestions.map((q, qIdx) => (
                                                        <button
                                                            key={qIdx}
                                                            onClick={() => {
                                                                setInput(q);
                                                                chatInputRef.current?.focus();
                                                            }}
                                                            style={{
                                                                background: 'var(--bg-card)',
                                                                border: '1px solid #fde68a',
                                                                color: '#d97706',
                                                                padding: '6px 12px',
                                                                borderRadius: '12px',
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                cursor: 'pointer',
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                            }}
                                                        >
                                                            {q}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {showTokens && (
                                        <span style={{ marginTop: 6, padding: '0 6px', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700 }}>
                                            {formatTokenCount(estimateTokens(msg.content))} token
                                        </span>
                                    )}
                                </div>
                            ))
                        )}

                        {loading && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <div style={{
                                    padding: '14px 18px', borderRadius: '20px', borderBottomLeftRadius: '4px',
                                    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '15px', display: 'flex', gap: '8px', alignItems: 'center'
                                }}>
                                    <span className="dot-typing" style={{ background: '#94a3b8' }}></span> Đang phân tích...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div style={{ padding: '24px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                            <textarea
                                ref={chatInputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onPaste={handleComposerPaste}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder={trialActive ? 'Mô tả công việc cần thực hiện...' : 'Dùng thử đã hết hạn'}
                                disabled={!trialActive || loading}
                                rows={2}
                                style={{
                                    flex: 1, fontSize: 15, fontFamily: 'inherit',
                                    background: 'var(--bg-card)',
                                    border: '2px solid #cbd5e1', // Slightly thicker border as per mockup
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    resize: 'none', outline: 'none',
                                    color: 'var(--text-primary)'
                                }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!trialActive || loading || !input.trim()}
                                style={{
                                    height: 52, padding: '0 24px', borderRadius: '12px',
                                    background: (trialActive && input.trim() && !loading) ? '#a78bfa' : '#e2e8f0',
                                    color: (trialActive && input.trim() && !loading) ? '#ffffff' : '#94a3b8',
                                    border: 'none', fontSize: 16, fontWeight: 600, cursor: (trialActive && input.trim() && !loading) ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ width: 18, height: 18, border: '2px solid currentColor', borderRadius: '50%', opacity: 0.5 }}></div> Gửi
                            </button>
                        </div>
                        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ion-icon name="sparkles"></ion-icon> AI sẽ tạo công việc, phân công và hạn chót.
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                .dot-typing {
                    position: relative;
                    left: -9999px;
                    width: 6px;
                    height: 6px;
                    border-radius: 5px;
                    background-color: transparent;
                    color: inherit;
                    box-shadow: 9984px 0 0 0 currentcolor, 9999px 0 0 0 currentcolor, 10014px 0 0 0 currentcolor;
                    animation: dot-typing 1.5s infinite linear;
                }
                @keyframes dot-typing {
                    0% { box-shadow: 9984px 0 0 0 currentcolor, 9999px 0 0 0 currentcolor, 10014px 0 0 0 currentcolor; }
                    16.667% { box-shadow: 9984px -6px 0 0 currentcolor, 9999px 0 0 0 currentcolor, 10014px 0 0 0 currentcolor; }
                    33.333% { box-shadow: 9984px 0 0 0 currentcolor, 9999px -6px 0 0 currentcolor, 10014px 0 0 0 currentcolor; }
                    50% { box-shadow: 9984px 0 0 0 currentcolor, 9999px 0 0 0 currentcolor, 10014px -6px 0 0 currentcolor; }
                    66.667% { box-shadow: 9984px 0 0 0 currentcolor, 9999px 0 0 0 currentcolor, 10014px 0 0 0 currentcolor; }
                    100% { box-shadow: 9984px 0 0 0 currentcolor, 9999px 0 0 0 currentcolor, 10014px 0 0 0 currentcolor; }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .markdown-content { white-space: pre-wrap; font-size: 14px; }
                .markdown-content table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; background: #fff; }
                .markdown-content th, .markdown-content td { border: 1px solid #fde68a; padding: 10px; text-align: left; }
                .markdown-content th { background: #fef3c7; font-weight: 700; color: #92400e; }
                .markdown-content p { margin: 8px 0; }
                .markdown-content h3 { margin: 16px 0 8px; font-size: 16px; font-weight: 800; color: #92400e; }
            `}</style>
        </div>
    );
}
/**
 * Component to refine and edit the AI parse result before creation.
 * Matches the design in the user's screenshot.
 */
function AiResultRefinementForm({ result, members, onConfirm, onAsk, isConfirmed, isCancelled, isArchived, onCancel }: { result: AiParseResult, members: TeamMemberInfo[], onConfirm: (data: AiParseResult) => void, onAsk: (q: string) => void, isConfirmed?: boolean, isCancelled?: boolean, isArchived?: boolean, onCancel?: () => void }) {
    const [editedResult, setEditedResult] = useState<AiParseResult>({
        ...result,
        tasks: result.tasks ? [...result.tasks] : []
    });

    const updateField = (field: keyof AiParseResult, value: any) => {
        setEditedResult(prev => ({ ...prev, [field]: value }));
    };

    const updateTaskTitle = (index: number, value: string) => {
        const newTasks = [...(editedResult.tasks || [])];
        newTasks[index] = { ...newTasks[index], title: value };
        updateField('tasks', newTasks);
    };

    const updateTaskDescription = (index: number, value: string) => {
        const newTasks = [...(editedResult.tasks || [])];
        newTasks[index] = { ...newTasks[index], description: value };
        updateField('tasks', newTasks);
    };

    const updateTaskAssignee = (index: number, userId: string) => {
        const newTasks = [...(editedResult.tasks || [])];
        if (!userId) {
            newTasks[index] = {
                ...newTasks[index],
                suggestedAssignee: undefined,
                suggestedAssigneeId: null,
                suggestedReason: null,
                assignee: undefined,
            };
            updateField('tasks', newTasks);
            return;
        }

        const member = members.find(item => item.userId === userId);
        if (!member) return;
        newTasks[index] = {
            ...newTasks[index],
            suggestedAssigneeId: userId,
            suggestedAssignee: member.fullName || member.username || 'Thành viên',
            suggestedReason: member.jobLabels?.length
                ? `Bạn chọn thủ công ${formatMemberIdentity(member)}. Nhãn hiện có: ${member.jobLabels.join(', ')}.`
                : `Bạn chọn thủ công ${formatMemberIdentity(member)} trên draft.`,
            assignee: member.username,
        };
        updateField('tasks', newTasks);
    };

    const clearTaskAssignee = (index: number) => {
        const newTasks = [...(editedResult.tasks || [])];
        newTasks[index] = {
            ...newTasks[index],
            suggestedAssignee: undefined,
            suggestedAssigneeId: null,
            suggestedReason: null,
            assignee: undefined,
        };
        updateField('tasks', newTasks);
    };

    const removeTask = (index: number) => {
        const newTasks = [...(editedResult.tasks || [])].filter((_, i) => i !== index);
        updateField('tasks', newTasks);
    };

    const addTask = () => {
        const newTasks = [...(editedResult.tasks || []), { title: 'Công việc mới', description: '', priority: 2, workload: 1, assignee: '' }];
        updateField('tasks', newTasks);
    };

    const assignedCount = (editedResult.tasks || []).filter(task => task.suggestedAssignee || task.assignee).length;
    const totalTasks = editedResult.tasks?.length || 0;
    const duplicateMemberNameKeys = getDuplicateMemberNameKeys(members);
    const selectedMemberIdentity = (userId: string | null | undefined, fallback: string | undefined) => {
        const member = members.find(item => item.userId === userId);
        return member ? formatMemberIdentity(member) : (fallback || 'Chưa chọn');
    };
    const handleConfirm = () => {
        const duplicateAssignees = (editedResult.tasks || [])
            .map(task => members.find(member => member.userId === task.suggestedAssigneeId))
            .filter((member): member is TeamMemberInfo => member !== undefined && hasDuplicateMemberName(member, duplicateMemberNameKeys));
        const uniqueDuplicateAssignees = [...new Map(duplicateAssignees.map(member => [member.userId, member])).values()];

        if (uniqueDuplicateAssignees.length > 0) {
            const identities = uniqueDuplicateAssignees.map(formatMemberIdentity).join('\n- ');
            const accepted = confirm(`Có người phụ trách trùng tên. Xác nhận bạn đã chọn đúng tài khoản:\n\n- ${identities}`);
            if (!accepted) return;
        }

        onConfirm(editedResult);
    };

    return (
        <div style={{
            width: '100%',
            background: 'var(--bg-card)',
            borderRadius: '24px',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            marginBottom: 16,
            animation: 'slideUp 0.4s ease-out'
        }}>
            {/* Header Area */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>Xem trước công việc</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(212, 165, 116, 0.12)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '20px', fontSize: 11, fontWeight: 700 }}>
                        <ion-icon name="checkmark-done-outline"></ion-icon> AI ĐÃ XỬ LÝ
                    </div>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Xem lại chi tiết công việc và phân bổ nhân sự trước khi xác nhận.</p>
            </div>

            <div style={{ padding: '32px' }}>
                {/* Standardization Card */}
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border)', padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                        <span style={{ fontSize: 20, color: '#f59e0b' }}><ion-icon name="clipboard-outline"></ion-icon></span>
                        <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Công việc đã chuẩn hóa</h3>
                            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                                AI đã gợi ý người phụ trách cho {assignedCount}/{totalTasks} task dựa trên job labels.
                            </p>
                        </div>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 12px',
                            borderRadius: 999,
                            background: assignedCount > 0 ? '#ecfdf5' : '#f8fafc',
                            color: assignedCount > 0 ? '#047857' : '#64748b',
                            border: `1px solid ${assignedCount > 0 ? '#a7f3d0' : '#e2e8f0'}`,
                            fontSize: 12,
                            fontWeight: 800
                        }}>
                            <ion-icon name="person-add-outline"></ion-icon>
                            {assignedCount > 0 ? `${assignedCount} gợi ý` : 'Chưa gán'}
                        </div>
                    </div>

                    {/* Title Input */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Tên công việc</label>
                        <input
                            type="text"
                            value={editedResult.title || ''}
                            onChange={e => updateField('title', e.target.value)}
                            style={{
                                width: '100%', padding: '14px 18px', borderRadius: '12px',
                                border: '1px solid var(--border)', background: 'var(--bg-card)',
                                color: 'var(--text-primary)', fontSize: 15, fontWeight: 500, outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                        />
                    </div>

                    {/* Task List (Mô tả chi tiết) */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Chi tiết mô tả</label>
                        {duplicateMemberNameKeys.size > 0 && (
                            <div
                                id="duplicate-member-warning"
                                role="alert"
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 9,
                                    marginBottom: 12,
                                    padding: '10px 12px',
                                    borderRadius: 12,
                                    border: '1px solid #fcd34d',
                                    background: '#fffbeb',
                                    color: '#92400e',
                                    fontSize: 12,
                                    lineHeight: 1.45,
                                }}
                            >
                                <ion-icon name="warning-outline" style={{ fontSize: 17, flexShrink: 0 }}></ion-icon>
                                <span><strong>Có thành viên trùng tên.</strong> Hãy kiểm tra username và mã nhân viên trước khi xác nhận phân công.</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {editedResult.tasks?.map((task, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 16,
                                    padding: 18,
                                    borderRadius: 18,
                                    border: '1px solid #dbe3ef',
                                    background: 'var(--bg-card)',
                                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                            <span style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: '50%',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: '#ede9fe',
                                                color: '#6d28d9',
                                                fontSize: 13,
                                                fontWeight: 800
                                            }}>{idx + 1}</span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 900, textTransform: 'uppercase' }}>Task draft</div>
                                                <input
                                                    type="text"
                                                    value={task.title || ''}
                                                    onChange={e => updateTaskTitle(idx, e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        minWidth: 0,
                                                        marginTop: 3,
                                                        padding: 0,
                                                        border: 0,
                                                        background: 'transparent',
                                                        color: 'var(--text-primary)',
                                                        fontSize: 17,
                                                        fontWeight: 850,
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeTask(idx)}
                                            aria-label="Xóa task"
                                            title="Xóa task"
                                            style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: '50%',
                                                background: 'rgba(239, 68, 68, 0.1)',
                                                border: '1px solid #fecdd3',
                                                color: '#e11d48',
                                                cursor: 'pointer',
                                                fontSize: 20,
                                                display: 'grid',
                                                placeItems: 'center',
                                                flexShrink: 0
                                            }}
                                        >
                                            <ion-icon name="close-circle-outline"></ion-icon>
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(260px, 0.8fr)', gap: 16, alignItems: 'stretch' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                                            <label style={{ fontSize: 12, fontWeight: 850, color: 'var(--text-secondary)' }}>Mô tả chi tiết</label>
                                            <textarea
                                                value={task.description || ''}
                                                onChange={e => updateTaskDescription(idx, e.target.value)}
                                                rows={4}
                                                style={{
                                                    width: '100%',
                                                    minHeight: 112,
                                                    padding: '13px 14px',
                                                    borderRadius: 14,
                                                    border: '1px solid #cbd5e1',
                                                    background: 'var(--bg-input)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: 14,
                                                    lineHeight: 1.55,
                                                    resize: 'vertical',
                                                    outline: 'none',
                                                    fontFamily: 'inherit'
                                                }}
                                            />
                                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 999, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 750 }}>
                                                    <ion-icon name="barbell-outline"></ion-icon>
                                                    Workload: {task.workload || 1}
                                                </span>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 999, background: 'rgba(249, 115, 22, 0.1)', color: 'var(--warning)', fontSize: 12, fontWeight: 750 }}>
                                                    <ion-icon name="flag-outline"></ion-icon>
                                                    Priority: {task.priority || 2}
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{
                                            borderRadius: 16,
                                            border: `1px solid ${task.suggestedAssignee || task.assignee ? '#a7f3d0' : '#fde68a'}`,
                                            background: task.suggestedAssignee || task.assignee ? '#f0fdf4' : '#fffbeb',
                                            padding: 14,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 12,
                                            minWidth: 0
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                                <span style={{
                                                    width: 34,
                                                    height: 34,
                                                    borderRadius: '50%',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: task.suggestedAssignee || task.assignee ? '#10b981' : '#f59e0b',
                                                    color: '#fff',
                                                    flexShrink: 0
                                                }}>
                                                    <ion-icon name={task.suggestedAssignee || task.assignee ? 'person-circle-outline' : 'alert-circle-outline'}></ion-icon>
                                                </span>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: 11,
                                                        lineHeight: 1.2,
                                                        color: task.suggestedAssignee || task.assignee ? '#047857' : '#92400e',
                                                        fontWeight: 900,
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        Người phụ trách
                                                    </div>
                                                    <div style={{
                                                        marginTop: 2,
                                                        fontSize: 15,
                                                        color: 'var(--text-primary)',
                                                        fontWeight: 900,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {selectedMemberIdentity(task.suggestedAssigneeId, task.suggestedAssignee || task.assignee)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 850 }}>Chọn member</label>
                                                <select
                                                    value={task.suggestedAssigneeId || ''}
                                                    onChange={e => updateTaskAssignee(idx, e.target.value)}
                                                    aria-describedby={duplicateMemberNameKeys.size > 0 ? 'duplicate-member-warning' : undefined}
                                                    style={{
                                                        width: '100%',
                                                        minHeight: 42,
                                                        padding: '0 12px',
                                                        borderRadius: 12,
                                                        border: '1px solid #cbd5e1',
                                                        background: 'var(--bg-card)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: 14,
                                                        fontWeight: 700,
                                                        outline: 'none'
                                                    }}
                                                >
                                                    <option value="">Chưa gán</option>
                                                    {members.map(member => (
                                                        <option key={member.userId} value={member.userId}>
                                                            {hasDuplicateMemberName(member, duplicateMemberNameKeys) ? '⚠ ' : ''}{formatMemberIdentity(member)}{member.jobLabels?.length ? ` — ${member.jobLabels.join(', ')}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div style={{
                                                padding: 10,
                                                borderRadius: 12,
                                                background: 'rgba(255,255,255,0.72)',
                                                fontSize: 12,
                                                lineHeight: 1.45,
                                                color: task.suggestedAssignee || task.assignee ? '#065f46' : '#92400e'
                                            }}>
                                                <strong style={{ display: 'block', marginBottom: 3 }}>Lý do</strong>
                                                {task.suggestedReason || (task.suggestedAssignee || task.assignee
                                                    ? 'Phù hợp với nhãn công việc của task này.'
                                                    : 'AI không tìm thấy thành viên có nhãn phù hợp. Bạn có thể chọn thủ công ở đây.')}
                                            </div>

                                            {(task.suggestedAssignee || task.assignee) && (
                                                <button
                                                    type="button"
                                                    onClick={() => clearTaskAssignee(idx)}
                                                    style={{
                                                        alignSelf: 'flex-start',
                                                        border: '1px solid #bbf7d0',
                                                        background: 'var(--bg-card)',
                                                        color: '#047857',
                                                        borderRadius: 9,
                                                        padding: '7px 10px',
                                                        fontSize: 12,
                                                        fontWeight: 850,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Bỏ gợi ý
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={addTask}
                                style={{
                                    alignSelf: 'flex-start', background: '#f5f3ff', border: '1px solid #ddd6fe',
                                    color: '#7c3aed', padding: '8px 16px', borderRadius: '10px',
                                    fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                                }}
                            >
                                <ion-icon name="add-outline"></ion-icon> Thêm mục
                            </button>
                        </div>
                    </div>

                    {/* Deadline & Priority Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Hạn chót</label>
                            <input
                                type="text"
                                value={editedResult.deadline || ''}
                                onChange={e => updateField('deadline', e.target.value)}
                                style={{
                                    width: '100%', padding: '12px 16px', borderRadius: '12px',
                                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                                    color: 'var(--text-primary)', fontSize: 14, outline: 'none'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Ưu tiên</label>
                            <div style={{ display: 'flex', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)' }}>
                                {['Low', 'Medium', 'High'].map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => updateField('priority', p)}
                                        style={{
                                            flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 700,
                                            border: 'none', borderRight: p !== 'High' ? '1px solid #f1f5f9' : 'none',
                                            background: (editedResult.priority?.toLowerCase() || 'medium') === p.toLowerCase() ? '#b97820' : 'transparent',
                                            color: (editedResult.priority?.toLowerCase() || 'medium') === p.toLowerCase() ? '#fff' : '#64748b',
                                            cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Suggested Questions */}
                {editedResult.suggestedQuestions && editedResult.suggestedQuestions.length > 0 && (
                    <div style={{ marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, color: '#d4a574', fontSize: 13, fontWeight: 700 }}>
                            <ion-icon name="bulb-outline"></ion-icon> Gợi ý từ AI để tối ưu kế hoạch:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {editedResult.suggestedQuestions.map((q, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => onAsk(q)}
                                    style={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                                        color: '#4f46e5', padding: '8px 16px', borderRadius: '12px',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                        transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = '#c7d2fe'; }}
                                    onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e0e7ff'; }}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer Buttons */}
                {!isConfirmed && !isCancelled && !isArchived && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
                        <button
                            onClick={onCancel}
                            style={{ padding: '12px 32px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleConfirm}
                            style={{ padding: '12px 32px', borderRadius: '12px', border: 'none', background: '#b97820', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(185,120,32,0.24)' }}
                        >
                            Lưu thay đổi
                        </button>
                    </div>
                )}
                {isCancelled && (
                    <div style={{ marginTop: 20, textAlign: 'center', color: '#dc2626', fontWeight: 600, fontSize: 13, background: '#fef2f2', padding: '10px', borderRadius: '8px' }}>
                        Bản nháp này đã bị hủy.
                    </div>
                )}
                {isArchived && (
                    <div style={{ marginTop: 20, textAlign: 'center', color: '#6d28d9', fontWeight: 600, fontSize: 13, background: '#f5f3ff', padding: '10px', borderRadius: '8px' }}>
                        Đây là bản trước và đã được lưu trong lịch sử.
                    </div>
                )}
            </div>
        </div>
    );
}

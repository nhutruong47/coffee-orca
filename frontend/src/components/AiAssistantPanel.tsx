import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { aiService } from '../services/groupService';
import type { AiParseResult } from '../services/groupService';
import { estimateTokens, formatTokenCount } from '../utils/tokenUsage';

interface AiAssistantPanelProps {
    onCreateGoal?: (result: AiParseResult) => void;
    trialActive: boolean;
    trialDays: number;
    teamId: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    result?: AiParseResult;
    timestamp: Date;
}

export default function AiAssistantPanel({ onCreateGoal, trialActive, trialDays, teamId }: AiAssistantPanelProps) {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [showTokens, setShowTokens] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const totalTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || !trialActive || loading) return;

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
            // For now, the backend only has parseText APIs we use text,
            // but the UX will feel conversational.
            const res = await aiService.parseText(userMsg.content, teamId);

            const aiMsg: ChatMessage = {
                id: Date.now().toString() + '-ai',
                role: 'assistant',
                content: res.description || 'Tôi đã phân tích yêu cầu của bạn:',
                result: res,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (e: any) {
            const errorMsg: ChatMessage = {
                id: Date.now().toString() + '-err',
                role: 'assistant',
                content: e?.response?.data?.message || 'Lỗi kết nối AI. Hãy thử lại!',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    const priorityInfo: Record<string, { label: string; color: string; icon: string }> = {
        high: { label: 'Cao', color: '#a0673c', icon: '●' },
        medium: { label: 'Trung bình', color: '#d4a574', icon: '●' },
        low: { label: 'Thấp', color: '#22c55e', icon: '●' },
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(168,85,247,0.03) 100%)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 20,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '600px', // Allow scrolling for chat
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span className="icon-container glow" style={{ width: 36, height: 36, fontSize: 20, background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.3)', color: '#818cf8' }}><ion-icon name="hardware-chip-outline"></ion-icon></span>
                <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Trợ lý AI ORCA
                    </h3>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>
                        Mô tả mục tiêu công việc bằng ngôn ngữ tự nhiên
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowTokens(prev => !prev)}
                    style={{ marginLeft: 'auto', fontSize: 10, padding: '4px 10px', borderRadius: 20, background: showTokens ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)', color: showTokens ? '#a5b4fc' : 'var(--text-secondary)', fontWeight: 700, border: '1px solid rgba(99,102,241,0.24)', cursor: 'pointer' }}
                >
                    {showTokens ? `Token: ${formatTokenCount(totalTokens)}` : 'Xem token'}
                </button>
                {trialActive ? (
                    <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ion-icon name="checkmark-circle-outline" style={{ fontSize: '12px' }}></ion-icon> Còn {trialDays} ngày
                    </span>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ion-icon name="close-circle-outline" style={{ fontSize: '12px' }}></ion-icon> Hết hạn dùng thử
                        </span>
                        <Link to="/upgrade" style={{ fontSize: 10, padding: '4px 10px', borderRadius: 20, background: 'rgba(124,92,255,0.16)', color: '#a78bfa', fontWeight: 700, border: '1px solid rgba(124,92,255,0.28)' }}>
                            Nâng cấp token
                        </Link>
                    </div>
                )}
            </div>

            {/* Chat Messages Area */}
            <div className="ai-chat-container" style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: '200px',
                maxHeight: '400px',
                paddingRight: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                marginBottom: '16px',
            }}>
                {messages.length === 0 ? (
                    <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.5 }}>
                        <ion-icon name="chatbubbles-outline" style={{ fontSize: '40px', marginBottom: '8px' }}></ion-icon>
                        <p style={{ margin: 0, fontSize: '13px' }}>Hãy bắt đầu bằng cách nhập yêu cầu của bạn</p>
                        <p style={{ margin: '4px 0 0', fontSize: '11px' }}>VD: "Rang gấp 200kg cà phê Robusta trước cuối tuần"</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        }}>
                            {/* Message Bubble */}
                            <div className={`chat-bubble ${msg.role}`} style={{
                                maxWidth: '85%',
                                padding: '10px 14px',
                                borderRadius: '16px',
                                borderBottomRightRadius: msg.role === 'user' ? '2px' : '16px',
                                borderBottomLeftRadius: msg.role === 'assistant' ? '2px' : '16px',
                                background: msg.role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${msg.role === 'user' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                lineHeight: '1.5',
                            }}>
                                {msg.content}
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', padding: '0 4px' }}>
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {showTokens && ` • ${formatTokenCount(estimateTokens(msg.content))} token`}
                            </span>

                            {/* AI Parsed Result UI */}
                            {msg.result && (
                                <div style={{
                                    marginTop: '8px',
                                    width: '100%',
                                    maxWidth: '90%',
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(99,102,241,0.2)',
                                    borderRadius: '12px',
                                    padding: '14px 18px',
                                    alignSelf: 'flex-start',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: msg.result.source === 'gemini' ? 'rgba(99,102,241,0.15)' : 'rgba(245,158,11,0.15)', color: msg.result.source === 'gemini' ? '#818cf8' : '#f59e0b', fontWeight: 700 }}>
                                            {msg.result.source === 'gemini' ? 'Gemini AI' : 'Regex'}
                                        </span>
                                        {msg.result.needsClarification && (
                                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                                                <ion-icon name="warning-outline" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: 4 }}></ion-icon> Thiếu thông tin
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', fontSize: 12 }}>
                                        <div>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}><ion-icon name="document-text-outline" style={{ fontSize: '10px' }}></ion-icon> Tiêu đề</span>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{msg.result.title || '—'}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}><ion-icon name="cube-outline" style={{ fontSize: '10px' }}></ion-icon> Khối lượng</span>
                                            <div style={{ fontWeight: 600, color: '#60a5fa' }}>{msg.result.quantity || '—'}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}><ion-icon name="time-outline" style={{ fontSize: '10px' }}></ion-icon> Hạn chót</span>
                                            <div style={{ fontWeight: 600, color: '#f87171' }}>{msg.result.deadline || '—'}</div>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}><ion-icon name="options-outline" style={{ fontSize: '10px' }}></ion-icon> Ưu tiên</span>
                                            <div style={{ fontWeight: 600, color: priorityInfo[msg.result.priority]?.color || '#f59e0b' }}>
                                                {priorityInfo[msg.result.priority]?.icon} {priorityInfo[msg.result.priority]?.label || msg.result.priority}
                                            </div>
                                        </div>
                                    </div>

                                    {onCreateGoal && !msg.result.needsClarification && (
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => onCreateGoal(msg.result!)}
                                            style={{ marginTop: 12, width: '100%', fontSize: 12, padding: '8px 0', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8' }}
                                        >
                                            <ion-icon name="arrow-forward-circle-outline" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: 4 }}></ion-icon> Tạo mục tiêu
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}

                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <div className="chat-bubble assistant" style={{
                            padding: '10px 14px', borderRadius: '16px', borderBottomLeftRadius: '2px',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-secondary)', fontSize: '13px', display: 'flex', gap: '6px', alignItems: 'center'
                        }}>
                            <span className="dot-typing"></span> Đang suy nghĩ...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <input
                    className="form-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={trialActive ? 'Nhập yêu cầu quản lý xưởng...' : 'Dùng thử đã hết hạn'}
                    disabled={!trialActive || loading}
                    style={{
                        flex: 1, fontSize: 13,
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: '12px',
                        padding: '10px 14px'
                    }}
                />
                <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={!trialActive || loading || !input.trim()}
                    style={{ whiteSpace: 'nowrap', fontSize: 13, padding: '0 18px', borderRadius: '12px' }}
                >
                    <ion-icon name="send-outline" style={{ fontSize: '16px' }}></ion-icon>
                </button>
            </div>
        </div>
    );
}

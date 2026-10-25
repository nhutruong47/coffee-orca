import { useEffect, useRef, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import type { IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_BASE_URL } from '../services/api';

/**
 * Realtime notification hook (Quick Win 4 + F1.1 wire-up).
 *
 * Subscribes to the authenticated user's notification topic on the server
 * STOMP broker. On every push it:
 * <ul>
 *   <li>Prepends the notification to the {@code onListChange} list (so the
 *       bell dropdown in {@code Layout.tsx} refreshes without polling).</li>
 *   <li>Fires a toast via the existing {@code useToast()} context (no new
 *       toast infra — reuses the project's {@code ToastContainer}).</li>
 *   <li>Plays a short notification sound (skip if user muted).</li>
 * </ul>
 *
 * Auto-reconnects with exponential backoff on socket drop and tears down
 * cleanly on unmount or logout. Reconnect timer is stored in a ref and
 * cleared on cleanup to avoid firing after unmount.
 */
export interface NotificationPayload {
    id: string;
    title: string;
    message: string;
    type: string;
    taskId?: string | null;
    actorId?: string | null;
    read: boolean;
    createdAt: string;
}

export interface UseNotificationSocketOptions {
    /** Prepend incoming notification to the bell list. */
    onListChange?: (notification: NotificationPayload) => void;
    /** Connection state callback (true = connected). */
    onConnectionChange?: (connected: boolean) => void;
    /** Disable the hook (e.g. when logged out). */
    enabled?: boolean;
}

const MAX_BACKOFF_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 10;
// Map server-side notification type -> toast tone. Unknown falls back to "info".
const TYPE_TO_TONE: Record<string, 'success' | 'error' | 'warning' | 'info'> = {
    ORDER_CREATED: 'info',
    ORDER_ACCEPTED: 'success',
    ORDER_REJECTED: 'error',
    ORDER_CANCEL_REQUESTED: 'warning',
    ORDER_CANCELED: 'error',
    ORDER_CANCEL_REJECTED: 'info',
    ORDER_QUOTED: 'info',
    ORDER_DELIVERED: 'success',
    ORDER_COMPLETED: 'success',
    ORDER_STATUS_UPDATED: 'info',
    ORDER_DISPUTED: 'error',
    ORDER_RESOLVED: 'success',
    TASK_ASSIGNED: 'info',
    TASK_OVERDUE: 'warning',
    TASK_COMPLETED: 'success',
    REVIEW_RECEIVED: 'success',
    PAYMENT_SUCCESS: 'success',
    PAYMENT_FAILED: 'error',
};

export function useNotificationSocket(options: UseNotificationSocketOptions = {}): void {
    const { userId, token } = useAuth();
    const toast = useToast();
    const clientRef = useRef<Client | null>(null);
    const subscriptionRef = useRef<StompSubscription | null>(null);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const toastRef = useRef(toast);
    toastRef.current = toast;

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current !== null) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    const teardown = useCallback(() => {
        clearReconnectTimer();
        if (subscriptionRef.current) {
            try {
                subscriptionRef.current.unsubscribe();
            } catch {
                // ignore
            }
            subscriptionRef.current = null;
        }
        if (clientRef.current) {
            try {
                clientRef.current.deactivate();
            } catch {
                // ignore
            }
            clientRef.current = null;
        }
    }, [clearReconnectTimer]);

    useEffect(() => {
        const enabled = options.enabled ?? true;
        if (!enabled || !userId || !token) {
            teardown();
            optionsRef.current.onConnectionChange?.(false);
            return;
        }

        const socket = new SockJS(`${API_BASE_URL}/ws`);
        const client = new Client({
            webSocketFactory: () => socket as unknown as WebSocket,
            reconnectDelay: 0, // we own the backoff
            heartbeatIncoming: 10_000,
            heartbeatOutgoing: 10_000,
            connectHeaders: { Authorization: `Bearer ${token}` },
            debug: () => {
                // silenced: would spam production console
            },
        });

        client.onConnect = () => {
            reconnectAttemptRef.current = 0;
            optionsRef.current.onConnectionChange?.(true);
            subscriptionRef.current = client.subscribe(
                `/topic/user/${userId}/notifications`,
                (frame: IMessage) => {
                    let payload: NotificationPayload;
                    try {
                        payload = JSON.parse(frame.body) as NotificationPayload;
                    } catch {
                        return;
                    }
                    optionsRef.current.onListChange?.(payload);
                    const tone = TYPE_TO_TONE[payload.type] ?? 'info';
                    const handler = toastRef.current[tone];
                    if (handler) {
                        handler(payload.title, payload.message);
                    }
                    playNotificationSound();
                }
            );
        };

        client.onStompError = () => {
            optionsRef.current.onConnectionChange?.(false);
            scheduleReconnect();
        };

        client.onWebSocketClose = () => {
            optionsRef.current.onConnectionChange?.(false);
            scheduleReconnect();
        };

        const scheduleReconnect = () => {
            // Guard: stop reconnecting after the bound OR if client was torn down
            if (clientRef.current !== client) return;
            if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
                optionsRef.current.onConnectionChange?.(false);
                return;
            }
            const attempt = ++reconnectAttemptRef.current;
            const backoff = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
            clearReconnectTimer();
            reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                if (clientRef.current !== client) return;
                try {
                    client.activate();
                } catch {
                    // ignore — next onWebSocketClose will retry
                }
            }, backoff);
        };

        try {
            client.activate();
            clientRef.current = client;
        } catch {
            // fall through to cleanup
        }

        return () => {
            clearReconnectTimer();
            clientRef.current = null;
            subscriptionRef.current = null;
            try {
                client.deactivate();
            } catch {
                // ignore
            }
            optionsRef.current.onConnectionChange?.(false);
        };
    }, [userId, token, options.enabled, teardown, clearReconnectTimer]);
}

let cachedAudio: HTMLAudioElement | null = null;
function playNotificationSound() {
    if (typeof window === 'undefined') return;
    // Respect user mute preference (set elsewhere, e.g. settings page).
    if (window.localStorage.getItem('orca.muteNotifications') === '1') return;
    try {
        if (!cachedAudio) {
            cachedAudio = new Audio('data:audio/wav;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAGDgYtAgAyN+QWaGhl2l/jtinWiH0ifT3');
        }
        cachedAudio.currentTime = 0;
        cachedAudio.play().catch(() => { /* autoplay blocked */ });
    } catch {
        // ignore
    }
}

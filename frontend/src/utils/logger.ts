/**
 * Lightweight logger that can be replaced by a real backend in production.
 * Calls into console only when explicitly enabled via Vite env so production
 * builds stay silent. Keeping a single point of contact also makes log
 * routing / Sentry / Datadog integration trivial later.
 */

type Level = 'log' | 'info' | 'warn' | 'error' | 'debug';

const isDev = (() => {
    try {
        return typeof import.meta !== 'undefined'
            && Boolean((import.meta as any).env?.DEV);
    } catch {
        return false;
    }
})();

function emit(level: Level, args: unknown[]) {
    if (!isDev && level !== 'error') {
        return;
    }
    // Always forward errors so they show up in crash reports even in prod.
    if (level === 'error') {
        // eslint-disable-next-line no-console
        console.error(...args);
        return;
    }
    // eslint-disable-next-line no-console
    (console as any)[level]?.(...args);
}

export const logger = {
    log: (...args: unknown[]) => emit('log', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
    debug: (...args: unknown[]) => emit('debug', args),
};

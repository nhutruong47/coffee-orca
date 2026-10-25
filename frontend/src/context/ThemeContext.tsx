import { createContext, useContext, useEffect, useState, useLayoutEffect, useCallback, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeContextType {
    theme: ThemeMode;
    resolvedTheme: ResolvedTheme;
    setTheme: (t: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    resolvedTheme: 'dark',
    setTheme: () => { },
    toggleTheme: () => { },
});

const STORAGE_KEY = 'orca-theme';
const VALID_MODES: ThemeMode[] = ['dark', 'light', 'system'];

function isValidMode(value: string | null): value is ThemeMode {
    return value !== null && (VALID_MODES as string[]).includes(value);
}

function readInitialTheme(): ThemeMode {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (isValidMode(saved)) return saved;
    } catch { /* ignore */ }
    return 'dark';
}

function systemPrefersLight(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: light)').matches;
}

function applyTheme(resolved: ResolvedTheme) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>(() => readInitialTheme());
    const [systemPrefersLightState, setSystemPrefersLightState] = useState<boolean>(() => systemPrefersLight());

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }
        const mql = window.matchMedia('(prefers-color-scheme: light)');
        const handler = (event: MediaQueryListEvent) => {
            setSystemPrefersLightState(event.matches);
        };
        // Some legacy Safari only supports addListener
        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', handler);
            return () => mql.removeEventListener('change', handler);
        }
        mql.addListener(handler);
        return () => mql.removeListener(handler);
    }, []);

    const resolvedTheme: ResolvedTheme = theme === 'system'
        ? (systemPrefersLightState ? 'light' : 'dark')
        : theme;

    useLayoutEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
        applyTheme(resolvedTheme);
    }, [theme, resolvedTheme]);

    const setTheme = useCallback((t: ThemeMode) => {
        setThemeState(t);
    }, []);

    const toggleTheme = useCallback(() => {
        // Cycle through dark → light → system → dark for predictable UX.
        setThemeState(prev => {
            if (prev === 'dark') return 'light';
            if (prev === 'light') return 'system';
            return 'dark';
        });
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);

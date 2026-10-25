import { useTheme } from '../context/ThemeContext';

/**
 * Theme-aware chart palette.
 *
 * Reads CSS custom properties from `:root` (defined in `index.css`) so
 * Recharts stays in lockstep with the active theme — dark, light, and
 * the system-following mode handled by `ThemeProvider`.
 *
 * Returns a small set of stable categorical colors that read well
 * on both the dark (espresso) and light (cool-neutral) backgrounds.
 */
export interface ChartPalette {
    text: string;
    muted: string;
    grid: string;
    primary: string;
    accent: string;
    brandSoft: string;
    successSoft: string;
    warningSoft: string;
    dangerSoft: string;
    categorical: readonly string[];
}

function readCssVar(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (value && value.trim()) || fallback;
}

const DARK_CATEGORICAL = [
    '#60A5FA', '#34D399', '#FBBF24', '#F87171',
    '#A78BFA', '#F472B6', '#2DD4BF', '#FB923C',
];

const LIGHT_CATEGORICAL = [
    '#2563EB', '#059669', '#D97706', '#DC2626',
    '#7C3AED', '#DB2777', '#0F766E', '#EA580C',
];

export function useChartPalette(): ChartPalette {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme !== 'light';

    if (isDark) {
        return {
            text: readCssVar('--text-primary', '#F2E8DC'),
            muted: readCssVar('--text-muted', '#94A3B8'),
            grid: readCssVar('--border-default', '#3E2B1F'),
            primary: readCssVar('--brand', '#D4A574'),
            accent: readCssVar('--brand-hover', '#E2B888'),
            brandSoft: readCssVar('--brand-soft', 'rgba(212, 165, 116, 0.15)'),
            successSoft: readCssVar('--success-soft', 'rgba(34, 197, 94, 0.15)'),
            warningSoft: readCssVar('--warning-soft', 'rgba(245, 158, 11, 0.15)'),
            dangerSoft: readCssVar('--danger-soft', 'rgba(239, 68, 68, 0.15)'),
            categorical: DARK_CATEGORICAL,
        };
    }

    return {
        text: readCssVar('--text-primary', '#0F172A'),
        muted: readCssVar('--text-muted', '#64748B'),
        grid: readCssVar('--border-default', '#E5E7EB'),
        primary: readCssVar('--brand', '#B8860B'),
        accent: readCssVar('--brand-hover', '#D4A574'),
        brandSoft: readCssVar('--brand-soft', 'rgba(180, 134, 11, 0.10)'),
        successSoft: readCssVar('--success-soft', 'rgba(5, 150, 105, 0.10)'),
        warningSoft: readCssVar('--warning-soft', 'rgba(217, 119, 6, 0.10)'),
        dangerSoft: readCssVar('--danger-soft', 'rgba(220, 38, 38, 0.10)'),
        categorical: LIGHT_CATEGORICAL,
    };
}

/**
 * Static palette when called outside React (e.g. in helpers / chart
 * default props). Falls back to the dark palette; consumers should
 * prefer `useChartPalette` for live theme values.
 */
export const CHART_PALETTE_DARK: ChartPalette = {
    text: '#F2E8DC',
    muted: '#94A3B8',
    grid: '#3E2B1F',
    primary: '#D4A574',
    accent: '#E2B888',
    brandSoft: 'rgba(212, 165, 116, 0.15)',
    successSoft: 'rgba(34, 197, 94, 0.15)',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    categorical: DARK_CATEGORICAL,
};

export const CHART_PALETTE_LIGHT: ChartPalette = {
    text: '#0F172A',
    muted: '#64748B',
    grid: '#E5E7EB',
    primary: '#B8860B',
    accent: '#D4A574',
    brandSoft: 'rgba(180, 134, 11, 0.10)',
    successSoft: 'rgba(5, 150, 105, 0.10)',
    warningSoft: 'rgba(217, 119, 6, 0.10)',
    dangerSoft: 'rgba(220, 38, 38, 0.10)',
    categorical: LIGHT_CATEGORICAL,
};

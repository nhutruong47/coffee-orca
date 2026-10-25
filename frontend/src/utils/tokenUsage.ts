export function estimateTokens(text: string | null | undefined) {
    if (!text) return 0;
    const normalized = text.trim();
    if (!normalized) return 0;
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(Math.max(normalized.length / 4, wordCount * 1.35)));
}

export function formatTokenCount(value: number) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
    return String(value);
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: string | number; height?: number; radius?: number; style?: React.CSSProperties }) {
    return (
        <div style={{
            width, height, borderRadius: radius, background: 'var(--bg-input)',
            animation: 'orca-pulse 1.5s ease-in-out infinite',
            ...style,
        }} />
    );
}

export function CardSkeleton() {
    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 20, height: 120,
        }}>
            <Skeleton width="60%" height={14} style={{ marginBottom: 12 }} />
            <Skeleton width="40%" height={24} style={{ marginBottom: 16 }} />
            <Skeleton width="100%" height={8} radius={4} />
        </div>
    );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gap: 12, padding: '14px 16px',
                    borderBottom: i < rows - 1 ? '1px solid var(--border)' : 'none',
                    alignItems: 'center',
                }}>
                    {Array.from({ length: cols }).map((_, j) => (
                        <Skeleton key={j} height={14} />
                    ))}
                </div>
            ))}
        </div>
    );
}

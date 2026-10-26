export function vietnamDate(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function vietnamClock(value?: string | null): string {
    if (!value) return '—';
    if (!/(Z|[+-]\d\d:\d\d)$/.test(value)) return value.slice(11, 16);
    return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
export function apiError(error: unknown, fallback: string): string {
    const candidate = error as { response?: { data?: { message?: string; detail?: string; error?: string } } };
    return candidate.response?.data?.message || candidate.response?.data?.detail || candidate.response?.data?.error || fallback;
}
export function locationLabel(status?: string | null): string {
    return ({ WITHIN_RADIUS: 'Trong bán kính xưởng (GPS thiết bị)', OUTSIDE_RADIUS: 'Ngoài bán kính xưởng', LOW_ACCURACY: 'GPS sai số cao — chưa xác minh', NOT_CONFIGURED: 'Chưa cấu hình tọa độ xưởng — chưa xác minh' } as Record<string, string>)[status || ''] || 'Chưa xác minh vị trí';
}
export async function resolveRegion(lat: number, lng: number): Promise<string> {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=vi`);
        if (!res.ok) return '';
        const data = await res.json() as { display_name?: string; address?: Record<string, string> };
        const a = data.address || {};
        return [a.suburb || a.quarter || a.village || a.town || a.hamlet, a.city_district || a.district || a.county || a.municipality, a.city || a.state || a.province].filter(Boolean).join(', ') || (data.display_name || '').slice(0, 500);
    } catch { return ''; }
}

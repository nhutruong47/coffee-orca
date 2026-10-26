import api from './api';
export type ShiftType = 'SANG' | 'CHIEU' | 'DEM' | 'NGAY';
export type ProductionStage = 'RANH_VA_CHON' | 'RANG' | 'XAY' | 'DONG_GOI' | 'QA';
export interface EvidenceFields {
    id: string;
    checkInAddress?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationAccuracyMeters?: number | null;
    distanceMeters?: number | null;
    locationVerified?: boolean | null;
    locationStatus?: string | null;
    locationUnavailableReason?: string | null;
    hasCheckInPhoto?: boolean;
    checkOutAddress?: string | null;
    checkOutLatitude?: number | null;
    checkOutLongitude?: number | null;
    checkOutLocationAccuracyMeters?: number | null;
    checkOutDistanceMeters?: number | null;
    checkOutLocationVerified?: boolean | null;
    checkOutLocationStatus?: string | null;
    hasCheckOutPhoto?: boolean;
}
export interface AttendanceDTO extends EvidenceFields {
    userId: string;
    userName?: string;
    teamId: string;
    date: string;
    shiftType?: ShiftType;
    shiftStartTime?: string;
    shiftEndTime?: string;
    checkInTime?: string;
    checkOutTime?: string | null;
    productionStage?: ProductionStage;
    orderId?: string;
    orderTitle?: string;
    breakMinutes?: number;
    standardHours?: number;
    actualWorkHours?: number;
    workedHours?: number;
    regularHours?: number;
    overtimeHours?: number;
    hourlyRateVnd?: number;
    overtimeMultiplier?: number;
    regularPayVnd?: number;
    overtimePayVnd?: number;
    totalPayVnd?: number;
    attendanceStatus?: string;
    notes?: string;
}
export interface EvidencePayload {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    address?: string;
    photoDataUrl?: string;
    locationUnavailableReason?: string;
}
export interface CheckInPayload extends EvidencePayload { shiftType: ShiftType; stage: ProductionStage; orderId?: string }
export interface AttendanceSettingsDTO {
    workStartTime: string;
    workEndTime: string;
    standardHours: number;
    breakMinutes: number;
    hourlyRateVnd: number;
    overtimeMultiplier: number;
    workshopAddress: string | null;
    workshopLat: number | null;
    workshopLng: number | null;
    allowedRadiusMeters: number;
    requireLocation: boolean;
    requirePhoto: boolean;
}
export interface AttendanceCorrectionDTO {
    id: string;
    actorName: string;
    oldCheckInTime?: string | null;
    oldCheckOutTime?: string | null;
    newCheckInTime: string;
    newCheckOutTime: string;
    reason: string;
    createdAt: string;
}
export const attendanceService = {
    checkIn: (teamId: string, payload: CheckInPayload) => api.post<AttendanceDTO>(`/api/attendance/check-in/${teamId}`, payload).then(r => r.data),
    checkOut: (teamId: string, payload: EvidencePayload = {}) => api.post<AttendanceDTO>(`/api/attendance/check-out/${teamId}`, payload).then(r => r.data),
    getTodayAttendance: (teamId: string) => api.get<AttendanceDTO>(`/api/attendance/today/${teamId}`).then(r => r.status === 204 ? null : r.data),
    getHistory: (teamId: string) => api.get<AttendanceDTO[]>(`/api/attendance/history/${teamId}`).then(r => r.data),
    getSettings: (teamId: string) => api.get<AttendanceSettingsDTO>(`/api/attendance/settings/${teamId}`).then(r => r.data),
    updateSettings: (teamId: string, payload: AttendanceSettingsDTO) => api.put<AttendanceSettingsDTO>(`/api/attendance/settings/${teamId}`, payload).then(r => r.data),
    getTeamDaily: (teamId: string, date: string) => api.get<AttendanceDTO[]>(`/api/attendance/team-daily/${teamId}`, { params: { date } }).then(r => r.data),
    updateAttendance: (id: string, payload: { checkInTime: string; checkOutTime: string; reason: string }) => api.put<AttendanceDTO>(`/api/attendance/update/${id}`, payload).then(r => r.data),
    getCorrections: (id: string) => api.get<AttendanceCorrectionDTO[]>(`/api/attendance/corrections/${id}`).then(r => r.data),
    getPhoto: (id: string, event: 'check-in' | 'check-out') => api.get<Blob>(`/api/attendance/${id}/photo`, { params: { event }, responseType: 'blob' }).then(r => r.data),
};

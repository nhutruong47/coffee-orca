import api from './api';
export type ShiftType = 'SANG' | 'CHIEU' | 'DEM' | 'NGAY';
export type ProductionStage = 'RANH_VA_CHON' | 'RANG' | 'XAY' | 'DONG_GOI' | 'QA';

export interface AttendanceDTO {
    id: string;
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

export interface CheckInPayload {
    shiftType: ShiftType;
    stage: ProductionStage;
    orderId?: string;
}

export interface AttendanceSettingsDTO {
    workStartTime: string;
    workEndTime: string;
    standardHours: number;
    hourlyRateVnd: number;
    overtimeMultiplier: number;
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
    checkIn: (teamId: string, payload?: Partial<CheckInPayload>) =>
        api.post<AttendanceDTO>(`/api/attendance/check-in/${teamId}`, payload || {}).then(r => r.data),

    checkOut: (teamId: string) =>
        api.post<AttendanceDTO>(`/api/attendance/check-out/${teamId}`).then(r => r.data),

    getTodayAttendance: (teamId: string) =>
        api.get<AttendanceDTO>(`/api/attendance/today/${teamId}`).then(r => r.data).catch(() => null),

    getHistory: (teamId: string) =>
        api.get<AttendanceDTO[]>(`/api/attendance/history/${teamId}`).then(r => r.data),

    getTeamHistory: (teamId: string) =>
        api.get<AttendanceDTO[]>(`/api/attendance/team-history/${teamId}`).then(r => r.data),

    getTeamAttendanceToday: (teamId: string) =>
        api.get<AttendanceDTO[]>(`/api/attendance/team-today/${teamId}`).then(r => r.data),

    getSettings: (teamId: string) =>
        api.get<AttendanceSettingsDTO>(`/api/attendance/settings/${teamId}`).then(r => r.data),

    updateSettings: (teamId: string, payload: AttendanceSettingsDTO) =>
        api.put<AttendanceSettingsDTO>(`/api/attendance/settings/${teamId}`, payload).then(r => r.data),

    getTeamDaily: (teamId: string, date: string) =>
        api.get<AttendanceDTO[]>(`/api/attendance/team-daily/${teamId}`, { params: { date } }).then(r => r.data),

    updateAttendance: (attendanceId: string, payload: { checkInTime: string, checkOutTime: string, reason: string }) =>
        api.put<AttendanceDTO>(`/api/attendance/update/${attendanceId}`, payload).then(r => r.data),

    getCorrections: (attendanceId: string) =>
        api.get<AttendanceCorrectionDTO[]>(`/api/attendance/corrections/${attendanceId}`).then(r => r.data),

    getProductionStages: () =>
        api.get<ProductionStage[]>('/api/attendance/stages').then(r => r.data),

    getShiftTypes: () =>
        api.get<ShiftType[]>('/api/attendance/shifts').then(r => r.data),
};

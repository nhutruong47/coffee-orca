import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckInPanel from './CheckInPanel';
import { attendanceService } from '../../services/attendanceService';
vi.mock('../../services/attendanceService', () => ({ attendanceService: { getSettings: vi.fn(), getTodayAttendance: vi.fn(), checkIn: vi.fn(), checkOut: vi.fn() } }));
const settings = { workStartTime: '08:00', workEndTime: '17:00', standardHours: 8, breakMinutes: 60, hourlyRateVnd: 50000, overtimeMultiplier: 1.5, workshopAddress: null, workshopLat: null, workshopLng: null, allowedRadiusMeters: 200, requireLocation: false, requirePhoto: false };
describe('real check-in', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(attendanceService.getSettings).mockResolvedValue(settings);
        vi.mocked(attendanceService.getTodayAttendance).mockResolvedValue(null);
        vi.mocked(attendanceService.checkIn).mockResolvedValue({ id: 'att', userId: 'me', teamId: 'team', date: '2026-10-26', checkInTime: '2026-10-26T08:00:00' });
    });
    it('shows GPS denial and sends a real reason instead of invented coordinates', async () => {
        const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
        const gps = vi.fn((_success, failure) => failure({ code: 1 }));
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } });
        render(<CheckInPanel teamId="team" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Lấy vị trí GPS' }));
        expect(await screen.findByText(/Bạn đã từ chối quyền vị trí/)).toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Vào ca' }));
        await waitFor(() => expect(attendanceService.checkIn).toHaveBeenCalledWith('team', expect.objectContaining({ locationUnavailableReason: 'Bạn đã từ chối quyền vị trí' })));
        expect(vi.mocked(attendanceService.checkIn).mock.calls[0][1]).not.toHaveProperty('latitude');
        expect(vi.mocked(attendanceService.checkIn).mock.calls[0][1]).not.toHaveProperty('address');
    });
    it('falls back to raw coordinates without inventing a region when reverse geocoding fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        const gps = vi.fn(success => success({ coords: { latitude: 11.88, longitude: 108.54, accuracy: 12 } }));
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } });
        render(<CheckInPanel teamId="team" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Lấy vị trí GPS' }));
        expect(await screen.findByText(/11.880000, 108.540000/)).toBeInTheDocument();
        expect(screen.getByText(/Chưa cấu hình tọa độ xưởng/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Vào ca' }));
        await waitFor(() => expect(attendanceService.checkIn).toHaveBeenCalledWith('team', { shiftType: 'NGAY', stage: 'RANG', latitude: 11.88, longitude: 108.54, accuracyMeters: 12 }));
    });
    it('previews genuine GPS distance, sends only device coordinates, and clears evidence before checkout', async () => {
        vi.mocked(attendanceService.getSettings).mockResolvedValue({ ...settings, workshopLat: 10, workshopLng: 106 });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ address: { suburb: 'Phường Bến Nghé', city_district: 'Quận 1', city: 'Thành phố Hồ Chí Minh' } }) }));
        const gps = vi.fn(success => success({ coords: { latitude: 10, longitude: 106, accuracy: 8 } }));
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } });
        render(<CheckInPanel teamId="team" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Lấy vị trí GPS' }));
        expect(await screen.findByText(/Vùng nhận diện: Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh/)).toBeInTheDocument();
        expect(screen.getByText(/Cách xưởng 0 m/)).toBeInTheDocument();
        expect(screen.getByText(/Trong bán kính xưởng/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Vào ca' }));
        await waitFor(() => expect(attendanceService.checkIn).toHaveBeenCalledWith('team', { shiftType: 'NGAY', stage: 'RANG', latitude: 10, longitude: 106, accuracyMeters: 8, address: 'Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh' }));
        expect(await screen.findByRole('button', { name: 'Tan ca' })).toBeInTheDocument();
        expect(screen.getByText(/Chưa xác minh vị trí/)).toBeInTheDocument();
    });
    it('blocks required GPS or photo without faking evidence', async () => {
        vi.mocked(attendanceService.getSettings).mockResolvedValue({ ...settings, requireLocation: true, requirePhoto: true, workshopLat: 10, workshopLng: 106 });
        render(<CheckInPanel teamId="team" />);
        expect(await screen.findByRole('button', { name: 'Vào ca' })).toBeDisabled();
        expect(screen.getByText(/Bắt buộc vị trí/)).toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
    it('does not request GPS on mount, accepts optional missing evidence explicitly unverified', async () => {
        const gps = vi.fn(); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } });
        render(<CheckInPanel teamId="team" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Vào ca' }));
        await waitFor(() => expect(attendanceService.checkIn).toHaveBeenCalledWith('team', { shiftType: 'NGAY', stage: 'RANG', locationUnavailableReason: 'Chưa cung cấp GPS' }));
        expect(gps).not.toHaveBeenCalled();
        expect(screen.getByText(/Chưa xác minh vị trí/)).toBeInTheDocument();
    });
});

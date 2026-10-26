import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import AttendanceSettings from './AttendanceSettings';
import { attendanceService } from '../../services/attendanceService';
vi.mock('../../services/attendanceService', () => ({ attendanceService: { getSettings: vi.fn(), updateSettings: vi.fn() } }));
it('persists night shifts with owner-configured radius and no invented GPS', async () => {
    const config = { workStartTime: '22:00', workEndTime: '06:00', standardHours: 8, breakMinutes: 0, hourlyRateVnd: 50000, overtimeMultiplier: 1.5, workshopAddress: null, workshopLat: null, workshopLng: null, allowedRadiusMeters: 200, requireLocation: false, requirePhoto: false };
    vi.mocked(attendanceService.getSettings).mockResolvedValue(config); vi.mocked(attendanceService.updateSettings).mockResolvedValue(config);
    render(<AttendanceSettings teamId="team" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() => expect(attendanceService.updateSettings).toHaveBeenCalledWith('team', config));
});

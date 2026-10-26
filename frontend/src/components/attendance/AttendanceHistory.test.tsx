import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AttendanceHistory from './AttendanceHistory';
import { attendanceService } from '../../services/attendanceService';
vi.mock('../../services/attendanceService', () => ({ attendanceService: { getHistory: vi.fn(), getTeamDaily: vi.fn(), getCorrections: vi.fn().mockResolvedValue([]), updateAttendance: vi.fn().mockResolvedValue({}) } }));
describe('attendance history', () => {
    it('loads only self for employees and keeps failures visible', async () => {
        vi.mocked(attendanceService.getHistory).mockRejectedValue(new Error('offline'));
        render(<AttendanceHistory teamId="team" admin={false} />);
        expect(await screen.findByRole('alert')).toHaveTextContent(/Không tải/);
        expect(attendanceService.getTeamDaily).not.toHaveBeenCalled();
    });
    it('sends Vietnam wall-clock correction without UTC conversion', async () => {
        vi.mocked(attendanceService.getTeamDaily).mockResolvedValue([{ id: 'att', userId: 'u', userName: 'Worker', teamId: 'team', date: '2026-10-25', checkInTime: '2026-10-25T08:00:00', checkInAddress: 'Xã Xuân Trường, Đà Lạt, Lâm Đồng', latitude: 11.8842, longitude: 108.5419, distanceMeters: 42, locationStatus: 'WITHIN_RADIUS' }]);
        render(<AttendanceHistory teamId="team" admin initialDate="2026-10-25" />);
        expect(await screen.findByText(/Vùng \/ địa chỉ: Xã Xuân Trường, Đà Lạt, Lâm Đồng/)).toBeInTheDocument();
        expect(screen.getByText(/Trong bán kính xưởng/)).toBeInTheDocument();
        expect(screen.getByText(/Cách xưởng 42 m/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sửa công' }));
        fireEvent.change(screen.getByLabelText('Giờ ra (Việt Nam)'), { target: { value: '2026-10-25T17:00' } });
        fireEvent.change(screen.getByLabelText('Lý do sửa công'), { target: { value: 'Quên tan ca' } });
        fireEvent.click(screen.getByRole('button', { name: 'Lưu sửa công' }));
        await waitFor(() => expect(attendanceService.updateAttendance).toHaveBeenCalledWith('att', { checkInTime: '2026-10-25T08:00', checkOutTime: '2026-10-25T17:00', reason: 'Quên tan ca' }));
    });
});

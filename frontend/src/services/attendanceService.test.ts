import { describe, expect, it, vi } from 'vitest';
import api from './api';
import { attendanceService } from './attendanceService';
vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
describe('attendance transport', () => {
    it('only treats HTTP 204 as missing attendance, not permission/network failures', async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ status: 204 });
        expect(await attendanceService.getTodayAttendance('team')).toBeNull();
        vi.mocked(api.get).mockRejectedValueOnce(new Error('forbidden'));
        await expect(attendanceService.getTodayAttendance('team')).rejects.toThrow('forbidden');
    });
});

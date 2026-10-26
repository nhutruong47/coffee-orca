import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PayrollPanel from './PayrollPanel';
import { payrollService } from '../../services/groupService';

vi.mock('../../services/groupService', () => ({
    payrollService: {
        getReport: vi.fn().mockResolvedValue({
            runId: 'run-1',
            teamId: 'team-1',
            year: 2026,
            month: 8,
            status: 'DRAFT',
            updatedAt: '2026-08-14T09:00:00',
            summary: {
                memberCount: 1,
                paidMemberCount: 1,
                attendanceDays: 5,
                regularHours: 7.5,
                overtimeHours: 2,
                totalHours: 9.5,
                grossPayVnd: 525000,
                allowanceVnd: 0,
                deductionVnd: 0,
                advanceVnd: 0,
                netPayVnd: 525000,
                totalTasks: 0,
                completedTasks: 0,
                missingCheckoutCount: 0,
            },
            items: [{
                itemId: 'item-1',
                memberId: '4a3e42fa-0000-0000-0000-000000000000',
                memberName: 'Trần Quốc Bảo',
                memberCode: 'NV-4A3E42',
                regularHours: 7.5,
                overtimeHours: 2,
                attendanceDays: 5,
                lateDays: 0,
                missingCheckoutDays: 0,
                totalTasks: 0,
                completedTasks: 0,
                hourlyRateVnd: 50000,
                overtimeMultiplier: 1.5,
                regularPayVnd: 375000,
                overtimePayVnd: 150000,
                allowanceVnd: 0,
                deductionVnd: 0,
                advanceVnd: 0,
                netPayVnd: 525000,
                    attendanceLines: [{
                        id: 'line-1',
                        date: '2026-08-14',
                        checkInTime: '2026-08-14T09:00:00',
                        checkOutTime: '2026-08-14T19:30:00',
                        regularHours: 7.5,
                        overtimeHours: 2,
                        workedHours: 9.5,
                        hourlyRateVnd: 50000,
                        overtimeMultiplier: 1.5,
                        regularPayVnd: 375000,
                        overtimePayVnd: 150000,
                        totalPayVnd: 525000,
                        payable: true,
                    }],
                }],
        }),
        exportExcel: vi.fn(),
        updateMemberRate: vi.fn(),
    },
}));

describe('PayrollPanel', () => {
    it('supports month selection, mobile card expansion, and reloads the report after saving a member rate', async () => {
        vi.mocked(payrollService.updateMemberRate).mockResolvedValue({ teamId: 'team-1', memberId: '4a3e42fa-0000-0000-0000-000000000000', hourlyRateVnd: 60000 });
        render(<PayrollPanel teamId="team-1" defaultOpen />);
        await screen.findAllByText('Trần Quốc Bảo');
        fireEvent.change(screen.getByLabelText('Tháng cần xem'), { target: { value: '2026-08' } });
        await waitFor(() => expect(payrollService.getReport).toHaveBeenCalledWith('team-1', '2026-08'));
        expect(screen.getByLabelText('Bảng lương dạng thẻ')).toBeInTheDocument();
        fireEvent.click(await screen.findByRole('button', { name: 'Trần Quốc Bảo' }));
        const callsBeforeSave = vi.mocked(payrollService.getReport).mock.calls.length;
        fireEvent.change(screen.getAllByLabelText('Đơn giá cho ca mới (đ/giờ)')[0], { target: { value: '60000' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Lưu đơn giá' })[0]);
        await waitFor(() => expect(payrollService.updateMemberRate).toHaveBeenCalledWith('team-1', '4a3e42fa-0000-0000-0000-000000000000', { hourlyRateVnd: 60000 }));
        await waitFor(() => expect(vi.mocked(payrollService.getReport).mock.calls.length).toBeGreaterThan(callsBeforeSave));
    });
    it('never claims GPS or photo verification without recorded evidence', async () => {
        render(<PayrollPanel teamId="team-1" defaultOpen />);
        await screen.findAllByText('Trần Quốc Bảo');
        expect(screen.queryByRole('button', { name: /Điểm danh nhanh cả xưởng/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/100% Xác thực/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Quốc lộ 20/)).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: /Trần Quốc Bảo/ })[0]);
        expect(screen.getAllByText(/Chưa xác minh vị trí/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Không có ảnh/).length).toBeGreaterThan(0);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('keeps API errors visible rather than rendering a zero payroll', async () => {
        vi.mocked(payrollService.getReport).mockRejectedValueOnce(new Error('offline'));
        render(<PayrollPanel teamId="team-error" defaultOpen />);
        expect(await screen.findByRole('alert')).toHaveTextContent(/Không tải/);
        expect(screen.getByRole('button', { name: /Thử lại/ })).toBeInTheDocument();
    });
    it('shows attendance-based payroll without task or adjustment metrics', async () => {
        render(<PayrollPanel teamId="team-1" />);

        fireEvent.click(screen.getByRole('button', { name: /Xem bảng/i }));

        await waitFor(() => expect(screen.getAllByText('Trần Quốc Bảo').length).toBeGreaterThan(0));
        expect(screen.getAllByText('5 ngày · 9,5 giờ').length).toBeGreaterThan(0);
        expect(screen.getAllByText('375.000 đ').length).toBeGreaterThan(0);
        expect(screen.getAllByText('150.000 đ').length).toBeGreaterThan(0);
        expect(screen.queryByText(/Tổng task/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Phụ cấp/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Khấu trừ/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getAllByRole('button', { name: /Trần Quốc Bảo/i })[0]);
        expect(screen.getAllByText('Cách tính thực nhận').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Chấm công từng ngày').length).toBeGreaterThan(0);
    });

    it('renders former members and unknown historical wage snapshots without fabricating rates or showing future-rate editor', async () => {
        vi.mocked(payrollService.getReport).mockResolvedValueOnce({
            runId: 'run-history',
            teamId: 'team-1',
            year: 2026,
            month: 7,
            status: 'DRAFT',
            updatedAt: '2026-07-31',
            summary: {
                memberCount: 1,
                paidMemberCount: 0,
                attendanceDays: 0,
                regularHours: 0,
                overtimeHours: 0,
                totalHours: 0,
                grossPayVnd: 0,
                allowanceVnd: 0,
                deductionVnd: 0,
                advanceVnd: 0,
                netPayVnd: 0,
                totalTasks: 0,
                completedTasks: 0,
                missingCheckoutCount: 0,
                needsReviewCount: 1,
            },
            items: [{
                itemId: 'historical:former-1',
                memberId: 'former-1',
                memberName: 'Lê Hoàng Cựu',
                memberCode: 'lehoangcuu',
                roleLabel: 'Đã rời xưởng',
                currentMember: false,
                regularHours: 0,
                overtimeHours: 0,
                attendanceDays: 0,
                lateDays: 0,
                missingCheckoutDays: 0,
                needsReviewCount: 1,
                totalTasks: 0,
                completedTasks: 0,
                hourlyRateVnd: 50000,
                historicalHourlyRateVnd: null,
                historicalRateLabel: 'Chưa rõ',
                overtimeMultiplier: 1.5,
                regularPayVnd: 0,
                overtimePayVnd: 0,
                allowanceVnd: 0,
                deductionVnd: 0,
                advanceVnd: 0,
                netPayVnd: 0,
                attendanceLines: [{
                    id: 'line-legacy-1',
                    date: '2026-07-10',
                    checkInTime: '2026-07-10T08:00:00',
                    checkOutTime: '2026-07-10T17:00:00',
                    regularHours: 0,
                    overtimeHours: 0,
                    workedHours: 0,
                    hourlyRateVnd: null,
                    overtimeMultiplier: null,
                    regularPayVnd: 0,
                    overtimePayVnd: 0,
                    totalPayVnd: 0,
                    payable: false,
                    snapshotStatus: 'UNKNOWN',
                    needsReview: true,
                    warning: 'Thiếu hoặc sai định mức lương lịch sử; cần rà soát và không tự gán mức lương mặc định.',
                }],
            }],
        });

        render(<PayrollPanel teamId="team-1" defaultOpen />);
        await screen.findAllByText(/Lê Hoàng Cựu/);
        expect(screen.getByText(/1 ca thiếu định mức lương lịch sử — cần rà soát/)).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: /Lê Hoàng Cựu/ })[0]);
        expect(screen.queryByLabelText('Đơn giá cho ca mới (đ/giờ)')).not.toBeInTheDocument();
        expect(screen.getAllByText(/Thiếu hoặc sai định mức lương lịch sử/).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Chưa tan ca — chưa tính lương/)).not.toBeInTheDocument();
    });
});

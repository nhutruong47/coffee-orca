import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PayrollPanel from './PayrollPanel';

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
    },
}));

describe('PayrollPanel', () => {
    it('shows attendance-based payroll without task or adjustment metrics', async () => {
        render(<PayrollPanel teamId="team-1" />);

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
});

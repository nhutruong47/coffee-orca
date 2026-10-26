import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkforcePage from './WorkforcePage';
import { teamService } from '../services/groupService';
vi.mock('../services/groupService', () => ({ teamService: { getDetail: vi.fn() }, productionService: { getWorkforce: vi.fn().mockResolvedValue({}) } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: 'MEMBER' } }) }));
vi.mock('../components/attendance/CheckInPanel', () => ({ default: () => <div>Personal check in</div> }));
vi.mock('../components/attendance/AttendanceHistory', () => ({ default: () => <div>History</div> }));
vi.mock('../components/attendance/AttendanceSettings', () => ({ default: () => <div>Settings form</div> }));
vi.mock('../components/payroll/PayrollPanel', () => ({ default: ({ defaultOpen }: { defaultOpen: boolean }) => <div>Payroll {String(defaultOpen)}</div> }));
function mount() { return render(<MemoryRouter initialEntries={['/groups/team/workforce']}><Routes><Route path="/groups/:id/workforce" element={<WorkforcePage />} /></Routes></MemoryRouter>); }
describe('workforce permissions', () => {
    beforeEach(() => { vi.mocked(teamService.getDetail).mockResolvedValue({ id: 'team', name: 'Xưởng', ownerId: 'owner', ownerName: '', description: '', memberCount: 1, createdAt: '', members: [{ userId: 'me', username: 'me', fullName: 'Me', groupRole: 'MEMBER', joinedAt: '' }] }); });
    it('only exposes personal attendance to members', async () => {
        mount();
        expect(await screen.findByText('Personal check in')).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Bảng lương' })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Cài đặt' })).not.toBeInTheDocument();
    });
    it('opens a dedicated payroll tab for the owner', async () => {
        const team = await teamService.getDetail('team'); vi.mocked(teamService.getDetail).mockResolvedValue({ ...team, ownerId: 'me' });
        mount(); fireEvent.click(await screen.findByRole('tab', { name: 'Bảng lương' }));
        expect(screen.getByText('Payroll true')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Cài đặt' }));
        expect(screen.getByText('Settings form')).toBeInTheDocument();
    });
});

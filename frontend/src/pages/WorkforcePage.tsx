import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { teamService } from '../services/groupService';
import type { Team } from '../types/types';
import CheckInPanel from '../components/attendance/CheckInPanel';
import AttendanceHistory from '../components/attendance/AttendanceHistory';
import AttendanceSettings from '../components/attendance/AttendanceSettings';
import PayrollPanel from '../components/payroll/PayrollPanel';
import { apiError } from '../utils/attendance';
import './WorkforcePage.css';
export default function WorkforcePage() {
    const { id = '' } = useParams<{ id: string }>();
    const { user } = useAuth();
    const [params, setParams] = useSearchParams();
    const [team, setTeam] = useState<Team | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [historyRevision, setHistoryRevision] = useState(0);
    useEffect(() => {
        let active = true; setTeam(null); setError('');
        teamService.getDetail(id).then(data => { if (active) setTeam(data); }).catch(err => { if (active) setError(apiError(err, 'Không tải được thông tin xưởng.')); });
        return () => { active = false; };
    }, [id, revision]);
    const member = team?.members?.find(m => m.userId === user?.id);
    const admin = Boolean(team && user && (team.ownerId === user.id || member?.groupRole === 'ADMIN' || member?.groupRole === 'OWNER' || user.role === 'ADMIN'));
    const requested = params.get('tab');
    const tab = admin && (requested === 'payroll' || requested === 'settings') ? requested : 'attendance';
    const tabs = [{ id: 'attendance', label: 'Chấm công' }, ...(admin ? [{ id: 'payroll', label: 'Bảng lương' }, { id: 'settings', label: 'Cài đặt' }] : [])];
    return <main className="workforce"><header><Link to={`/groups/${id}`}>← Về xưởng</Link><h1>Chấm công &amp; lương</h1><p>{team?.name}</p></header>
        {error ? <div role="alert">{error} <button onClick={() => setRevision(x => x + 1)}>Thử lại</button></div> : !team ? <p role="status">Đang tải xưởng…</p> : !member && !admin ? <p role="alert">Bạn không có quyền xem chấm công xưởng này.</p> : <>
            <div className="workforce__tabs" role="tablist" aria-label="Quản lý nhân sự">{tabs.map(t => <button type="button" key={t.id} role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} aria-selected={tab === t.id} onClick={() => setParams({ tab: t.id })}>{t.label}</button>)}</div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'attendance' && <>{member && <CheckInPanel key={id} teamId={id} onChanged={() => setHistoryRevision(x => x + 1)} />}<AttendanceHistory key={`${id}-${historyRevision}`} teamId={id} admin={admin} initialDate={params.get('date') || undefined} /></>}
                {tab === 'payroll' && admin && <PayrollPanel key={id} teamId={id} defaultOpen onEditAttendance={(_memberId, date) => setParams({ tab: 'attendance', ...(date ? { date } : {}) })} />}
                {tab === 'settings' && admin && <AttendanceSettings key={id} teamId={id} />}
            </div>
        </>}
    </main>;
}

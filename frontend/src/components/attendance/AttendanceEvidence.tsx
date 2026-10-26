import { useEffect, useRef, useState } from 'react';
import { attendanceService, type EvidenceFields } from '../../services/attendanceService';
import { apiError, locationLabel } from '../../utils/attendance';
interface Props { attendance: EvidenceFields; checkout?: boolean }
export default function AttendanceEvidence({ attendance, checkout = false }: Props) {
    const [photo, setPhoto] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const photoUrl = useRef('');
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; if (photoUrl.current) URL.revokeObjectURL(photoUrl.current); };
    }, []);
    const showPhoto = async () => {
        setLoading(true); setError('');
        try {
            const blob = await attendanceService.getPhoto(attendance.id, checkout ? 'check-out' : 'check-in');
            if (!mounted.current) return;
            if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
            photoUrl.current = URL.createObjectURL(blob); setPhoto(photoUrl.current);
        } catch (err) { if (mounted.current) setError(apiError(err, 'Không tải được ảnh.')); }
        finally { if (mounted.current) setLoading(false); }
    };
    const status = checkout ? attendance.checkOutLocationStatus : attendance.locationStatus;
    const lat = checkout ? attendance.checkOutLatitude : attendance.latitude;
    const lng = checkout ? attendance.checkOutLongitude : attendance.longitude;
    const address = checkout ? attendance.checkOutAddress : attendance.checkInAddress;
    const accuracy = checkout ? attendance.checkOutLocationAccuracyMeters : attendance.locationAccuracyMeters;
    const distance = checkout ? attendance.checkOutDistanceMeters : attendance.distanceMeters;
    const hasPhoto = checkout ? attendance.hasCheckOutPhoto : attendance.hasCheckInPhoto;
    const reason = checkout ? null : attendance.locationUnavailableReason;
    return <div className="attendance-evidence"><p>{locationLabel(status)}{reason && !lat && ` · ${reason}`}</p>
        <p>{address ? `Vùng / địa chỉ: ${address}` : lat != null && lng != null ? `Tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)} (chưa có tên vùng)` : 'Chưa ghi vùng / địa chỉ'}</p>
        {lat != null && lng != null && <p>GPS: {lat.toFixed(6)}, {lng.toFixed(6)}{accuracy != null && ` · Sai số ±${Math.round(accuracy)} m`}{distance != null && ` · Cách xưởng ${Math.round(distance)} m`}</p>}
        {hasPhoto ? <button type="button" disabled={loading} onClick={() => void showPhoto()}>{loading ? 'Đang tải ảnh…' : `Xem ảnh ${checkout ? 'tan ca' : 'vào ca'}`}</button> : <p>Không có ảnh — chưa có bằng chứng ảnh</p>}
        {error && <p role="alert">{error}</p>}
        {photo && <div><img src={photo} alt={`Ảnh ${checkout ? 'tan ca' : 'vào ca'} đã lưu`} style={{ maxWidth: '100%', maxHeight: 260 }} /><button type="button" onClick={() => { URL.revokeObjectURL(photoUrl.current); photoUrl.current = ''; setPhoto(''); }}>Đóng ảnh</button></div>}
    </div>;
}

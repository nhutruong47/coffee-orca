import React, { useEffect, useState } from 'react';
import api from '../services/api';

interface VerificationRequestDTO {
    id: string;
    teamId: string;
    teamName: string;
    requestedBy: string;
    documentUrl: string;
    status: string;
    adminNote?: string;
    createdAt: string;
}

const AdminVerificationPage: React.FC = () => {
    const [requests, setRequests] = useState<VerificationRequestDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadPendingRequests();
    }, []);

    const loadPendingRequests = async () => {
        setLoading(true);
        try {
            const res = await api.get('/verification/admin/pending');
            setRequests(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch pending requests');
        } finally {
            setLoading(false);
        }
    };

    const handleDecision = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
        let adminNote = '';
        if (decision === 'REJECTED') {
            const reason = window.prompt('Nhập lý do từ chối:');
            if (reason === null) return;
            adminNote = reason;
        }

        try {
            await api.post(`/verification/admin/${id}/review`, {
                status: decision,
                adminNote
            });
            setRequests(current => current.filter(req => req.id !== id));
            alert('Đã xử lý yêu cầu xác minh.');
        } catch (err: any) {
            alert('Lỗi: ' + (err.response?.data?.error || 'Không thể xử lý'));
        }
    };

    return (
        <div className="container" style={{ padding: '20px' }}>
            <h1>Admin - Duyệt hồ sơ Xưởng</h1>
            {error && <div className="alert alert-danger">{error}</div>}
            
            {loading ? (
                <p>Đang tải...</p>
            ) : requests.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: 50, color: 'var(--text-secondary)' }}>
                    <ion-icon name="checkmark-done-circle-outline" style={{ fontSize: 48 }}></ion-icon>
                    <p>Không có hồ sơ nào chờ duyệt.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                    {requests.map(req => (
                        <div key={req.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: '0 0 5px' }}>Xưởng: {req.teamName}</h3>
                                <p style={{ margin: '0 0 5px', fontSize: 13, color: 'var(--text-secondary)' }}>Người yêu cầu: {req.requestedBy} | Ngày gửi: {new Date(req.createdAt).toLocaleString('vi-VN')}</p>
                                <a href={req.documentUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)' }}>
                                    <ion-icon name="document-text-outline" style={{ marginRight: 5 }}></ion-icon>
                                    Xem tài liệu đính kèm
                                </a>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn btn-primary" onClick={() => handleDecision(req.id, 'APPROVED')}>
                                    <ion-icon name="checkmark-outline" style={{ marginRight: 5 }}></ion-icon> Duyệt
                                </button>
                                <button className="btn btn-danger" onClick={() => handleDecision(req.id, 'REJECTED')}>
                                    <ion-icon name="close-outline" style={{ marginRight: 5 }}></ion-icon> Từ chối
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminVerificationPage;

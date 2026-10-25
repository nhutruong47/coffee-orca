import React, { useState } from 'react';
import { fileService } from '../services/fileService';
import { teamService } from '../services/groupService';
interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    teamId: string;
}

const VerificationModal: React.FC<VerificationModalProps> = ({ isOpen, onClose, teamId }) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            alert('Vui lòng chọn một file.');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const fileUrl = await fileService.uploadFile(formData);
            
            await teamService.submitVerification(teamId, {
                certificationDocument: fileUrl
            } as any);
            
            alert('Yêu cầu xác minh đã được gửi thành công. Vui lòng chờ quản trị viên duyệt.');
            onClose();
        } catch (error: any) {
            console.error('Error submitting verification:', error);
            alert(error.response?.data?.error || 'Lỗi khi gửi yêu cầu xác minh');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ width: '500px', maxWidth: '90%' }}>
                <div className="modal-header">
                    <h2>Nộp giấy phép xác minh</h2>
                    <span className="close" onClick={onClose}>&times;</span>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group" style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px' }}>Giấy phép kinh doanh (PDF/PNG/JPG)</label>
                            <input 
                                type="file" 
                                accept="application/pdf, image/png, image/jpeg"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                required
                            />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginRight: '10px' }}>
                                Hủy
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={loading || !file}>
                                {loading ? 'Đang gửi...' : 'Gửi yêu cầu'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default VerificationModal;

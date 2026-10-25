import React, { useState, useEffect } from 'react';
import api from '../services/api';

interface FactoryConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    teamId: string;
}

const FactoryConfigModal: React.FC<FactoryConfigModalProps> = ({ isOpen, onClose, teamId }) => {
    const [specialty, setSpecialty] = useState('');
    const [capacity, setCapacity] = useState('');
    const [capacityValue, setCapacityValue] = useState<number | ''>('');
    const [capacityUnit, setCapacityUnit] = useState('sản phẩm/tháng');
    const [moq, setMoq] = useState('');
    const [leadTime, setLeadTime] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        if (isOpen && teamId) {
            fetchTeamInfo();
        }
    }, [isOpen, teamId]);

    const fetchTeamInfo = async () => {
        setFetching(true);
        try {
            const response = await api.get(`/api/teams/${teamId}`);
            const data = response.data;
            setSpecialty(data.specialty || '');
            setCapacity(data.capacity || '');
            setCapacityValue(data.capacityValue || '');
            setCapacityUnit(data.capacityUnit || 'sản phẩm/tháng');
            setMoq(data.moq || '');
            setLeadTime(data.leadTime || '');
        } catch (error) {
            console.error('Error fetching team config:', error);
        } finally {
            setFetching(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.put(`/api/teams/${teamId}`, {
                specialty,
                capacity,
                capacityValue: capacityValue === '' ? null : Number(capacityValue),
                capacityUnit,
                moq,
                leadTime
            });
            alert('Cập nhật cấu hình xưởng thành công');
            onClose();
        } catch (error: any) {
            console.error('Error updating factory config:', error);
            alert(error.response?.data?.error || 'Lỗi khi cập nhật cấu hình');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ width: '600px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header">
                    <h2>Cấu hình Xưởng / Năng lực</h2>
                    <span className="close" onClick={onClose}>&times;</span>
                </div>
                <div className="modal-body">
                    {fetching ? (
                        <p>Đang tải dữ liệu...</p>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px' }}>Chuyên môn (VD: Gia công quần áo, Đồ gỗ)</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={specialty}
                                    onChange={(e) => setSpecialty(e.target.value)}
                                    placeholder="Gia công áo thun cotton..."
                                />
                            </div>
                            
                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px' }}>Mô tả năng lực (Text)</label>
                                <textarea 
                                    className="form-control"
                                    value={capacity}
                                    onChange={(e) => setCapacity(e.target.value)}
                                    placeholder="5 xưởng vệ tinh, dây chuyền may hiện đại..."
                                    rows={3}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Năng lực sản xuất (Số)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={capacityValue}
                                        onChange={(e) => setCapacityValue(e.target.value ? Number(e.target.value) : '')}
                                        placeholder="50000"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Đơn vị tính</label>
                                    <select 
                                        className="form-control"
                                        value={capacityUnit}
                                        onChange={(e) => setCapacityUnit(e.target.value)}
                                    >
                                        <option value="sản phẩm/tháng">sản phẩm/tháng</option>
                                        <option value="tấn/tháng">tấn/tháng</option>
                                        <option value="đơn hàng/tháng">đơn hàng/tháng</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '5px' }}>MOQ (Số lượng tối thiểu)</label>
                                    <input 
                                        type="text" 
                                        className="form-control"
                                        value={moq}
                                        onChange={(e) => setMoq(e.target.value)}
                                        placeholder="VD: 100 cái"
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '5px' }}>Lead Time (Thời gian giao)</label>
                                    <input 
                                        type="text" 
                                        className="form-control"
                                        value={leadTime}
                                        onChange={(e) => setLeadTime(e.target.value)}
                                        placeholder="VD: 7-14 ngày"
                                    />
                                </div>
                            </div>

                            <div style={{ textAlign: 'right', marginTop: '20px' }}>
                                <button type="button" className="btn btn-secondary" onClick={onClose} style={{ marginRight: '10px' }}>
                                    Hủy
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Đang lưu...' : 'Lưu cấu hình'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FactoryConfigModal;

import React, { useState, useEffect } from 'react';
import { orderContractService, type OrderContract } from '../services/orderContractService';
import { fileService } from '../services/fileService';

interface ContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: string;
}

const ContractModal: React.FC<ContractModalProps> = ({ isOpen, onClose, orderId }) => {
    const [contract, setContract] = useState<OrderContract | null>(null);
    const [loading, setLoading] = useState(false);
    const [signatureFile, setSignatureFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (isOpen && orderId) {
            fetchOrCreateContract();
        }
    }, [isOpen, orderId]);

    const fetchOrCreateContract = async () => {
        setLoading(true);
        try {
            try {
                const existing = await orderContractService.getContractByOrder(orderId);
                setContract(existing);
            } catch (err: any) {
                if (err.response?.status === 500 || err.response?.status === 400 || err.response?.status === 404) {
                    const created = await orderContractService.createContract(orderId);
                    setContract(created);
                }
            }
        } catch (error) {
            console.error('Error fetching/creating contract:', error);
            alert('Lỗi khi lấy thông tin hợp đồng');
        } finally {
            setLoading(false);
        }
    };

    const handleSign = async () => {
        if (!signatureFile || !contract) {
            alert('Vui lòng chọn ảnh chữ ký!');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', signatureFile);
            
            const fileUrl = await fileService.uploadFile(formData);
            
            const updated = await orderContractService.signContract(contract.id, fileUrl);
            setContract(updated);
            alert('Ký hợp đồng thành công!');
        } catch (error: any) {
            console.error('Error signing contract:', error);
            alert(error.response?.data?.message || 'Lỗi khi ký hợp đồng');
        } finally {
            setUploading(false);
        }
    };

    const handlePrint = () => {
        const printContent = document.getElementById('contract-content');
        const windowPrint = window.open('', '', 'left=0,top=0,width=800,height=900,toolbar=0,scrollbars=0,status=0');
        if (windowPrint && printContent) {
            windowPrint.document.write('<html><head><title>Hợp đồng mua bán</title>');
            windowPrint.document.write('<style>body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; } .signature-box { display: flex; justify-content: space-between; margin-top: 50px; } .sig-img { max-height: 100px; max-width: 200px; }</style>');
            windowPrint.document.write('</head><body>');
            windowPrint.document.write(printContent.innerHTML);
            windowPrint.document.write('</body></html>');
            windowPrint.document.close();
            windowPrint.focus();
            setTimeout(() => {
                windowPrint.print();
                windowPrint.close();
            }, 500);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal-content" style={{ width: '800px', maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
                <div className="modal-header">
                    <h2>Hợp đồng điện tử</h2>
                    <span className="close" onClick={onClose}>&times;</span>
                </div>
                <div className="modal-body">
                    {loading ? (
                        <p>Đang tải hợp đồng...</p>
                    ) : contract ? (
                        <>
                            <div id="contract-content" style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '4px', marginBottom: '20px', backgroundColor: '#fff', color: '#000' }}>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{contract.terms}</div>
                                
                                <div className="signature-box" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px' }}>
                                    <div style={{ textAlign: 'center', width: '45%' }}>
                                        <strong>Đại diện Bên Bán</strong><br/><br/>
                                        {contract.sellerSignatureUrl ? (
                                            <img src={contract.sellerSignatureUrl} alt="Seller Signature" className="sig-img" style={{ maxHeight: '100px', maxWidth: '200px' }} />
                                        ) : (
                                            <span style={{ color: '#888', fontStyle: 'italic' }}>Chưa ký</span>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'center', width: '45%' }}>
                                        <strong>Đại diện Bên Mua</strong><br/><br/>
                                        {contract.buyerSignatureUrl ? (
                                            <img src={contract.buyerSignatureUrl} alt="Buyer Signature" className="sig-img" style={{ maxHeight: '100px', maxWidth: '200px' }} />
                                        ) : (
                                            <span style={{ color: '#888', fontStyle: 'italic' }}>Chưa ký</span>
                                        )}
                                    </div>
                                </div>
                                {contract.status === 'SIGNED' && (
                                    <div style={{ marginTop: '30px', textAlign: 'center', color: 'green', fontWeight: 'bold' }}>
                                        Hợp đồng đã được ký kết hợp lệ vào lúc {new Date(contract.signedAt!).toLocaleString()}
                                    </div>
                                )}
                            </div>

                            {contract.status !== 'SIGNED' && (
                                <div className="form-group" style={{ marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>Thêm chữ ký của bạn (Tải ảnh lên)</label>
                                    <input 
                                        type="file" 
                                        accept="image/png, image/jpeg"
                                        onChange={(e) => setSignatureFile(e.target.files?.[0] || null)}
                                        disabled={uploading}
                                        style={{ display: 'block', marginBottom: '10px' }}
                                    />
                                    <button 
                                        className="btn btn-primary" 
                                        onClick={handleSign}
                                        disabled={uploading || !signatureFile}
                                    >
                                        {uploading ? 'Đang tải chữ ký...' : 'Ký hợp đồng'}
                                    </button>
                                </div>
                            )}

                            <div style={{ textAlign: 'right' }}>
                                <button className="btn btn-secondary" onClick={handlePrint} style={{ marginRight: '10px' }}>
                                    <ion-icon name="print-outline" style={{ verticalAlign: 'middle', marginRight: '5px' }}></ion-icon> In / Xuất PDF
                                </button>
                                <button className="btn btn-danger" onClick={onClose}>Đóng</button>
                            </div>
                        </>
                    ) : (
                        <p>Không tìm thấy thông tin hợp đồng.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContractModal;

import React, { useState } from 'react';
import { uploadFile } from '../services/fileService';

interface BuyerConfirmDeliveryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (payload: { deliveryStatus: 'ON_TIME' | 'LATE' | 'NOT_DELIVERED'; rating: number; comment: string; proofImageUrls?: string[] }) => Promise<void>;
}

export default function BuyerConfirmDeliveryModal({ isOpen, onClose, onSubmit }: BuyerConfirmDeliveryModalProps) {
    const [deliveryStatus, setDeliveryStatus] = useState('ON_TIME');
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const resetForm = () => {
        setDeliveryStatus('ON_TIME');
        setRating(0);
        setComment('');
        setFiles([]);
        setError('');
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (deliveryStatus !== 'NOT_DELIVERED' && rating < 1) {
            setError('Vui lòng chọn đánh giá từ 1 đến 5 sao.');
            return;
        }

        setLoading(true);
        setUploading(true);

        try {
            const uploadedUrls: string[] = [];
            for (const file of files) {
                const url = await uploadFile(file);
                uploadedUrls.push(url);
            }
            setUploading(false);

            await onSubmit({ deliveryStatus: deliveryStatus as 'ON_TIME' | 'LATE' | 'NOT_DELIVERED', rating, comment, proofImageUrls: uploadedUrls });
            resetForm();
            onClose();
        } catch (err: any) {
            setUploading(false);
            setError(err.response?.data?.error || err.message || 'Lỗi xác nhận');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                <h2 className="text-xl font-bold mb-4">Xác Nhận Nhận Hàng</h2>
                {error && <div className="mb-4 text-red-600 bg-red-50 p-3 rounded">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái nhận hàng</label>
                        <select
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
                            value={deliveryStatus}
                            onChange={e => {
                                setDeliveryStatus(e.target.value);
                                if (e.target.value === 'NOT_DELIVERED') setRating(0);
                            }}
                        >
                            <option value="ON_TIME">Đúng hạn</option>
                            <option value="LATE">Trễ hạn</option>
                            <option value="NOT_DELIVERED">Không nhận được hàng</option>
                        </select>
                    </div>

                    {deliveryStatus !== 'NOT_DELIVERED' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Đánh giá (1-5 sao) <span className="text-red-500">*</span>
                                </label>
                                <div className="flex space-x-2" role="radiogroup" aria-label="Đánh giá">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                            key={star}
                                            type="button"
                                            role="radio"
                                            aria-checked={rating === star}
                                            aria-label={`${star} sao`}
                                            onClick={() => setRating(star)}
                                            className={`text-2xl transition-colors ${
                                                rating >= star ? 'text-yellow-400' : 'text-gray-300'
                                            } hover:text-yellow-300`}
                                        >
                                            ★
                                        </button>
                                    ))}
                                </div>
                                {rating === 0 && (
                                    <p className="text-xs text-gray-500 mt-1">Bấm để chọn số sao</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nhận xét</label>
                                <textarea
                                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
                                    rows={3}
                                    value={comment}
                                    onChange={e => setComment(e.target.value)}
                                    placeholder="Đánh giá về chất lượng..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Hình ảnh đính kèm (nếu có)</label>
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                                {files.length > 0 && (
                                    <p className="text-xs text-gray-500 mt-1">Đã chọn {files.length} file</p>
                                )}
                            </div>
                        </>
                    )}

                    {deliveryStatus === 'NOT_DELIVERED' && (
                        <div className="p-3 bg-yellow-50 text-yellow-800 text-sm rounded">
                            Lưu ý: Bạn sẽ cần mở Khiếu nại (Dispute) nếu không nhận được hàng.
                        </div>
                    )}

                    <div className="pt-2 flex justify-end space-x-3">
                        <button type="button" onClick={onClose} disabled={loading}
                            className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">
                            Hủy
                        </button>
                        <button type="submit" disabled={loading}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center">
                            {uploading ? 'Đang tải ảnh...' : (loading ? 'Đang xử lý...' : 'Xác nhận')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
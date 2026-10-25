import { useState } from 'react';

interface CustomerInventoryItem {
    id: string;
    customerName: string;
    material: string;
    stock: number;
    unit: string;
}

export default function CustomerInventoryPage() {
    const [items] = useState<CustomerInventoryItem[]>([]);

    return (
        <div className="dashboard-page">
            <header className="page-header">
                <div className="page-title-wrap">
                    <ion-icon name="archive-outline" className="page-icon"></ion-icon>
                    <h1 className="page-title">Nguyên liệu khách gửi</h1>
                </div>
            </header>
            <div className="page-content">
                <div className="inventory-card">
                    <header className="inventory-card-header">
                        <h3>Quản lý nguyên liệu do khách hàng cung cấp</h3>
                        <p className="inventory-card-subtitle">
                            Theo dõi tồn kho riêng biệt theo từng khách hàng để phục vụ các đơn hàng gia công hoặc rang xay.
                        </p>
                    </header>

                    {items.length === 0 ? (
                        <div className="inventory-empty-state">
                            <div className="inventory-empty-illustration">
                                <ion-icon name="archive-outline"></ion-icon>
                            </div>
                            <h4 className="inventory-empty-title">
                                Chưa có nguyên liệu khách gửi
                            </h4>
                            <p className="inventory-empty-hint">
                                Khi khách hàng gửi nguyên liệu vào kho, bạn sẽ ghi nhận ở đây để theo dõi tồn kho riêng theo từng khách.
                            </p>
                            <div className="inventory-empty-actions">
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {/* route to customer-material intake */ }}
                                >
                                    <ion-icon name="add-circle-outline" style={{ marginRight: 6 }}></ion-icon>
                                    Tiếp nhận nguyên liệu
                                </button>
                            </div>
                        </div>
                    ) : (
                        <table className="data-table" style={{ marginTop: 20 }}>
                            <thead>
                                <tr>
                                    <th>Khách hàng</th>
                                    <th>Nguyên liệu</th>
                                    <th>Tồn kho</th>
                                    <th>Đơn vị</th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it) => (
                                    <tr key={it.id}>
                                        <td>{it.customerName}</td>
                                        <td>{it.material}</td>
                                        <td>{it.stock}</td>
                                        <td>{it.unit}</td>
                                        <td><button className="btn btn-sm btn-outline">Cập nhật</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
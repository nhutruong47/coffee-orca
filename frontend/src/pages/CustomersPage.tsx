export default function CustomersPage() {
    // Placeholder
    return (
        <div className="dashboard-page">
            <header className="page-header">
                <div className="page-title-wrap">
                    <ion-icon name="business-outline" className="page-icon"></ion-icon>
                    <h1 className="page-title">Quản lý Khách hàng</h1>
                </div>
            </header>
            <div className="page-content">
                <div style={{ background: '#fff', padding: 24, borderRadius: 16 }}>
                    <h3>Danh sách khách hàng</h3>
                    <p style={{ color: '#64748b' }}>Quản lý thông tin khách hàng và theo dõi công nợ, nguyên liệu gửi tại xưởng.</p>
                    <table className="data-table" style={{ marginTop: 20 }}>
                        <thead>
                            <tr>
                                <th>Khách hàng</th>
                                <th>Số điện thoại</th>
                                <th>Tổng đơn hàng</th>
                                <th>Nguyên liệu đang gửi</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Công ty A</td>
                                <td>0901234567</td>
                                <td>12 đơn</td>
                                <td>3000 kg</td>
                                <td><button className="btn btn-sm btn-outline">Xem chi tiết</button></td>
                            </tr>
                            <tr>
                                <td>Công ty B</td>
                                <td>0987654321</td>
                                <td>5 đơn</td>
                                <td>5000 kg</td>
                                <td><button className="btn btn-sm btn-outline">Xem chi tiết</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

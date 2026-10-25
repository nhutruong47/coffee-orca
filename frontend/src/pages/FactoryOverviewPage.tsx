import { useEffect, useState, useMemo } from 'react';
import { teamService } from '../services/groupService';
import { interGroupOrderService } from '../services/interGroupOrderService';
import type { Team, InterGroupOrder } from '../types/types';
import { useAuth } from '../context/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from 'recharts';

interface FactoryStats {
    totalOrders: number;
    pendingOrders: number;
    inProgressOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    disputedOrders: number;
    totalRevenue: number;
    averageRating: number | null;
    reviewCount: number;
    monthlyData: { month: string; revenue: number; orders: number }[];
    topProducts: { name: string; orders: number }[];
}

const STATUS_COLORS: Record<string, string> = {
    RFQ_CREATED: '#94a3b8',
    QUOTED: '#3b82f6',
    CONFIRMED: '#8b5cf6',
    IN_PRODUCTION: '#f59e0b',
    QC: '#f97316',
    COMPLETED: '#10b981',
    SHIPPING: '#06b6d4',
    DELIVERED: '#22c55e',
    REVIEWED: '#16a34a',
    CANCELED: '#ef4444',
    REJECTED: '#dc2626',
    DISPUTED: '#f43f5e',
    RESOLVED: '#84cc16',
    REFUNDED: '#a3a3a3',
};

const monthLabels = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

export default function FactoryOverviewPage() {
    const { user } = useAuth();
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [inboundOrders, setInboundOrders] = useState<InterGroupOrder[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        teamService.getMyTeams()
            .then((list) => {
                const owned = list.filter((t) => t.ownerId === user.id);
                setTeams(owned);
                if (owned.length > 0) setSelectedTeamId(owned[0].id);
            })
            .catch(() => setTeams([]))
            .finally(() => setLoading(false));
    }, [user]);

    useEffect(() => {
        if (!selectedTeamId) return;
        interGroupOrderService.getInboundOrders(selectedTeamId)
            .then(setInboundOrders)
            .catch(() => setInboundOrders([]));
    }, [selectedTeamId]);

    const stats: FactoryStats | null = useMemo(() => {
        if (!selectedTeamId) return null;
        const statusCounts: Record<string, number> = {};
        let totalRevenue = 0;
        let revenueByMonth: Record<number, number> = {};
        let ordersByMonth: Record<number, number> = {};
        let productCounts: Record<string, number> = {};

        for (const o of inboundOrders) {
            const s = o.status || 'RFQ_CREATED';
            statusCounts[s] = (statusCounts[s] ?? 0) + 1;

            if (o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'REVIEWED') {
                const qty = Number(o.quantity ?? 1);
                const price = 0; // InterGroupOrder DTO không expose giá — bỏ qua phần revenue
                if (price > 0) {
                    totalRevenue += price * qty;
                    const created = new Date(o.createdAt ?? Date.now());
                    const m = created.getMonth();
                    revenueByMonth[m] = (revenueByMonth[m] ?? 0) + price * qty;
                    ordersByMonth[m] = (ordersByMonth[m] ?? 0) + 1;
                } else {
                    // Tính orders theo tháng ngay cả khi chưa có giá
                    const created = new Date(o.createdAt ?? Date.now());
                    const m = created.getMonth();
                    ordersByMonth[m] = (ordersByMonth[m] ?? 0) + 1;
                }
            }

            if (o.title) {
                productCounts[o.title] = (productCounts[o.title] ?? 0) + 1;
            }
        }

        const monthlyData = monthLabels.map((label, idx) => ({
            month: label,
            revenue: revenueByMonth[idx] ?? 0,
            orders: ordersByMonth[idx] ?? 0,
        }));

        const topProducts = Object.entries(productCounts)
            .map(([name, orders]) => ({ name, orders }))
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 5);

        return {
            totalOrders: inboundOrders.length,
            pendingOrders: statusCounts['RFQ_CREATED'] ?? 0,
            inProgressOrders: (statusCounts['CONFIRMED'] ?? 0) + (statusCounts['IN_PRODUCTION'] ?? 0) + (statusCounts['QC'] ?? 0),
            completedOrders: (statusCounts['COMPLETED'] ?? 0) + (statusCounts['SHIPPING'] ?? 0) + (statusCounts['DELIVERED'] ?? 0) + (statusCounts['REVIEWED'] ?? 0),
            cancelledOrders: statusCounts['CANCELED'] ?? 0,
            disputedOrders: statusCounts['DISPUTED'] ?? 0,
            totalRevenue,
            averageRating: null,
            reviewCount: 0,
            monthlyData,
            topProducts,
        };
    }, [inboundOrders, selectedTeamId]);

    const statusPieData = useMemo(() => {
        if (!stats) return [];
        return Object.entries(STATUS_COLORS)
            .map(([status, color]) => {
                const count =
                    status === 'COMPLETED' ? (stats.completedOrders) :
                    status === 'DISPUTED' ? stats.disputedOrders :
                    status === 'CANCELED' ? stats.cancelledOrders :
                    status === 'RFQ_CREATED' ? stats.pendingOrders :
                    status === 'CONFIRMED' || status === 'IN_PRODUCTION' || status === 'QC' ? stats.inProgressOrders : 0;
                return { name: status, value: count, color };
            })
            .filter((d) => d.value > 0);
    }, [stats]);

    const selectedTeam = teams.find((t) => t.id === selectedTeamId);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (teams.length === 0) {
        return (
            <div className="max-w-3xl mx-auto p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                    <div className="text-4xl mb-3">🏭</div>
                    <h2 className="text-lg font-semibold mb-2">Bạn chưa có xưởng nào</h2>
                    <p className="text-gray-600">Tạo xưởng trước khi xem tổng quan.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Tổng quan xưởng</h1>
                <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="px-3 py-2 border rounded-lg text-sm"
                >
                    {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
            </div>

            {selectedTeam && (
                <div className="bg-white border rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-1">
                        <h2 className="font-semibold">{selectedTeam.name}</h2>
                        <p className="text-sm text-gray-500">
                            {selectedTeam.specialty ?? 'Chưa cập nhật chuyên môn'} ·{' '}
                            {selectedTeam.region ?? 'Chưa cập nhật khu vực'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500">Trust score</div>
                        <div className="text-2xl font-bold text-blue-600">
                            {selectedTeam.trustScore ?? 0}/100
                        </div>
                    </div>
                </div>
            )}

            {stats && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard label="Tổng đơn" value={stats.totalOrders} />
                        <StatCard label="Đang xử lý" value={stats.inProgressOrders + stats.pendingOrders} accent="text-blue-600" />
                        <StatCard label="Hoàn thành" value={stats.completedOrders} accent="text-green-600" />
                        <StatCard label="Tranh chấp" value={stats.disputedOrders} accent="text-red-600" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border rounded-lg p-4">
                            <h3 className="font-semibold mb-3">Doanh thu theo tháng</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.monthlyData}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" />
                                        <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                                        <Tooltip
                                            formatter={(value) => {
                                                const num = typeof value === 'number' ? value : Number(value);
                                                return [num.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' }), 'Doanh thu'];
                                            }}
                                        />
                                        <Bar dataKey="revenue" fill="#3b82f6" name="Doanh thu" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-3 text-right text-sm text-gray-600">
                                Tổng doanh thu:{' '}
                                <span className="font-semibold text-gray-900">
                                    {stats.totalRevenue.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}
                                </span>
                            </div>
                        </div>

                        <div className="bg-white border rounded-lg p-4">
                            <h3 className="font-semibold mb-3">Trạng thái đơn hàng</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={statusPieData}
                                            dataKey="value"
                                            nameKey="name"
                                            outerRadius={80}
                                            label
                                        >
                                            {statusPieData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border rounded-lg p-4">
                        <h3 className="font-semibold mb-3">Top 5 sản phẩm theo số đơn</h3>
                        {stats.topProducts.length === 0 ? (
                            <p className="text-sm text-gray-500">Chưa có đơn hàng nào.</p>
                        ) : (
                            <ol className="space-y-2">
                                {stats.topProducts.map((p, idx) => (
                                    <li key={p.name} className="flex items-center gap-3">
                                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-semibold">
                                            {idx + 1}
                                        </span>
                                        <span className="flex-1 text-sm">{p.name}</span>
                                        <span className="text-sm font-semibold text-gray-700">{p.orders} đơn</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
    return (
        <div className="bg-white border rounded-lg p-4">
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-2xl font-bold ${accent ?? 'text-gray-900'}`}>{value}</div>
        </div>
    );
}
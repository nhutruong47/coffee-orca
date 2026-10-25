import api from './api';
import type { AdminOrder, AdminOverview, AdminPayment, AdminTask, AdminTeam, AdminUser, PageResponse, SubscriptionPlan, SystemLog } from '../types/types';
import { normalizeSubscriptionPlan } from './paymentService';

export const adminService = {
    getOverview: () =>
        api.get<AdminOverview>('/api/admin/overview').then(r => r.data),
    getUsers: (page: number = 0, size: number = 10, search: string = '') =>
        api.get<PageResponse<AdminUser>>(`/api/admin/users?page=${page}&size=${size}&search=${search}`).then(r => r.data),
    getTeams: (page: number = 0, size: number = 10, search: string = '') =>
        api.get<PageResponse<AdminTeam>>(`/api/admin/teams?page=${page}&size=${size}&search=${search}`).then(r => r.data),
    getOrders: () =>
        api.get<AdminOrder[]>('/api/admin/orders').then(r => r.data),
    getTasks: () =>
        api.get<AdminTask[]>('/api/admin/tasks').then(r => r.data),
    getPayments: (page: number = 0, size: number = 10, search: string = '') =>
        api.get<PageResponse<AdminPayment>>(`/api/admin/payments?page=${page}&size=${size}&search=${search}&_=${Date.now()}`).then(r => r.data),
    getLogs: (page: number = 0, size: number = 20, search: string = '') =>
        api.get<PageResponse<SystemLog>>(`/api/admin/logs?page=${page}&size=${size}&search=${encodeURIComponent(search)}&sort=createdAt,desc`).then(r => r.data),
    updateUserRole: (id: string, role: AdminUser['role']) =>
        api.patch<AdminUser>(`/api/admin/users/${id}/role`, { role }).then(r => r.data),
    updateUserLock: (id: string, locked: boolean) =>
        api.patch<AdminUser>(`/api/admin/users/${id}/lock`, { locked }).then(r => r.data),
    updateTeamPublication: (id: string, published: boolean) =>
        api.patch<AdminTeam>(`/api/admin/teams/${id}/publication`, { published }).then(r => r.data),
    updateTeamVerification: (id: string, status: 'APPROVED' | 'REJECTED', rejectReason?: string) =>
        api.patch<AdminTeam>(`/api/admin/teams/${id}/verification`, { status, rejectReason }).then(r => r.data),
    updateTaskStatus: (id: string, status: string) =>
        api.patch(`/api/admin/tasks/${id}/status`, { status }).then(r => r.data),
    getPlans: () =>
        api.get<SubscriptionPlan[]>('/api/admin/plans').then(r => r.data.map(normalizeSubscriptionPlan)),
    createPlan: (plan: SubscriptionPlan) =>
        api.post<SubscriptionPlan>('/api/admin/plans', plan).then(r => r.data),
    updatePlan: (id: string, plan: SubscriptionPlan) =>
        api.put<SubscriptionPlan>(`/api/admin/plans/${id}`, plan).then(r => r.data),
    deletePlan: (id: string) =>
        api.delete(`/api/admin/plans/${id}`).then(r => r.data),
    
    // New CRUD Endpoints
    createUser: (details: Partial<AdminUser> & { password?: string }) =>
        api.post<AdminUser>('/api/admin/users', details).then(r => r.data),
    updateUser: (id: string, details: Partial<AdminUser>) =>
        api.put<AdminUser>(`/api/admin/users/${id}`, details).then(r => r.data),
    resetUserPassword: (id: string) =>
        api.post<{ password: string }>(`/api/admin/users/${id}/reset-password`).then(r => r.data),
    
    updateTeam: (id: string, details: Partial<AdminTeam>) =>
        api.put<AdminTeam>(`/api/admin/teams/${id}`, details).then(r => r.data),
    deleteTeam: (id: string) =>
        api.delete(`/api/admin/teams/${id}`).then(r => r.data),
        
    getAiConfigs: () =>
        api.get<Record<string, string>>('/api/admin/ai-configs').then(r => r.data),
    updateAiConfigs: (configs: Record<string, string>) =>
        api.put('/api/admin/ai-configs', configs).then(r => r.data),
    exportAdminReportExcel: () =>
        api.get('/api/admin/reports/excel', { responseType: 'blob' }),
};

export const adminCostService = {
    getCosts: (page: number = 0, size: number = 10, search: string = '', categoryId?: string, status?: string) => {
        const params = new URLSearchParams({ page: page.toString(), size: size.toString() });
        if (search) params.append('search', search);
        if (categoryId) params.append('categoryId', categoryId);
        if (status) params.append('status', status);
        return api.get<PageResponse<any>>(`/api/admin/costs?${params.toString()}`).then(r => r.data);
    },
    getCost: (id: string) =>
        api.get<any>(`/api/admin/costs/${id}`).then(r => r.data),
    createCost: (cost: any) =>
        api.post<any>('/api/admin/costs', cost).then(r => r.data),
    updateCost: (id: string, cost: any) =>
        api.put<any>(`/api/admin/costs/${id}`, cost).then(r => r.data),
    deleteCost: (id: string) =>
        api.delete(`/api/admin/costs/${id}`).then(r => r.data),
        
    getCategories: () =>
        api.get<any[]>('/api/admin/costs/categories').then(r => r.data),
    createCategory: (category: any) =>
        api.post<any>('/api/admin/costs/categories', category).then(r => r.data),
    updateCategory: (id: string, category: any) =>
        api.put<any>(`/api/admin/costs/categories/${id}`, category).then(r => r.data),
    deleteCategory: (id: string) =>
        api.delete(`/api/admin/costs/categories/${id}`).then(r => r.data),
        
    getDashboard: () =>
        api.get<any>('/api/admin/costs/dashboard').then(r => r.data),
};

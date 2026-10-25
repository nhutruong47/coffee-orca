import api from './api';
import type { LoginRequest, RegisterRequest, AuthResponse, UserInfo } from '../types/types';

export const authService = {
    /**
     * Đăng nhập - POST /api/auth/login
     */
    async login(data: LoginRequest): Promise<AuthResponse> {
        const response = await api.post<AuthResponse>('/api/auth/login', data);
        return response.data;
    },

    /**
     * Đăng ký - POST /api/auth/register
     */
    async register(data: RegisterRequest): Promise<AuthResponse> {
        const response = await api.post<AuthResponse>('/api/auth/register', data);
        return response.data;
    },

    /**
     * Lấy thông tin user hiện tại - GET /api/auth/me
     */
    async getMe(): Promise<UserInfo> {
        const response = await api.get<UserInfo>('/api/auth/me');
        return response.data;
    },

    /**
     * Cập nhật thông tin profile - PUT /api/auth/profile
     */
    async updateProfile(data: { fullName?: string; avatar?: string; email?: string }): Promise<AuthResponse> {
        const response = await api.put<AuthResponse>('/api/auth/profile', data);
        return response.data;
    },

    async changePassword(data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
        const response = await api.put<{ message: string }>('/api/auth/password', data);
        return response.data;
    },

    async resetPassword(data: { username: string; newPassword: string }): Promise<{ message: string }> {
        const response = await api.post<{ message: string }>('/api/auth/password/reset', data);
        return response.data;
    },

    /**
     * Tải file lên - POST /api/upload
     */
    async uploadFile(file: File | Blob): Promise<{ fileName: string; url: string; type: string; size: number }> {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post('/api/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },
};

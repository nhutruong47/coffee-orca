import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8085';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

function sanitizeApiError(error: any) {
    const message = error?.response?.data?.error || error?.response?.data?.message || '';
    const lower = String(message).toLowerCase();
    if (lower.includes('could not execute statement') || lower.includes('constraint') || lower.includes('public.') || lower.includes('sql')) {
        const friendly = 'Dữ liệu bị trùng hoặc không hợp lệ. Vui lòng kiểm tra lại và thử lần nữa.';
        if (error.response?.data) {
            error.response.data.error = friendly;
            error.response.data.message = friendly;
        }
    }
    return error;
}

export function isPaymentRequiredError(error: any) {
    const status = error?.response?.status;
    const responseData = error?.response?.data;
    const message = [
        responseData?.error,
        responseData?.message,
        error?.message,
        error?.code,
    ].filter(Boolean).join(' ').toLowerCase();

    return status === 402
        || message.includes('payment_required')
        || message.includes('hết hạn gói miễn phí');
}

// Interceptor: tự động gắn JWT token vào mọi request
api.interceptors.request.use(
    (config) => {
        const token = sessionStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token hết hạn hoặc không hợp lệ
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
            // Redirect về login nếu không ở trang auth
            if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
                window.location.href = '/login';
            }
        }

        if (isPaymentRequiredError(error)) {
            error.code = 'PAYMENT_REQUIRED';
            if (error.response?.data) {
                error.response.data.error = 'PAYMENT_REQUIRED';
                error.response.data.message = 'Gói miễn phí đã hết hạn.';
            }
            window.dispatchEvent(new CustomEvent('payment-required'));
            return Promise.reject(error);
        }

        return Promise.reject(sanitizeApiError(error));
    }
);

export const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.url || res.data;
};

export default api;

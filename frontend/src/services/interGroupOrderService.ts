import api from './api';
import type { InterGroupOrder, Review, ReviewSummary } from '../types/types';

export const interGroupOrderService = {
    getOutboundOrders: (buyerTeamId: string) =>
        api.get<InterGroupOrder[]>(`/api/inter-group-orders/outbound/${buyerTeamId}`).then(r => r.data),

    getMyOutboundOrders: () =>
        api.get<InterGroupOrder[]>('/api/inter-group-orders/outbound-personal').then(r => r.data),

    getInboundOrders: (sellerTeamId: string) =>
        api.get<InterGroupOrder[]>(`/api/inter-group-orders/inbound/${sellerTeamId}`).then(r => r.data),

    getOrder: (orderId: string) =>
        api.get<InterGroupOrder>(`/api/inter-group-orders/${orderId}`).then(r => r.data),

    getEventLogs: (orderId: string) =>
        api.get<any[]>(`/api/inter-group-orders/${orderId}/event-logs`).then(r => r.data),

    placeOrder: (data: Partial<InterGroupOrder>) =>
        api.post<InterGroupOrder>('/api/inter-group-orders', data).then(r => r.data),

    acceptOrder: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/accept`).then(r => r.data),

    quoteOrder: (orderId: string, payload: { price: number; note: string }) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/quote`, payload).then(r => r.data),

    requoteOrder: (orderId: string, payload: { price: number; note: string }) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/requote`, payload).then(r => r.data),

    buyerAcceptRequote: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/buyer-accept-requote`).then(r => r.data),

    buyerRejectRequote: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/buyer-reject-requote`).then(r => r.data),

    sellerConfirmRequote: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/seller-confirm-requote`).then(r => r.data),

    confirmQuote: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/confirm-quote`).then(r => r.data),

    rejectOrder: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/reject`).then(r => r.data),

    cancelOrder: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/cancel`).then(r => r.data),

    approveCancelOrder: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/approve-cancel`).then(r => r.data),

    rejectCancelOrder: (orderId: string) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/reject-cancel`).then(r => r.data),

    shipOrder: (orderId: string) =>
        api.patch<InterGroupOrder>(`/api/inter-group-orders/${orderId}/ship`).then(r => r.data),

    deliverOrder: (orderId: string, payload?: { deliveryNote?: string; proofImages?: { imageUrl: string; latitude: number | null; longitude: number | null; capturedAt: string }[] }) =>
        api.patch<InterGroupOrder>(`/api/inter-group-orders/${orderId}/deliver`, payload).then(r => r.data),

    /** Người mua xác nhận đã nhận hàng + đánh giá sao */
    buyerConfirmDelivery: (orderId: string, payload: {
        deliveryStatus: 'ON_TIME' | 'LATE' | 'NOT_DELIVERED';
        rating: number;
        comment: string;
        proofImageUrls?: string[];
    }) =>
        api.post<InterGroupOrder>(`/api/inter-group-orders/${orderId}/buyer-confirm`, payload).then(r => r.data),

    markViewed: (orderIds: string[], role: 'BUYER' | 'SELLER') =>
        api.post('/api/inter-group-orders/mark-viewed', { orderIds, role }).then(r => r.data),
};

export const reviewService = {
    getByTeam: (teamId: string) =>
        api.get<Review[]>(`/api/reviews/team/${teamId}`).then(r => r.data),

    getSummary: (teamId: string) =>
        api.get<ReviewSummary>(`/api/reviews/team/${teamId}/summary`).then(r => r.data),

    update: (reviewId: string, payload: {
        rating: number;
        comment: string;
        deliveryResult: 'ON_TIME' | 'LATE' | 'NOT_DELIVERED';
    }) =>
        api.put<Review>(`/api/reviews/${reviewId}`, payload).then(r => r.data),

    remove: (reviewId: string) =>
        api.delete(`/api/reviews/${reviewId}`).then(r => r.data),
};

export const manufacturingRequestService = {
    getAll: () =>
        api.get<any[]>('/api/manufacturing-requests').then(r => r.data),
    create: (data: any) =>
        api.post<any>('/api/manufacturing-requests', data).then(r => r.data),
};

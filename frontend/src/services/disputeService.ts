import api from './api';

export interface OrderDispute {
    id: string;
    orderId: string;
    buyerTeamId: string | null;
    buyerUserId: string | null;
    sellerTeamId: string;
    reason: string;
    requestedCompensationAmount: number | null;
    status: string; // OPEN, SELLER_RESPONDED, RESOLVED, CLOSED
    resolutionResult: string | null;
    actualCompensationAmount: number | null;
    createdAt: string;
    updatedAt: string;
}

export const disputeService = {
    createDispute: (orderId: string, payload: { reason: string; requestedCompensationAmount?: number; evidenceUrls?: string[] }) =>
        api.post<OrderDispute>(`/api/disputes/${orderId}`, payload).then(r => r.data),

    getDispute: (orderId: string) =>
        api.get<OrderDispute>(`/api/disputes/${orderId}`).then(r => r.data),

    respondToDispute: (disputeId: string, payload: { response: string; evidenceUrls?: string[] }) =>
        api.post<OrderDispute>(`/api/disputes/id/${disputeId}/respond`, payload).then(r => r.data),

    resolveDispute: (disputeId: string, payload: { resolutionResult: string; actualCompensationAmount?: number }) =>
        api.post<OrderDispute>(`/api/disputes/id/${disputeId}/resolve`, payload).then(r => r.data),
};

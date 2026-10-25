import api from './api';

export interface OrderContract {
    id: string;
    orderId: string;
    terms: string;
    buyerSignatureUrl?: string;
    sellerSignatureUrl?: string;
    signedAt?: string;
    status: 'DRAFT' | 'SIGNED' | 'CANCELED';
    fileUrl?: string;
    createdAt: string;
}

export const orderContractService = {
    createContract: async (orderId: string): Promise<OrderContract> => {
        const response = await api.post(`/api/contracts/order/${orderId}`);
        return response.data;
    },

    getContractByOrder: async (orderId: string): Promise<OrderContract> => {
        const response = await api.get(`/api/contracts/order/${orderId}`);
        return response.data;
    },

    signContract: async (contractId: string, signatureUrl: string): Promise<OrderContract> => {
        const response = await api.post(`/api/contracts/${contractId}/sign`, { signatureUrl });
        return response.data;
    }
};

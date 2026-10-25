import api from './api';

export const uploadFile = async (fileOrFormData: File | FormData): Promise<string> => {
    const formData = fileOrFormData instanceof FormData ? fileOrFormData : new FormData();
    if (fileOrFormData instanceof File) {
        formData.append('file', fileOrFormData);
    }

    const response = await api.post('/api/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data.url || response.data;
};

export const fileService = {
    uploadFile,
};

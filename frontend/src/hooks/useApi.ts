import { useState, useCallback } from 'react';
import { useToast } from '../context/ToastContext';

/**
 * Generic API call hook with toast notifications and loading states
 */
export function useApi<T = any>() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (
    apiCall: () => Promise<T>,
    options?: {
      successMessage?: string;
      errorMessage?: string;
      onSuccess?: (data: T) => void;
      onError?: (error: string) => void;
    }
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiCall();
      
      if (options?.successMessage) {
        toast.success(options.successMessage);
      }
      
      options?.onSuccess?.(result);
      return result;
    } catch (err: any) {
      const errorMessage = 
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        options?.errorMessage ||
        'Có lỗi xảy ra';

      setError(errorMessage);
      toast.error(options?.errorMessage || 'Lỗi', errorMessage);
      options?.onError?.(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  return { loading, error, execute, reset };
}

/**
 * Confirm dialog helper
 */
export function useConfirm() {
  const toast = useToast();

  const confirm = useCallback((
    message: string,
    options?: {
      title?: string;
      confirmText?: string;
      cancelText?: string;
      type?: 'danger' | 'warning' | 'info';
    }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      // For now, use browser confirm - can be replaced with a custom modal
      const result = window.confirm(
        `${options?.title ? options.title + '\n\n' : ''}${message}`
      );
      resolve(result);
    });
  }, [toast]);

  return { confirm };
}

/**
 * Validation helpers
 */
export const validators = {
  required: (value: any, fieldName = 'Trường này') => {
    if (value === null || value === undefined || value === '') {
      return `${fieldName} không được để trống`;
    }
    return null;
  },

  email: (value: string) => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Email không hợp lệ';
    }
    return null;
  },

  phone: (value: string) => {
    if (!value) return null;
    const phoneRegex = /^(0[0-9]{9,10})$/;
    if (!phoneRegex.test(value.replace(/\s/g, ''))) {
      return 'Số điện thoại không hợp lệ';
    }
    return null;
  },

  minLength: (value: string, min: number) => {
    if (!value) return null;
    if (value.length < min) {
      return `Tối thiểu ${min} ký tự`;
    }
    return null;
  },

  maxLength: (value: string, max: number) => {
    if (!value) return null;
    if (value.length > max) {
      return `Tối đa ${max} ký tự`;
    }
    return null;
  },

  positiveNumber: (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num) || num <= 0) {
      return 'Phải là số dương lớn hơn 0';
    }
    return null;
  },

  futureDate: (value: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (date <= new Date()) {
      return 'Phải là ngày trong tương lai';
    }
    return null;
  },

  minValue: (value: number, min: number, fieldName = 'Giá trị') => {
    if (value < min) {
      return `${fieldName} phải lớn hơn hoặc bằng ${min}`;
    }
    return null;
  },

  maxValue: (value: number, max: number, fieldName = 'Giá trị') => {
    if (value > max) {
      return `${fieldName} phải nhỏ hơn hoặc bằng ${max}`;
    }
    return null;
  },
};

/**
 * Form validation hook
 */
export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  validationRules: Partial<Record<keyof T, (value: T[keyof T]) => string | null>>
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});

  const validateField = useCallback((field: keyof T, value: T[keyof T]) => {
    const validator = validationRules[field];
    if (validator) {
      return validator(value);
    }
    return null;
  }, [validationRules]);

  const validateAll = useCallback(() => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let isValid = true;

    for (const field in validationRules) {
      const error = validateField(field, values[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  }, [values, validationRules, validateField]);

  const handleChange = useCallback((
    field: keyof T,
    value: T[keyof T]
  ) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const handleBlur = useCallback((field: keyof T) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, values[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  }, [values, validateField]);

  const reset = useCallback((newValues?: T) => {
    setValues(newValues || initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  const getFieldProps = useCallback((field: keyof T) => ({
    value: values[field] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = e.target;
      const value = target.type === 'checkbox' 
        ? (target as HTMLInputElement).checked 
        : target.value;
      handleChange(field, value as T[keyof T]);
    },
    onBlur: () => handleBlur(field),
    error: touched[field] ? errors[field] : undefined,
  }), [values, errors, touched, handleChange, handleBlur]);

  return {
    values,
    errors,
    touched,
    setValues,
    handleChange,
    handleBlur,
    validateAll,
    reset,
    getFieldProps,
    isValid: Object.values(errors).every(e => !e),
  };
}

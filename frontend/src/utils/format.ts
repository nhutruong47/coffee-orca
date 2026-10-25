/**
 * Utility functions for formatting data consistently across the app
 */

// ============ Date/Time Formatting ============

/**
 * Format date to Vietnamese locale (dd/mm/yyyy)
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format date with time (dd/mm/yyyy HH:mm)
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date as relative time (2 phút trước, 1 giờ trước, ...)
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHour < 24) return `${diffHour} giờ trước`;
  if (diffDay < 7) return `${diffDay} ngày trước`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} tuần trước`;
  
  return formatDate(date);
}

/**
 * Format time only (HH:mm)
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  return d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============ Number Formatting ============

/**
 * Format number with thousand separators (1,000,000)
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString('vi-VN');
}

/**
 * Format weight in kg with appropriate unit
 */
export function formatWeight(kg: number | null | undefined, unit = 'kg'): string {
  if (kg === null || kg === undefined) return '-';
  
  if (kg >= 1000) {
    return `${(kg / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tấn`;
  }
  
  return `${formatNumber(kg)} ${unit}`;
}

/**
 * Format currency in VND
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '-';
  
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-';
  
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ============ String Utilities ============

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Generate initials from name
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Generate avatar color from name (deterministic)
 */
export function getAvatarColor(name: string): string {
  const colors = [
    '#d4a574', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'
  ];
  
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % colors.length;
  }
  
  return colors[hash] || colors[0];
}

// ============ Validation Utilities ============

/**
 * Validate email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (Vietnamese)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^(0[0-9]{9,10})$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Check if value is empty (null, undefined, empty string, empty array)
 */
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// ============ Status Formatting ============

/**
 * Get status color based on status string
 */
export function getStatusColor(status: string): { bg: string; color: string; label: string } {
  const statusMap: Record<string, { bg: string; color: string; label: string }> = {
    // Task statuses
    PENDING: { bg: 'var(--warning-soft)', color: 'var(--warning)', label: 'Chờ xử lý' },
    IN_PROGRESS: { bg: 'var(--info-soft)', color: 'var(--info)', label: 'Đang làm' },
    BLOCKED: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: 'Bị khoá' },
    READY: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Sẵn sàng' },
    WAITING_APPROVAL: { bg: 'var(--warning-soft)', color: 'var(--warning)', label: 'Chờ duyệt' },
    COMPLETED: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Hoàn thành' },
    CANCELLED: { bg: 'var(--bg-input)', color: 'var(--text-secondary)', label: 'Đã huỷ' },
    
    // Order statuses
    ACCEPTED: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Đã chấp nhận' },
    REJECTED: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: 'Đã từ chối' },
    SHIPPED: { bg: 'var(--info-soft)', color: 'var(--info)', label: 'Đang giao' },
    DELIVERED: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Đã giao' },
    
    // Risk levels
    NONE: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'On dinh' },
    LOW: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Thấp' },
    MEDIUM: { bg: 'var(--warning-soft)', color: 'var(--warning)', label: 'Trung bình' },
    HIGH: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: 'Cao' },
    CRITICAL: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: 'Nguy cấp' },
  };

  return statusMap[status] || {
    bg: 'var(--bg-input)',
    color: 'var(--text-secondary)',
    label: status || 'Không xác định'
  };
}

/**
 * Get status badge class
 */
export function getStatusBadgeClass(status: string): string {
  const statusMap: Record<string, string> = {
    COMPLETED: 'badge-success',
    IN_PROGRESS: 'badge-info',
    READY: 'badge-success',
    PENDING: 'badge-warning',
    BLOCKED: 'badge-danger',
    CANCELLED: 'badge-muted',
    ACCEPTED: 'badge-success',
    REJECTED: 'badge-danger',
    SHIPPED: 'badge-info',
    DELIVERED: 'badge-success',
  };

  return statusMap[status] || 'badge-default';
}

import type { ReactNode } from 'react';
import './Skeleton.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ width, height = 20, borderRadius = '6px', className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, lastLineWidth = '60%' }: { lines?: number; lastLineWidth?: string }) {
  return (
    <div className="skeleton-text">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          borderRadius="4px"
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-card ${className}`}>
      <Skeleton height={120} borderRadius="8px" />
      <div className="skeleton-card-content">
        <Skeleton height={16} width="70%" />
        <Skeleton height={12} width="50%" />
      </div>
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  label?: string;
}

export function LoadingSpinner({ size = 'md', color, label = 'Đang tải...' }: LoadingSpinnerProps) {
  const sizeMap = { sm: 20, md: 32, lg: 48 };
  const pixelSize = sizeMap[size];

  return (
    <div className="loading-spinner" role="status" aria-label={label}>
      <div
        className="spinner"
        style={{
          width: pixelSize,
          height: pixelSize,
          borderColor: color ? `${color}20` : 'var(--border)',
          borderTopColor: color || 'var(--primary)',
        }}
      />
      {label && <span className="loading-label">{label}</span>}
    </div>
  );
}

interface LoadingPageProps {
  message?: string;
  children?: ReactNode;
}

export function LoadingPage({ message = 'Đang tải dữ liệu...', children }: LoadingPageProps) {
  return (
    <div className="loading-page">
      {children}
      <div className="loading-page-overlay">
        <LoadingSpinner size="lg" />
        {message && <p className="loading-page-message">{message}</p>}
      </div>
    </div>
  );
}

export function LoadingInline({ message }: { message?: string }) {
  return (
    <div className="loading-inline">
      <LoadingSpinner size="sm" />
      {message && <span>{message}</span>}
    </div>
  );
}

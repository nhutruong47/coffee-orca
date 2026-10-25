import type { ReactNode, ReactElement } from 'react';
import './EmptyState.css';

interface EmptyStateProps {
  icon?: ReactElement;
  iconName?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  variant?: 'default' | 'compact' | 'large';
}

export default function EmptyState({
  icon,
  iconName,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className = '',
  variant = 'default',
}: EmptyStateProps) {
  const renderIcon = () => {
    if (icon) return icon;
    if (iconName) {
      return <ion-icon name={iconName} />;
    }
    return null;
  };

  return (
    <div className={`empty-state empty-state--${variant} ${className}`} role="status">
      <div className="empty-state-icon">
        {renderIcon()}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {(action || (actionLabel && onAction)) && (
        <div className="empty-state-actions">
          {action || (
            <button className="btn btn-primary" onClick={onAction}>
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

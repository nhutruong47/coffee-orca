import './LoadingFallback.css';

/**
 * Suspense fallback shown while lazy-loaded route bundles resolve.
 *
 * Uses CSS variables for theme compatibility; the spinner is purely
 * decorative so the page is usable even if animations are disabled.
 */
export default function LoadingFallback() {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-label="Đang tải trang"
            className="loading-fallback"
        >
            <div className="loading-fallback-spinner" aria-hidden="true">
                <ion-icon name="cafe-outline"></ion-icon>
            </div>
            <p className="loading-fallback-text">Đang tải…</p>
        </div>
    );
}

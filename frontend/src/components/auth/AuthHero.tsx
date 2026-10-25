import { useEffect, useState } from 'react';

interface BrandInfo {
    name: string;
    desc: string;
    emoji: string;
}

interface BrandLogo {
    key: string;
    top: string;
    bottom: string;
    src: string;
}

interface StatItem {
    value: string;
    label: string;
}

interface AuthHeroProps {
    brands: BrandInfo[];
    brandLogos: BrandLogo[];
    stats: StatItem[];
    badge?: string;
    title: React.ReactNode;
    description: string;
    rotateIntervalMs?: number;
}

export default function AuthHero({
    brands,
    brandLogos,
    stats,
    badge = 'ORCA Coffee Platform',
    title,
    description,
    rotateIntervalMs = 3000,
}: AuthHeroProps) {
    const [activeBrand, setActiveBrand] = useState(0);

    useEffect(() => {
        if (brands.length <= 1) return;
        const timer = setInterval(() => {
            setActiveBrand(prev => (prev + 1) % brands.length);
        }, rotateIntervalMs);
        return () => clearInterval(timer);
    }, [brands.length, rotateIntervalMs]);

    return (
        <div className="login-hero">
            <div className="login-hero-overlay" />
            <img src="/coffee-hero.png" alt="Coffee Workshop" className="login-hero-img" />

            <div className="login-hero-content">
                <div className="login-hero-badge">{badge}</div>
                <h1 className="login-hero-title">{title}</h1>
                <p className="login-hero-desc">{description}</p>

                <div className="login-brands">
                    <p className="login-brands-label">Đối tác & Xưởng cà phê nổi bật</p>
                    <div className="login-brands-list">
                        {brands.map((brand, i) => {
                            const logo = brandLogos[i];
                            return (
                                <div
                                    key={brand.name}
                                    className={`login-brand-card ${i === activeBrand ? 'active' : ''}`}
                                    onClick={() => setActiveBrand(i)}
                                >
                                    <span className={`login-brand-logo login-brand-logo--${logo.key}`}>
                                        <img
                                            src={logo.src}
                                            alt={`${brand.name} logo`}
                                            loading="lazy"
                                            onError={(event) => {
                                                event.currentTarget.style.display = 'none';
                                                event.currentTarget.parentElement?.classList.add('login-brand-logo--fallback');
                                            }}
                                        />
                                        <span className="login-brand-logo-fallback">
                                            <strong>{logo.top}</strong>
                                            <small>{logo.bottom}</small>
                                        </span>
                                    </span>
                                    <div>
                                        <div className="login-brand-name">{brand.name}</div>
                                        <div className="login-brand-desc">{brand.desc}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="login-brands-dots">
                        {brands.map((_, i) => (
                            <span
                                key={i}
                                className={`dot ${i === activeBrand ? 'active' : ''}`}
                                onClick={() => setActiveBrand(i)}
                            />
                        ))}
                    </div>
                </div>

                <div className="login-hero-stats">
                    {stats.map((stat) => (
                        <div key={stat.label} className="login-hero-stat">
                            <span className="stat-value">{stat.value}</span>
                            <span className="stat-label">{stat.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
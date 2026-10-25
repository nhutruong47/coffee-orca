import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './ReelmarkHero.css';

const GRID_POSTER = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/b7ebb74a-8c8a-4f7e-8f80-55e2d74ecd05.webp';
const GRID_VIDEO = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/04fd3d5f-99d7-476e-98a4-46c08518ffb3.mp4';

export const HomePage: React.FC = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Update scale factor --u based on viewport (1440x1080 design space)
  useEffect(() => {
    const updateUnit = () => {
      if (!stageRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const u = Math.min(vw / 1440, vh / 1080);
      document.documentElement.style.setProperty('--u', `${u}px`);
    };

    updateUnit();
    window.addEventListener('resize', updateUnit);
    return () => window.removeEventListener('resize', updateUnit);
  }, []);

  // Curved Cylinder Carousel physics & animation loop
  useEffect(() => {
    let animationFrameId: number;
    let offset = 0;
    const speed = 50; // 50u per second auto scroll
    let isDragging = false;
    let startX = 0;
    let dragStartOffset = 0;
    let velocity = 0;
    let lastDragX = 0;
    let lastTime = performance.now();

    const cardPitch = 196;
    const totalCards = 10;
    const totalWidth = totalCards * cardPitch;

    const renderCarousel = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!isDragging) {
        if (Math.abs(velocity) > 0.5) {
          offset += velocity * dt;
          velocity *= Math.pow(0.05, dt); // Decays ~95% per second
        } else {
          offset += speed * dt;
        }
      }

      // Keep offset positive & bounded
      offset = ((offset % totalWidth) + totalWidth) % totalWidth;

      // Position each of the 10 cards along the cylinder curve
      cardsRef.current.forEach((card, i) => {
        if (!card) return;

        // Base linear position centered around 0
        let pos = (i * cardPitch - offset) % totalWidth;
        if (pos < -totalWidth / 2) pos += totalWidth;
        if (pos > totalWidth / 2) pos -= totalWidth;

        // Normalized distance d from center (720u)
        const t = pos;
        const normDist = Math.abs(t) / 706;
        const d = Math.min(normDist, 1.4);

        // Cylinder outward displacement: x = 720 + t * (1 + 0.083 * (t / 706)^2)
        const xCenter = 720 + t * (1 + 0.083 * Math.pow(t / 706, 2));

        // Geometric sizing per spec:
        // Width = (170 + 48 * d^2)
        const width = 170 + 48 * Math.pow(d, 2);

        // Height curve based on outer edge: Height = (280 + 92 * d^2.6)
        const height = 280 + 92 * Math.pow(d, 2.6);

        // Vertical center = (687 - 12 * d^2)
        // Note: carousel-viewport is placed at top 480u, so relative y center = (687 - 480) - 12 * d^2 = 207 - 12 * d^2
        const yCenter = 207 - 12 * Math.pow(d, 2);

        const left = xCenter - width / 2;
        const top = yCenter - height / 2;

        card.style.transform = `translate3d(calc(${left} * var(--u)), calc(${top} * var(--u)), 0)`;
        card.style.width = `calc(${width} * var(--u))`;
        card.style.height = `calc(${height} * var(--u))`;

        // Slight 3D leaning perspective: cards on left rotateY slightly, cards on right opposite
        const rotY = -(t / 706) * 16;
        card.style.transform += ` rotateY(${rotY}deg)`;
      });

      animationFrameId = requestAnimationFrame(renderCarousel);
    };

    animationFrameId = requestAnimationFrame(renderCarousel);

    // Drag handlers
    const el = carouselRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      startX = e.clientX;
      lastDragX = e.clientX;
      dragStartOffset = offset;
      velocity = 0;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 1;
      offset = dragStartOffset - dx / u;

      // Track instantaneous velocity
      const instDx = e.clientX - lastDragX;
      velocity = -(instDx / u) * 40;
      lastDragX = e.clientX;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {}
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      cancelAnimationFrame(animationFrameId);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return (
    <div className="reelmark-landing">
      <div className="reelmark-stage" ref={stageRef}>
        {/* Topbar */}
        <header className="reelmark-topbar">
          <Link to="/" className="reelmark-logo">
            {/* Green Leaf Logo */}
            <svg className="reelmark-logo-leaf" viewBox="0 0 32 32" fill="none">
              <path
                d="M6 26C6 26 8 16 18 10C24 6.5 28 6 28 6C28 6 27 10 24 16C19 25 10 26 6 26Z"
                fill="#08482D"
              />
              <path
                d="M6 26C11 23 16 17 21 11"
                stroke="#F5F8EF"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Reelmark</span>
          </Link>

          <nav className="reelmark-nav">
            <Link to="/marketplace" className="reelmark-nav-item">Brands</Link>
            <Link to="/forecast" className="reelmark-nav-item">Creators</Link>
            <Link to="/upgrade" className="reelmark-nav-item">Pricing</Link>
            <Link to="/orders" className="reelmark-nav-item">Use Cases</Link>
            <Link to="/settings" className="reelmark-nav-item">Contact</Link>
          </nav>

          <div className="reelmark-actions">
            <Link to="/login" className="btn-login">Log in</Link>
            <Link to="/register" className="btn-signup">Sign up</Link>
          </div>
        </header>

        {/* Mint Badge */}
        <div className="reelmark-badge">
          Trusted by 120,000+ indie makers
        </div>

        {/* Big Bold Headline */}
        <h1 className="reelmark-headline">
          Captivate Crowds
          <span className="line-2">with Snackable Reels</span>
        </h1>

        {/* Subline */}
        <p className="reelmark-subline">
          Grow your brand with short, snappy product clips by<br />
          our handpicked video makers. Our crew is ready to<br />
          lift your next launch higher.
        </p>

        {/* Hand-drawn Notes & Doodles */}
        <div className="hand-note note-doodle">//</div>

        <div className="hand-note note-beseen">
          Be seen<br />with clips
        </div>

        {/* Curling Arrow from 'Be seen' down to cards */}
        <svg
          className="arrow-svg"
          style={{ top: 'calc(385 * var(--u))', left: 'calc(1185 * var(--u))', width: 'calc(95 * var(--u))', height: 'calc(110 * var(--u))' }}
          viewBox="0 0 95 110"
          fill="none"
        >
          <path
            d="M 50 5 Q 75 40 45 75 Q 25 100 12 105"
            stroke="#08482D"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 10 92 L 12 105 L 24 104"
            stroke="#08482D"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div className="hand-note note-zerocost">
          Zero cost
        </div>

        {/* Small arrow pointing to the button */}
        <svg
          className="arrow-svg"
          style={{ top: 'calc(935 * var(--u))', left: 'calc(580 * var(--u))', width: 'calc(45 * var(--u))', height: 'calc(30 * var(--u))' }}
          viewBox="0 0 45 30"
          fill="none"
        >
          <path
            d="M 5 22 Q 22 25 35 12"
            stroke="#08482D"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 27 10 L 35 12 L 32 20"
            stroke="#08482D"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Curved Video Carousel */}
        <div className="carousel-viewport" ref={carouselRef}>
          <div className="carousel-stage">
            {Array.from({ length: 10 }).map((_, idx) => {
              // 5 columns, 2 rows (10 tiles in 5x2 grid)
              const col = idx % 5;
              const row = Math.floor(idx / 5);

              return (
                <div
                  key={idx}
                  className="carousel-card"
                  ref={(el) => {
                    cardsRef.current[idx] = el;
                  }}
                >
                  <img
                    src={GRID_POSTER}
                    alt="Reel clip poster"
                    className="card-poster"
                    style={{
                      transform: `translate(-${col * 20}%, -${row * 50}%)`,
                    }}
                  />
                  <video
                    src={GRID_VIDEO}
                    muted
                    loop
                    playsInline
                    autoPlay
                    className="card-video"
                    style={{
                      transform: `translate(-${col * 20}%, -${row * 50}%)`,
                    }}
                  />
                  <div className="play-pill">
                    <svg viewBox="0 0 24 24">
                      <polygon points="6,4 20,12 6,20" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Forest-green Button inside Dashed Ring */}
        <div className="cta-container">
          <div className="cta-dashed-ring" />
          <Link to="/marketplace" className="btn-main-cta">
            Make a Reel
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HomePage;

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, 
  MapPin, 
  Sparkles, 
  Layers, 
  ShieldCheck, 
  Send, 
  X, 
  Bot, 
  Coffee
} from 'lucide-react';
import './ReelmarkHero.css';

const COFFEE_MEDIA = [
  {
    title: 'Rang Cà Phê Mộc',
    tag: 'Xưởng Rang',
    poster: 'https://images.unsplash.com/photo-1518832553480-cd0e625ed3e6?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-coffee-beans-falling-in-a-coffee-machine-42456-large.mp4'
  },
  {
    title: 'Pha Chế Espresso',
    tag: 'Barista',
    poster: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-barista-making-a-cappuccino-with-latte-art-42460-large.mp4'
  },
  {
    title: 'Thu Hoạch Quả Chín',
    tag: 'Nông Trường',
    poster: 'https://images.unsplash.com/photo-1610632380989-680fe40816c6?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-coffee-plantation-with-coffee-cherries-42462-large.mp4'
  },
  {
    title: 'Phơi Nhân Honey',
    tag: 'Sơ Chế',
    poster: 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-coffee-beans-scattered-on-a-table-42457-large.mp4'
  },
  {
    title: 'Cupping Thử Nếm SCAA',
    tag: 'Kiểm Định',
    poster: 'https://images.unsplash.com/photo-1509785307050-d4066910ec1e?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-pouring-hot-water-into-a-chemex-coffee-maker-42461-large.mp4'
  },
  {
    title: 'Đóng Gói Bảo Quản',
    tag: 'Kho Vận',
    poster: 'https://images.unsplash.com/photo-1559525839-8f8ec3de0ffb?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-roasted-coffee-beans-falling-in-slow-motion-42459-large.mp4'
  },
  {
    title: 'Cold Brew Ủ Lạnh',
    tag: 'Chiết Xuất',
    poster: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-pouring-coffee-into-a-glass-with-ice-cubes-42458-large.mp4'
  },
  {
    title: 'Xay Hạt Đặc Sản',
    tag: 'Tiêu Chuẩn',
    poster: 'https://images.unsplash.com/photo-1524350876685-274059332603?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-coffee-beans-in-a-coffee-grinder-42463-large.mp4'
  },
  {
    title: 'Pour Over V60',
    tag: 'Nghệ Thuật',
    poster: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-barista-dripping-filter-coffee-42465-large.mp4'
  },
  {
    title: 'Latte Art Thiên Nga',
    tag: 'Sáng Tạo',
    poster: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
    video: 'https://assets.mixkit.co/videos/preview/mixkit-pouring-milk-to-make-coffee-latte-art-42464-large.mp4'
  }
];

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

export const HomePage: React.FC = () => {
  const stageRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  // AI Sommelier State
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Xin chào! Tôi là ORCA Coffee Sommelier AI. Hãy chia sẻ hương vị, độ cao hoặc gu pha chế bạn tìm kiếm, tôi sẽ gợi ý loại hạt hoàn hảo nhất.'
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const handleSendAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const userText = inputVal.trim();
    const newMsgs = [...messages, { role: 'user' as const, text: userText }];
    setMessages(newMsgs);
    setInputVal('');
    setIsThinking(true);

    setTimeout(() => {
      let reply = 'Dựa trên tri thức vùng trồng và sàn giao dịch ORCA, tôi gợi ý cho bạn: ';
      const lower = userText.toLowerCase();

      if (lower.includes('chua') || lower.includes('hoa') || lower.includes('cold brew') || lower.includes('arabica')) {
        reply += '🌾 **Arabica Cầu Đất (Washed Process)**: Độ cao 1.600m, đạt chuẩn SCAA 85.5 với nốt hương hoa cam, quả mọng nhiệt đới và hậu vị mật ong rừng. Rất lý tưởng cho Pour-over hoặc Cold Brew.';
      } else if (lower.includes('đậm') || lower.includes('mạnh') || lower.includes('phin') || lower.includes('robusta')) {
        reply += '🍫 **Fine Robusta Buôn Ma Thuột (Honey Process)**: Thể chất dày dặn (heavy body), hương vị socola đen, hạnh nhân nướng, caffeine tự nhiên 2.5% giúp bừng tỉnh năng lượng pha Phin hoặc Espresso.';
      } else if (lower.includes('giá') || lower.includes('dự báo') || lower.includes('thị trường')) {
        reply += '📊 **Tín hiệu AI Lead-Lag hôm nay**: Giá London Robusta đang tác động kéo giá thu mua Đắk Lắk quanh mức 88.500 - 89.500 đ/kg. Khuyến nghị xưởng nên chốt hợp đồng gia công kỳ hạn tháng tới.';
      } else {
        reply += '✨ **Liberica Quảng Trị (Anaerobic)**: Dòng cà phê Mít độc bản với hương thơm mít chín, hoa tiêu và vị chua thanh tao nhã độc nhất vô nhị.';
      }

      setMessages([...newMsgs, { role: 'assistant', text: reply }]);
      setIsThinking(false);
    }, 800);
  };

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

    const isMobile = window.innerWidth <= 820;
    const cardPitch = isMobile ? 180 : 196;
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

        if (window.innerWidth <= 820) {
          // Mobile specific geometry: large cards, prominent 9:16 reels, peek sides
          const centerOffset = window.innerWidth / 2;
          const left = centerOffset + pos - 80;
          card.style.transform = `translate3d(${left}px, 15px, 0)`;
          card.style.width = '160px';
          card.style.height = '270px';
          return;
        }

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
            <span>ORCA Coffee</span>
          </Link>

          <nav className="reelmark-nav">
            <Link to="/marketplace" className="reelmark-nav-item">Sàn Gia Công</Link>
            <Link to="/forecast" className="reelmark-nav-item">Dự Báo Giá</Link>
            <Link to="/upgrade" className="reelmark-nav-item">Gói Dịch Vụ</Link>
            <Link to="/orders" className="reelmark-nav-item">Đơn Hàng</Link>
            <Link to="/dashboard" className="reelmark-nav-item">Vào Xưởng</Link>
          </nav>

          <div className="reelmark-actions">
            <Link to="/login" className="btn-login">Đăng nhập</Link>
            <Link to="/register" className="btn-signup">Đăng ký</Link>
          </div>
        </header>

        {/* Mint Badge */}
        <div className="reelmark-badge">
          Hơn 120+ Xưởng Cà Phê Tin Tưởng
        </div>

        {/* Big Bold Headline */}
        <h1 className="reelmark-headline">
          Hạ Tầng Vận Hành
          <span className="line-2">Cà Phê Bản Sắc Việt</span>
        </h1>

        {/* Subline */}
        <p className="reelmark-subline">
          Nền tảng số hóa xưởng rang xay, dự báo dẫn truyền giá thị trường<br />
          và kết nối trực tiếp các nhà chế biến nông sản đặc sản hàng đầu.
        </p>

        {/* Hand-drawn Notes & Doodles */}
        <div className="hand-note note-doodle">//</div>

        <div className="hand-note note-beseen">
          Mẻ rang<br />nguyên bản
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
          Miễn phí
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
            {COFFEE_MEDIA.map((item, idx) => {
              return (
                <div
                  key={idx}
                  className="carousel-card"
                  ref={(el) => {
                    cardsRef.current[idx] = el;
                  }}
                >
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="card-poster"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'none'
                    }}
                  />
                  <video
                    src={item.video}
                    muted
                    loop
                    playsInline
                    autoPlay
                    className="card-video"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'none'
                    }}
                  />
                  <div className="card-badge-overlay">
                    <span className="card-tag">{item.tag}</span>
                    <span className="card-title">{item.title}</span>
                  </div>
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
            Khám Phá Sàn
          </Link>
        </div>
      </div>

      {/* SECTION 2: 3-PILLAR ENTERPRISE CAPABILITIES */}
      <section className="landing-section">
        <div className="section-tag">
          <Sparkles className="w-4 h-4" /> Hệ Sinh Thái ORCA
        </div>
        <h2 className="section-title">Hạ Tầng Vận Hành Cà Phê Chuyên Sâu</h2>
        <p className="section-desc">
          Kết hợp hoàn hảo giữa công nghệ số hóa xưởng rang xay, dự báo dẫn truyền giá theo thời gian thực và sàn giao dịch gia công nguyên bản.
        </p>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-box">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="feature-card-title">AI Price Intelligence</h3>
            <p className="feature-card-text">
              Mô hình Huber Lead-Lag dự báo độ trễ truyền dẫn giá từ sàn ICE London Robusta về các nông trường Tây Nguyên với độ chuẩn xác R² đạt 94%.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="feature-card-title">Điều Hành Xưởng Thông Minh</h3>
            <p className="feature-card-text">
              Quản lý định mức hao hụt rang, truy vết lô nhân xanh theo mẻ (Lot tracking), số hóa tiến độ đơn hàng và tự động giải phóng tồn kho.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-box">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="feature-card-title">Sàn Gia Công Minh Bạch</h3>
            <p className="feature-card-text">
              Liên kết hàng trăm xưởng sơ chế, nhà rang và chuỗi F&B với hợp đồng điện tử thông minh, đánh giá Trust Score và kiểm định chất lượng SCAA.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 3: 8 VÙNG NGUYÊN LIỆU BẢN SẮC */}
      <section className="landing-section" style={{ background: '#f0f4ea', borderRadius: '32px', margin: '20px 0', padding: '80px 48px 120px 48px' }}>
        <div className="section-tag">
          <MapPin className="w-4 h-4" /> Bản Sắc Thổ Nhưỡng
        </div>
        <h2 className="section-title">
          8 Thủ Phủ Cà Phê &nbsp;Đặc Sản Việt Nam
        </h2>
        <p className="section-desc">
          Từ những cánh rừng nguyên sinh Cầu Đất đến đất đỏ bazan Buôn Ma Thuột — mỗi mẻ rang đều mang đậm dấu ấn thổ nhưỡng độc bản.
        </p>

        <div className="regions-grid">
          <div className="region-box">
            <span className="region-altitude">1.600m · Lâm Đồng</span>
            <h4 className="region-name">Arabica Cầu Đất</h4>
            <p className="region-flavor">Hương hoa cam, quả mọng nhiệt đới, vị chua thanh thanh tao nhã.</p>
            <span className="region-badge">SCAA 85.5+</span>
          </div>

          <div className="region-box">
            <span className="region-altitude">800m · Đắk Lắk</span>
            <h4 className="region-name">Robusta Buôn Ma Thuột</h4>
            <p className="region-flavor">Chocolate đen nguyên chất, hạt phỉ nướng, thể chất dày đượm đà.</p>
            <span className="region-badge">Fine Robusta</span>
          </div>

          <div className="region-box">
            <span className="region-altitude">600m · Quảng Trị</span>
            <h4 className="region-name">Liberica Mít</h4>
            <p className="region-flavor">Mùi mít chín đặc trưng, hoa tiêu hoang dã, vị chua dịu độc bản.</p>
            <span className="region-badge">Hiếm & Quý</span>
          </div>

          <div className="region-box">
            <span className="region-altitude">1.200m · Sơn La</span>
            <h4 className="region-name">Bourbon Tây Bắc</h4>
            <p className="region-flavor">Hương thảo mộc vùng cao, mật ong hoa rừng, hậu vị thanh tao.</p>
            <span className="region-badge">Single Origin</span>
          </div>

          <div className="region-box">
            <span className="region-altitude">1.400m · Khe Sanh</span>
            <h4 className="region-name">Typica Cổ Điển</h4>
            <p className="region-flavor">Hương hoa nhài, vị ngọt cam thảo, axit malic táo xanh thanh khiết.</p>
            <span className="region-badge">SCAA 86+</span>
          </div>

          <div className="region-box">
            <span className="region-altitude">750m · Gia Lai</span>
            <h4 className="region-name">Robusta Pleiku</h4>
            <p className="region-flavor">Gỗ trầm hương, caramel cháy, hậu vị ngọt đậm đà khó quên.</p>
            <span className="region-badge">Đặc Sản Bazan</span>
          </div>

          <div className="region-box">
            <span className="region-altitude">1.500m · Cầu Đất</span>
            <h4 className="region-name">Moka Hoàng Gia</h4>
            <p className="region-flavor">Vua cà phê Việt quý hiếm, hương hoa quý phái, vị chua thanh nhẹ.</p>
            <span className="region-badge">Tuyệt Phẩm Hiếm</span>
          </div>

          <div className="region-box">
            <span className="region-altitude">900m · Đắk Nông</span>
            <h4 className="region-name">Culi Đơn Hạt</h4>
            <p className="region-flavor">Tròn trịa tích tụ tinh hoa, độ đậm gấp đôi, body tròn trịa quyến rũ.</p>
            <span className="region-badge">Đột Biến Tự Nhiên</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">ORCA Platform</div>
            <p className="footer-desc">
              Hệ điều hành số hóa vận hành và giao dịch cà phê đặc sản hàng đầu Việt Nam. Nâng tầm giá trị nông sản bản sắc trên thị trường toàn cầu.
            </p>
          </div>
          <div>
            <div className="footer-col-title">Giải Pháp</div>
            <ul className="footer-links">
              <li><Link to="/marketplace">Sàn Gia Công Cà Phê</Link></li>
              <li><Link to="/forecast">AI Dự Báo Thị Trường</Link></li>
              <li><Link to="/dashboard">Quản Trị Nhóm Xưởng</Link></li>
              <li><Link to="/orders">Hợp Đồng Thông Minh</Link></li>
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Doanh Nghiệp</div>
            <ul className="footer-links">
              <li><Link to="/upgrade">Bảng Giá Dịch Vụ</Link></li>
              <li><Link to="/admin">Cổng Quản Trị Hệ Thống</Link></li>
              <li><Link to="/settings">Quy Chuẩn Bảo Mật</Link></li>
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Liên Hệ</div>
            <ul className="footer-links">
              <li><a href="mailto:contact@orca.coffee">contact@orca.coffee</a></li>
              <li><a href="#">Tây Nguyên · TP. Hồ Chí Minh</a></li>
              <li><a href="#">Hotline: 1900 8888</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 ORCA Specialty Coffee Operating System. All rights reserved.</span>
          <span>Bảo mật dữ liệu chuẩn Enterprise & Truy vết phân tán</span>
        </div>
      </footer>

      {/* FLOATING AI SOMMELIER WIDGET */}
      <div className="floating-ai-sommelier">
        {!isAiOpen ? (
          <button 
            className="btn-ai-sommelier"
            onClick={() => setIsAiOpen(true)}
            aria-label="ORCA AI Sommelier"
            title="Trò chuyện với AI Sommelier"
          >
            <Bot className="w-6 h-6" />
          </button>
        ) : (
          <div className="ai-chat-window">
            <div className="ai-chat-header">
              <div className="ai-chat-title">
                <Coffee className="w-5 h-5" />
                <span>ORCA Coffee Sommelier</span>
              </div>
              <button 
                onClick={() => setIsAiOpen(false)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="ai-chat-body">
              {messages.map((m, idx) => (
                <div key={idx} className={`chat-bubble ${m.role}`}>
                  {m.text}
                </div>
              ))}
              {isThinking && (
                <div className="chat-bubble assistant" style={{ fontStyle: 'italic', color: '#888' }}>
                  Sommelier AI đang phân tích kho hương vị & sàn nguyên liệu...
                </div>
              )}
            </div>

            <form onSubmit={handleSendAi} className="ai-chat-footer">
              <input
                type="text"
                className="ai-chat-input"
                placeholder="Hỏi về hương vị, cách pha, giá hạt..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
              />
              <button type="submit" className="ai-chat-send">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;

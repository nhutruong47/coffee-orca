import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  CheckCircle,
  ClipboardCheck,
  Factory,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Users
} from 'lucide-react';
import orcaLogo from '../assets/orca-logo.png';
import './HomePage.css';
import './UpgradePlanPage.css';

const productionPoster =
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=85';

const solutionPoster =
  'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1600&q=85';

const solutionVideo =
  'https://www.shutterstock.com/shutterstock/videos/4061367707/preview/stock-footage-cafe-workers-standing-near-coffee-machine-station-female-operating-equipment-and-pressing-controls.mp4';

const productionVideo =
  'https://www.shutterstock.com/shutterstock/videos/3852235011/preview/stock-footage-caucasian-man-male-guy-clipboard-inventory-inspection-coffee-warehouse-packaging-shelf-factory.mp4';

const roastingVideo =
  'https://www.shutterstock.com/shutterstock/videos/1107166639/preview/stock-footage-production-of-fresh-fried-coffee-beans-roast-master-opens-roasting-coffee-machine-roasted-coffee.mp4';

const navItems = [
  { label: 'Trang chủ', target: 'hero' },
  { label: 'Giới thiệu', target: 'solution' },
  { label: 'Tính năng', target: 'features' },
  { label: 'Hỏi đáp', target: 'ai' },
  { label: 'Hỗ trợ', target: 'support' }
];

const stats = [
  { label: 'Đơn hàng', value: 'Quản lý tập trung', detail: 'Theo dõi yêu cầu gia công, trạng thái xử lý và lịch bàn giao trong một nơi.', icon: ClipboardCheck },
  { label: 'Nhân viên', value: 'Phân quyền theo vai trò', detail: 'Tách rõ quyền của quản lý xưởng, nhân viên rang, QC, đóng gói và admin.', icon: Users },
  { label: 'Batch', value: 'Theo dõi realtime', detail: 'Cập nhật tiến độ từng mẻ sản xuất từ lúc nhận đơn đến khi hoàn tất QC.', icon: Package },
  { label: 'Xưởng', value: 'Liên kết đa đối tác', detail: 'Kết nối nhiều xưởng gia công để điều phối đơn theo năng lực và lịch sản xuất.', icon: Factory }
];

const problems = [
  'Đơn hàng nằm rải rác giữa chat, file Excel và cuộc gọi nội bộ.',
  'Khó biết batch đang ở công đoạn nào và ai đang phụ trách.',
  'Thông tin QC, mẫu thử và lịch giao hàng không được nối thành một luồng.',
  'Chủ xưởng thiếu số liệu để dự báo công suất và điều phối nhân sự.'
];

const solutions = [
  'Gom đơn hàng, xưởng, nhân viên và batch vào một bảng điều phối duy nhất.',
  'Theo dõi tiến độ từng batch theo thời gian thực, từ nhận nguyên liệu đến bàn giao.',
  'Chuẩn hóa giao việc, QC, tasting notes và lịch giao hàng cho từng đơn sản xuất.'
];

const featureSlides = [
  {
    title: 'Quản lý đơn gia công',
    text: 'Tạo đơn, chọn xưởng, đặt deadline và theo dõi trạng thái trong một luồng ngắn gọn.',
    image: 'https://images.pexels.com/photos/4226787/pexels-photo-4226787.jpeg?auto=compress&cs=tinysrgb&w=1200&fit=crop'
  },
  {
    title: 'Theo dõi batch sản xuất',
    text: 'Nắm profile rang, khối lượng, QC và người phụ trách của từng batch.',
    image: 'https://images.pexels.com/photos/37540261/pexels-photo-37540261.jpeg?auto=compress&cs=tinysrgb&w=1200&fit=crop'
  },
  {
    title: 'Phân quyền nhân viên',
    text: 'Giao việc theo vai trò: quản lý xưởng, QC, đóng gói, giao hàng và admin.',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=85'
  },
  {
    title: 'Báo cáo vận hành',
    text: 'Xem công suất, tỷ lệ trễ hẹn, chất lượng batch và hiệu quả từng xưởng.',
    image: 'https://images.pexels.com/photos/7693142/pexels-photo-7693142.jpeg?auto=compress&cs=tinysrgb&w=1200&fit=crop'
  }
];

const workflowSteps = [
  'Tiếp nhận đơn hàng',
  'Chọn xưởng phù hợp',
  'Giao việc cho nhân viên',
  'Theo dõi batch và QC',
  'Bàn giao và nghiệm thu'
];

const curvedShowcaseImages = [
  {
    title: 'Bảng điều hành sản xuất',
    image: 'https://images.pexels.com/photos/35968323/pexels-photo-35968323.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  },
  {
    title: 'Quản lý đơn hàng',
    image: 'https://images.pexels.com/photos/4226787/pexels-photo-4226787.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  },
  {
    title: 'Giao việc cho nhân viên',
    image: 'https://images.pexels.com/photos/4349948/pexels-photo-4349948.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  },
  {
    title: 'Theo dõi tiến độ sản xuất',
    image: 'https://images.pexels.com/photos/6007664/pexels-photo-6007664.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  },
  {
    title: 'Báo cáo hiệu suất',
    image: 'https://images.pexels.com/photos/7693142/pexels-photo-7693142.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  },
  {
    title: 'Quản lý tồn kho',
    image: 'https://images.pexels.com/photos/2868982/pexels-photo-2868982.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  },
  {
    title: 'Theo dõi chất lượng',
    image: 'https://images.pexels.com/photos/34505585/pexels-photo-34505585.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  },
  {
    title: 'Công suất xưởng',
    image: 'https://images.pexels.com/photos/37540261/pexels-photo-37540261.jpeg?auto=compress&cs=tinysrgb&w=800&fit=crop'
  }
];

const roles = [
  {
    name: 'Quản trị viên',
    text: 'Quản lý người dùng, phân quyền, xưởng đối tác và cấu hình hệ thống.'
  },
  {
    name: 'Quản lý xưởng',
    text: 'Nhận đơn, điều phối batch, theo dõi năng lực sản xuất và tiến độ giao hàng.'
  },
  {
    name: 'Nhân viên sản xuất',
    text: 'Nhận việc, cập nhật công đoạn rang, đóng gói, QC và bàn giao.'
  }
];

const aiFeatures = [
  {
    title: 'Lên kế hoạch sản xuất',
    text: 'AI đề xuất kế hoạch làm việc dựa trên đơn hàng và khả năng sản xuất của xưởng.',
    icon: ClipboardCheck
  },
  {
    title: 'Giao việc cho nhân viên',
    text: 'Tự động phân công công việc cho từng người và theo dõi trạng thái thực hiện.',
    icon: Users
  },
  {
    title: 'Theo dõi tiến độ đơn hàng',
    text: 'Biết đơn hàng nào đang sản xuất, đã hoàn thành đến đâu và công đoạn nào đang bị chậm.',
    icon: BarChart3
  },
  {
    title: 'Cảnh báo sớm vấn đề',
    text: 'Thông báo khi có nguy cơ trễ giao hàng, thiếu nguyên liệu hoặc công việc bị tồn đọng',
    icon: AlertTriangle
  }
];

const workshops = [
  {
    name: 'Arabica Cầu Đất Washed',
    rating: '98%',
    description: 'Cà phê đặc sản với hương hoa nhài, vị chua thanh của cam chanh và hậu vị ngọt kéo dài.',
    tags: ['Light Roast', 'Specialty', '100% Arabica'],
    image: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=1000&q=85'
  },
  {
    name: 'Robusta Honey Fine',
    rating: '96%',
    description: 'Tuyển chọn từ những trái chín mọng, lên men mật ong mang lại thể chất đậm đà, hương chocolate.',
    tags: ['Medium Roast', 'High Caffeine', 'Fine Robusta'],
    image: 'https://images.unsplash.com/photo-1559525839-b184a4d698c7?auto=format&fit=crop&w=1000&q=85'
  },
  {
    name: 'Signature Espresso Blend',
    rating: '99%',
    description: 'Tỷ lệ hoàn hảo 70% Robusta và 30% Arabica. Lớp crema dày mịn, hương vị cân bằng cho pha máy.',
    tags: ['Dark Roast', 'Espresso', 'Blend'],
    image: 'https://images.unsplash.com/photo-1587734195503-904fca47e0e9?auto=format&fit=crop&w=1000&q=85'
  }
];

const pricingPlans = [
  {
    id: 'free',
    name: 'Free',
    price: '0đ',
    priceNote: '/tháng',
    subTitle: 'AI quản lý công việc miễn phí',
    description: 'Dành cho xưởng nhỏ',
    features: [
      'AI tạo task từ đơn hàng',
      'AI giao việc cho nhân viên',
      'Theo dõi tiến độ sản xuất',
      'Quản lý đơn hàng và batch',
      'Báo cáo vận hành cơ bản',
    ],
    accent: 'free',
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '129.000đ',
    priceNote: '/tháng',
    subTitle: 'AI điều phối sản xuất',
    description: 'Dành cho xưởng đang tăng trưởng',
    features: [
      'Cảnh báo công việc có nguy cơ trễ',
      'Cảnh báo thiếu nguyên liệu',
      'Phân tích hiệu suất sản xuất',
      'Phát hiện điểm nghẽn trong quy trình',
      'Đề xuất tối ưu tiến độ và nguồn lực',
    ],
    accent: 'professional',
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Doanh nghiệp',
    price: '249.000đ',
    priceNote: '/tháng',
    subTitle: 'AI quản lý doanh nghiệp',
    description: 'Dành cho doanh nghiệp nhiều xưởng',
    features: [
      'Lập kế hoạch sản xuất dài hạn',
      'Dự báo nhu cầu và công suất',
      'Mô phỏng trước các kịch bản sản xuất',
      'Quản lý nhiều xưởng trên một nền tảng',
      'Thương hiệu riêng cho doanh nghiệp',
    ],
    accent: 'enterprise',
  },
];

const supportOptions = [
  {
    title: 'Hotline hỗ trợ',
    detail: 'Trao đổi nhanh khi cần xử lý tài khoản, thanh toán hoặc lỗi vận hành.',
    action: '0328 416 716',
    icon: Phone,
  },
  {
    title: 'Email hỗ trợ',
    detail: 'Gửi mô tả vấn đề, ảnh màn hình hoặc yêu cầu tích hợp cho đội ORCA.',
    action: 'orca@gmail.com',
    icon: Mail,
  },
  {
    title: 'Hướng dẫn sử dụng',
    detail: 'Thiết lập xưởng, phân quyền nhân viên, tạo đơn và dùng AI lập kế hoạch.',
    action: 'Xem tài liệu',
    icon: ShieldCheck,
  },
  {
    title: 'Triển khai cho xưởng',
    detail: 'Đồng hành cấu hình quy trình, dữ liệu mẫu và luồng bàn giao cho đội sản xuất.',
    action: 'Đặt lịch tư vấn',
    icon: Users,
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [featureIndex, setFeatureIndex] = useState(0);
  const [navScrolled, setNavScrolled] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wheelRef.current) return;
    
    const anim = gsap.to(wheelRef.current, {
      rotation: -360,
      duration: 160,
      ease: 'none',
      repeat: -1,
    });

    const handleMouseEnter = () => anim.pause();
    const handleMouseLeave = () => anim.play();

    const wheelEl = wheelRef.current;
    wheelEl.addEventListener('mouseenter', handleMouseEnter);
    wheelEl.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      wheelEl.removeEventListener('mouseenter', handleMouseEnter);
      wheelEl.removeEventListener('mouseleave', handleMouseLeave);
      anim.kill();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('luxury-home-page');
    document.body.classList.add('luxury-home-page');

    const animatedItems = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.18 }
    );

    animatedItems.forEach((item) => observer.observe(item));

    let frame = 0;
    const updateCamera = () => {
      const scrollY = window.scrollY;
      const max = Math.max(window.innerHeight, 1);
      const pageMax = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(scrollY / max, 1);
      const pageProgress = Math.min(scrollY / pageMax, 1);
      setNavScrolled(scrollY > Math.max(window.innerHeight * 0.58, 280));
      setNavHidden(scrollY > 120);
      document.documentElement.style.setProperty('--coffee-hero-y', `${scrollY * 0.18}px`);
      document.documentElement.style.setProperty('--coffee-hero-scale', (1.05 + progress * 0.12).toFixed(3));
      document.documentElement.style.setProperty('--coffee-copy-y', `${scrollY * -0.045}px`);
      document.documentElement.style.setProperty('--coffee-copy-scale', (1 - progress * 0.025).toFixed(3));
      document.documentElement.style.setProperty('--coffee-story-y', `${(pageProgress - 0.18) * -44}px`);
      document.documentElement.style.setProperty('--coffee-story-scale', (1.02 + pageProgress * 0.08).toFixed(3));
      document.documentElement.style.setProperty('--coffee-cinema-scale', (1.04 + pageProgress * 0.045).toFixed(3));
      frame = 0;
    };

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateCamera);
    };

    updateCamera();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.documentElement.classList.remove('luxury-home-page');
      document.body.classList.remove('luxury-home-page');
      document.documentElement.style.removeProperty('--coffee-hero-y');
      document.documentElement.style.removeProperty('--coffee-hero-scale');
      document.documentElement.style.removeProperty('--coffee-copy-y');
      document.documentElement.style.removeProperty('--coffee-copy-scale');
      document.documentElement.style.removeProperty('--coffee-story-y');
      document.documentElement.style.removeProperty('--coffee-story-scale');
      document.documentElement.style.removeProperty('--coffee-cinema-scale');
      window.removeEventListener('scroll', handleScroll);
      animatedItems.forEach((item) => observer.unobserve(item));
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFeatureIndex((current) => (current + 1) % featureSlides.length);
    }, 3200);

    return () => window.clearInterval(timer);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const featureSlots = [-1, 0, 1].map((offset) => {
    const index = (featureIndex + offset + featureSlides.length) % featureSlides.length;
    return {
      ...featureSlides[index],
      slot: offset === 0 ? 'center' : offset < 0 ? 'left' : 'right'
    };
  });

  return (
    <main className="coffee-home">
      <header className={`coffee-nav${navScrolled ? ' coffee-nav--scrolled' : ''}${navHidden ? ' coffee-nav--hidden' : ''}`} aria-label="Điều hướng chính">
        <div className="coffee-nav__inner">
          <button className="coffee-nav__brand" onClick={() => scrollTo('hero')} aria-label="Trang chủ ORCA">
            <img src={orcaLogo} alt="ORCA" className="coffee-nav__brand-img" />
          </button>

          <nav className="coffee-nav__links" aria-label="Các mục trên trang">
            {navItems.map((item) => (
              <button
                key={item.target}
                className={`coffee-nav__item${item.target === 'hero' ? ' coffee-nav__item--active' : ''}`}
                onClick={() => scrollTo(item.target)}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="coffee-nav__auth" aria-label="Tài khoản">
            <button type="button" onClick={() => navigate('/login')}>Đăng nhập</button>
            <button type="button" onClick={() => navigate('/register')}>Đăng ký</button>
          </div>
        </div>
      </header>

      <section id="hero" className="coffee-hero">
        <div className="coffee-hero__image" aria-hidden="true">
          <video autoPlay muted loop playsInline poster={productionPoster}>
            <source src={productionVideo} type="video/mp4" />
          </video>
        </div>
        <div className="coffee-hero__veil" aria-hidden="true" />

        <div className="coffee-hero__content">
          <span className="coffee-kicker">Coffee Production Management Platform</span>
          <h1>ORCA</h1>
          <p>
            Nền tảng quản lý sản xuất cà phê giúp xưởng, đơn hàng, nhân viên và batch vận hành
            trong một quy trình rõ ràng.
          </p>
          <div className="coffee-hero__actions">
            <button className="coffee-button coffee-button--light" onClick={() => scrollTo('pricing')}>
              Đăng ký dùng thử
            </button>
            <button className="coffee-button coffee-button--ghost" onClick={() => scrollTo('dashboard')}>
              Xem dashboard
            </button>
          </div>
        </div>

        <button className="coffee-scroll-cue" onClick={() => scrollTo('stats')} aria-label="Scroll to statistics">
          <ArrowDown size={18} />
        </button>
      </section>

      <section id="stats" className="coffee-ops-overview">
        <div className="coffee-ops-header" data-reveal="up">
          <span className="coffee-kicker">Năng lực vận hành</span>
          <h2>Các thành phần quản lý cốt lõi của ORCA.</h2>
          <p>Thay vì trình bày số liệu ước tính, trang chủ tập trung vào những nghiệp vụ chính mà hệ thống hỗ trợ.</p>
        </div>

        <div className="coffee-stat-grid">
          {stats.map((item, index) => {
            const Icon = item.icon;
            return (
              <article className="coffee-stat-card" key={item.label} data-reveal="product" style={{ transitionDelay: `${index * 90}ms` }}>
                <div className="coffee-stat-card__top">
                  <Icon size={20} />
                  <span>{item.label}</span>
                </div>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            );
          })}
        </div>

        <div id="problems" className="coffee-problem-panel" data-reveal="up">
          <div className="coffee-problem-panel__intro">
            <span className="coffee-kicker">Vấn đề khách hàng gặp</span>
            <h2>Khi sản xuất tăng tốc, dữ liệu bắt đầu rời rạc.</h2>
            <p>Các đội cà phê thường mất thời gian để nối lại thông tin giữa người bán, quản lý xưởng, QC và đóng gói.</p>
          </div>
          <div className="coffee-problem-list">
            {problems.map((problem, index) => (
              <article className="coffee-problem-row" key={problem}>
                <strong>{String(index + 1).padStart(2, '0')}</strong>
                <p>{problem}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="solution" className="coffee-story coffee-story--solution">
        <div className="coffee-story__media" data-reveal="left">
          <video autoPlay muted loop playsInline poster={solutionPoster} aria-label="Cafe workers operating a coffee machine station">
            <source src={solutionVideo} type="video/mp4" />
          </video>
        </div>
        <div className="coffee-story__copy" data-reveal="right">
          <span className="coffee-kicker">Giải pháp ORCA</span>
          <h2>Một hệ điều hành cho xưởng cà phê.</h2>
          <p>
            ORCA chuẩn hóa toàn bộ vòng đời sản xuất: từ nhận đơn, phân công, theo dõi batch,
            QC đến bàn giao. Đội vận hành biết việc nào đang chạy, ai phụ trách và điểm nghẽn nằm ở đâu.
          </p>
          <div className="coffee-solution-list">
            {solutions.map((solution) => (
              <div key={solution}>
                <CheckCircle size={18} />
                <span>{solution}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="coffee-features">
        <div className="coffee-section-heading coffee-section-heading--center" data-reveal="up">
          <span className="coffee-kicker">Các tính năng chính</span>
          <h2>Quản lý vận hành</h2>
        </div>

        <div className="coffee-feature-carousel" aria-label="Tính năng ORCA tự động chuyển động">
          {featureSlots.map((slide) => (
            <article className={`coffee-feature-slide coffee-feature-slide--${slide.slot}`} key={`${slide.title}-${slide.slot}`}>
              <img src={slide.image} alt={slide.title} />
              <div>
                <h3>{slide.title}</h3>
                <p>{slide.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="roles" className="coffee-roles">
        <div className="coffee-section-heading" data-reveal="up">
          <div>
            <span className="coffee-kicker">Role Management</span>
            <h2>Phân quyền rõ ràng cho từng nhóm người dùng.</h2>
            <p>Mỗi vai trò chỉ nhìn thấy đúng phần việc cần xử lý, giúp giảm nhầm lẫn khi nhiều bộ phận cùng tham gia sản xuất.</p>
          </div>
        </div>

        <div className="coffee-role-grid">
          {roles.map((role, index) => (
            <article className="coffee-role-card" key={role.name} data-reveal="product" style={{ transitionDelay: `${index * 100}ms` }}>
              <ShieldCheck size={22} />
              <h3>{role.name}</h3>
              <p>{role.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="production" className="coffee-story coffee-story--production production-studio">
        <div className="production-studio__glow" aria-hidden="true" />
        <div className="production-studio__media" data-reveal="left">
          <article className="studio-video-card studio-video-card--main">
            <video autoPlay muted loop playsInline poster={productionPoster}>
              <source src={productionVideo} type="video/mp4" />
            </video>
            <div className="studio-video-card__shade" />
            <div className="studio-video-card__meta">
              <span>Warehouse check</span>
              <strong>Clipboard inventory</strong>
            </div>
          </article>

          <article className="studio-video-card studio-video-card--float">
            <video autoPlay muted loop playsInline poster={productionPoster}>
              <source src={roastingVideo} type="video/mp4" />
            </video>
            <div className="studio-video-card__shade" />
            <div className="studio-video-card__meta">
              <span>Batch camera</span>
              <strong>Roast flow</strong>
            </div>
          </article>

          <div className="studio-signal-card studio-signal-card--top">
            <ClipboardCheck size={18} />
            <span>QC synced</span>
          </div>
          <div className="studio-signal-card studio-signal-card--bottom">
            <BarChart3 size={18} />
            <span>Live capacity</span>
          </div>
        </div>
        <div className="coffee-story__copy production-studio__copy" data-reveal="right">
          <span className="coffee-kicker">Workflow sản xuất</span>
          <h2>Giao việc, chạy batch, kiểm tra tiến độ.</h2>
          <p>
            Mỗi đơn hàng được chuyển thành workflow rõ ràng để quản lý xưởng, nhân viên rang,
            QC và đóng gói cùng nhìn một nguồn dữ liệu.
          </p>
          <div className="coffee-workflow-list production-studio__workflow">
            {workflowSteps.map((step, index) => (
              <div key={step} style={{ transitionDelay: `${index * 80}ms` }}>
                <strong>{index + 1}</strong>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="dashboard" className="coffee-dashboard-curved">
        <div className="coffee-curved-heading" data-reveal="up">
          <span className="coffee-kicker">Mọi hoạt động sản xuất trong một hệ thống duy nhất</span>
          <h2>Theo dõi đơn hàng, giao việc, tiến độ sản xuất và báo cáo vận hành từ một nơi duy nhất.</h2>
        </div>
        
        <div className="coffee-curved-wheel-container">
          <div className="coffee-curved-wheel" ref={wheelRef}>
            {[...Array(6)].map((_, setIndex) => 
              curvedShowcaseImages.map((item, i) => {
                const globalIndex = setIndex * curvedShowcaseImages.length + i;
                return (
                  <article 
                    className="coffee-curved-card" 
                    key={`${setIndex}-${i}`}
                    style={{ transform: `rotate(${globalIndex * 7.5}deg)` }}
                  >
                    <div className="card-inner">
                      <img src={item.image} alt={item.title} />
                      <div className="glass-label">{item.title}</div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section id="ai" className="coffee-ai-section">
        <div className="coffee-ai-hero" data-reveal="up">
          <div>
            <span className="coffee-kicker">Công nghệ AI</span>
            <h2>AI hỗ trợ quản lý sản xuất cà phê.</h2>
            <p>
              ORCA giúp chủ xưởng biết hôm nay cần làm gì, ai đang làm việc gì và đơn hàng nào có nguy cơ bị chậm.
            </p>
          </div>
          <div className="coffee-ai-orb" aria-hidden="true">
            <Brain size={58} />
            <Sparkles size={22} />
          </div>
        </div>

        <div className="coffee-ai-grid">
          {aiFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article className="coffee-ai-card" key={feature.title} data-reveal="product" style={{ transitionDelay: `${index * 90}ms` }}>
                <Icon size={22} />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="workshops" className="coffee-workshops">
        <div className="coffee-section-heading" data-reveal="up">
          <div>
            <span className="coffee-kicker">Sản phẩm nổi bật</span>
            <h2>Các sản phẩm nổi tiếng trên thị trường.</h2>
            <p>Những dòng sản phẩm cà phê chất lượng cao được đánh giá tốt nhất.</p>
          </div>
          <button className="coffee-text-link" onClick={() => navigate('/login?returnUrl=/dat-hang')}>
            Xem tất cả sản phẩm <ArrowRight size={18} />
          </button>
        </div>

        <div className="coffee-workshop-grid">
          {workshops.map((workshop, index) => (
            <article className="coffee-workshop-card" key={workshop.name} data-reveal="product" style={{ transitionDelay: `${index * 120}ms` }}>
              <div className="coffee-workshop-card__image">
                <img src={workshop.image} alt={workshop.name} />
                <span>Best Seller</span>
              </div>
              <div className="coffee-workshop-card__body">
                <div className="coffee-workshop-card__title">
                  <h3>{workshop.name}</h3>
                  <small><Star size={13} fill="currentColor" /> {workshop.rating}</small>
                </div>
                <p>{workshop.description}</p>
                <div className="coffee-workshop-card__tags">
                  {workshop.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="coffee-pricing">
        <div className="coffee-section-heading coffee-section-heading--center" data-reveal="up">
          <span className="coffee-kicker">Pricing</span>
          <h2>Chọn gói phù hợp với quy mô vận hành.</h2>
        </div>
        <div className="upgrade-grid" style={{ padding: '20px 0' }}>
          {pricingPlans.map((plan, index) => (
            <article
              key={plan.id}
              className={`plan-card accent-${plan.accent}${plan.featured ? ' featured' : ''}`}
              data-reveal="product"
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              {plan.featured && (
                <div className="plan-badge-wrapper">
                  <span className="plan-badge">★ Phổ biến nhất</span>
                </div>
              )}

              <div className="plan-name">{plan.name}</div>

              <div className="plan-price">
                <strong className="price-value">{plan.price}</strong>
                <span className="price-note">{plan.priceNote}</span>
              </div>

              <div className="plan-sub-info">
                <div className="plan-subtitle">{plan.subTitle}</div>
                <p className="plan-description">{plan.description}</p>
              </div>

              <button
                type="button"
                className="plan-action"
                onClick={() => navigate('/login?returnUrl=/upgrade')}
              >
                {plan.id === 'free' ? 'Bắt đầu' : 'Nâng cấp ngay'}
              </button>

              <ul className="plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span className="feature-check-circle">
                      <Check size={10} strokeWidth={4} />
                    </span>
                    <span className="feature-text">{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="support" className="coffee-support">
        <div className="coffee-section-heading coffee-section-heading--center" data-reveal="up">
          <span className="coffee-kicker">Support</span>
          <h2>Luôn có đội hỗ trợ khi xưởng cần xử lý nhanh.</h2>
        </div>

        <div className="coffee-support-grid">
          {supportOptions.map((item, index) => {
            const Icon = item.icon;

            return (
              <article className="coffee-support-card" key={item.title} data-reveal="product" style={{ transitionDelay: `${index * 80}ms` }}>
                <span className="coffee-support-icon">
                  <Icon size={22} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <strong>{item.action}</strong>
              </article>
            );
          })}
        </div>
      </section>

      <section id="reserve" className="coffee-reserve">
        <div className="coffee-reserve__inner" data-reveal="up">
          <img className="coffee-reserve__logo" src={orcaLogo} alt="" aria-hidden="true" />
          <h2>Đăng ký dùng thử ORCA.</h2>
          <p>Trải nghiệm quy trình quản lý xưởng, đơn hàng, nhân viên và batch sản xuất trong một workspace.</p>
          <button className="coffee-button coffee-button--dark" onClick={() => navigate('/register')}>
            Đăng ký dùng thử
          </button>
        </div>
        <Sprout className="coffee-reserve__mark" size={160} aria-hidden="true" />
      </section>

      <footer id="contact" className="coffee-contact-footer">
        <div className="coffee-contact-footer__veil" aria-hidden="true" />
        <div className="coffee-contact-footer__inner" data-reveal="up">
          <div className="orca-footer-content">
            <div className="orca-footer-info">
              <div className="orca-footer-brand">
                <img src={orcaLogo} alt="ORCA" className="orca-footer-logo" />
                <span className="orca-footer-name">ORCA</span>
              </div>
              <p className="orca-footer-tagline">Điều phối sản xuất cà phê bằng AI.</p>
              
              <ul className="orca-footer-details">
                <li>
                  <MapPin size={20} className="footer-icon" />
                  <div>
                    <strong>KTX Khu B, ĐHQG-HCM</strong>
                    <p>Đường Mạc Đĩnh Chi, Phường Đông Hòa, TP. Hồ Chí Minh</p>
                  </div>
                </li>
                <li>
                  <Phone size={20} className="footer-icon" />
                  <span>0328 416 716</span>
                </li>
                <li>
                  <Mail size={20} className="footer-icon" />
                  <span>orca@gmail.com</span>
                </li>
              </ul>
            </div>

            <div className="orca-footer-links">
              <h3 className="footer-heading">Hỗ trợ</h3>
              <ul>
                <li><a href="#!" onClick={e => e.preventDefault()}>Trung tâm trợ giúp</a></li>
                <li><a href="#!" onClick={e => e.preventDefault()}>Hướng dẫn sử dụng</a></li>
                <li><a href="#!" onClick={e => e.preventDefault()}>Cộng đồng ORCA</a></li>
                <li><a href="#!" onClick={e => e.preventDefault()}>Chính sách bảo mật</a></li>
                <li><a href="#!" onClick={e => e.preventDefault()}>Điều khoản dịch vụ</a></li>
              </ul>
            </div>

            <div className="orca-footer-map">
              <iframe
                src="https://www.google.com/maps?q=KTX+Khu+B+ĐHQG-HCM,+Mạc+Đĩnh+Chi,+Đông+Hòa,+TP.HCM&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0, borderRadius: '16px', minHeight: '300px' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="ORCA Location"
              ></iframe>
            </div>
          </div>
          
          <div className="orca-footer-bottom">
            <p>&copy; 2026 ORCA. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}

export interface BrandInfo {
    name: string;
    desc: string;
    emoji: string;
}

export interface BrandLogo {
    key: string;
    top: string;
    bottom: string;
    src: string;
}

export const COFFEE_BRANDS: BrandInfo[] = [
    { name: 'Trung Nguyên Legend', desc: 'Thương hiệu cà phê số 1 Việt Nam', emoji: 'TN' },
    { name: 'Highlands Coffee', desc: 'Chuỗi cà phê hiện đại hàng đầu', emoji: 'HC' },
    { name: 'Phúc Long Heritage', desc: 'Di sản cà phê & trà Việt', emoji: 'PL' },
    { name: 'The Coffee House', desc: 'Không gian cà phê sáng tạo', emoji: 'CH' },
    { name: 'Cà Phê Đắk Lắk', desc: 'Thủ phủ cà phê Tây Nguyên', emoji: 'DL' },
    { name: 'Lavazza (Italy)', desc: 'Hương vị Espresso đỉnh cao', emoji: 'LV' },
];

export const COFFEE_BRAND_LOGOS: BrandLogo[] = [
    {
        key: 'trung-nguyen',
        top: 'TRUNG',
        bottom: 'NGUYEN',
        src: 'https://cdn.haitrieu.com/wp-content/uploads/2022/01/Logo-Trung-Nguyen-Ori.png',
    },
    {
        key: 'highlands',
        top: 'Highlands',
        bottom: 'COFFEE',
        src: 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Highlands_Coffee_5G.svg',
    },
    {
        key: 'phuc-long',
        top: 'PHUC',
        bottom: 'LONG',
        src: 'https://congtyquatang.com.vn/wp-content/uploads/2026/04/logo-phuc-long-vector-04.jpg',
    },
    {
        key: 'coffee-house',
        top: 'THE',
        bottom: 'COFFEE HOUSE',
        src: 'https://upload.wikimedia.org/wikipedia/commons/9/97/The_Coffee_House_logo.svg',
    },
    {
        key: 'dak-lak',
        top: 'DAKLAK',
        bottom: 'COFFEE',
        src: 'https://upload.wikimedia.org/wikipedia/commons/8/86/Emblem_of_Daklak_Province.svg',
    },
    {
        key: 'lavazza',
        top: 'LAVAZZA',
        bottom: 'ITALY',
        src: 'https://upload.wikimedia.org/wikipedia/commons/0/04/Lavazza_-_logo_%28Italy%2C_1995%29.svg',
    },
];

export interface HeroStat {
    value: string;
    label: string;
}

export const HERO_STATS: HeroStat[] = [
    { value: '500+', label: 'Xưởng sử dụng' },
    { value: '10K+', label: 'Đơn hàng/tháng' },
    { value: '99.9%', label: 'Uptime' },
];

export const HERO_DESCRIPTION =
    'Tích hợp AI để tối ưu quy trình sản xuất, quản lý nguyên liệu, theo dõi đơn hàng và phân công công việc tự động.';

export const HERO_TITLE = (
    <>
        Nền tảng quản lý
        <br />
        <span className="login-hero-highlight">xưởng cà phê</span>
        <br />
        thông minh
    </>
);
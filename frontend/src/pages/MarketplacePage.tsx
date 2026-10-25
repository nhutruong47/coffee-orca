// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { inventoryService, teamService } from '../services/groupService';
import { interGroupOrderService, reviewService, manufacturingRequestService } from '../services/interGroupOrderService';
import type { Team, InterGroupOrder, InventoryItem, Review, ReviewSummary } from '../types/types';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import './Marketplace.css';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useRef } from 'react';

type FactoryProfileTab = 'overview' | 'capabilities' | 'equipment' | 'certificates' | 'reviews' | 'portfolio' | 'rfq';
type AvailabilityStatus = 'AVAILABLE' | 'LIMITED' | 'FULLY_BOOKED' | 'UNKNOWN';

type ManufacturingRequest = {
    id: string;
    type: string;
    title: string;
    coffeeType: string;
    quantity: string;
    deadline: string;
    region: string;
    details: string;
    createdAt: string;
    buyerTeamId?: string;
};

type RfqStep = 1 | 2 | 3;

const RFQ_STEP_LABELS: { step: RfqStep; title: string; description: string }[] = [
    { step: 1, title: 'Yêu cầu', description: 'Dịch vụ và sản lượng' },
    { step: 2, title: 'Chi tiết', description: 'Rang, đóng gói, ngân sách' },
    { step: 3, title: 'Giao nhận', description: 'Liên hệ và địa chỉ' },
];

const toApiLocalDateTime = (value: string) => {
    if (!value) return undefined;
    if (value.includes('T')) return value.length === 16 ? `${value}:00` : value;
    return `${value}T00:00:00`;
};

type MarketplaceFactory = Team & {
    rating?: number;
    monthlyCapacity?: string;
    availableCapacity?: string;
    moq?: string;
    onTimeRate?: number;
    avgResponseTime?: string;
    repeatCustomerRate?: number;
    availabilityStatus?: AvailabilityStatus;
    coffeeTypes?: string[];
    services?: string[];
    roasters?: string[];
    packagingMachines?: string[];
    grinders?: string[];
    qcEquipment?: string[];
    certifications?: string[];
    verifiedFactory?: boolean;
    verifiedBusiness?: boolean;
    verifiedAddress?: boolean;
    verifiedCertification?: boolean;
    portfolioProjects?: string[];
    notableCustomers?: string[];
    processedCoffeeLines?: string[];
    reviews?: { author: string; content: string; rating?: number; date?: string; company?: string }[];

    // New Mock Fields for B2B Redesign
    trustScoreMock?: number;
    ratingMock?: number;
    reviewCountMock?: number;
    completedOrdersMock?: number;
    onTimeRateMock?: number;
    currentCapacityMock?: string;
    availableCapacityMock?: string;
    moqMock?: string;
    leadTimeMock?: string;
    statusBadgeMock?: 'Receiving Orders' | 'Nearly Full' | 'Temporarily Unavailable';
    specializationsMock?: string[];
    yearsInOperationMock?: number;
    employeeCountMock?: number;
    factorySizeMock?: string;

    capabilitiesMock?: {
        services: string[];
        coffeeTypes: string[];
        packagingFormats: string[];
    };
    equipmentMock?: {
        roasters: { model: string; capacity: string; year: string }[];
        packaging: string[];
        grinders: string[];
        qc: string[];
    };
    certificatesMock?: { name: string; issueDate: string; expDate: string; status: string }[];
    portfolioMock?: { name: string; type: string; image: string }[];
    reviewsMock?: { author: string; content: string; rating?: number; date?: string; company?: string }[];
};

const REGION_OPTIONS = ['Lâm Đồng', 'Đắk Lắk', 'Gia Lai', 'Kon Tum', 'Đồng Nai', 'Bình Dương', 'TP HCM', 'Khác'];
const FACTORY_TYPE_OPTIONS = [
    'Xưởng rang cà phê',
    'Xưởng gia công OEM',
    'Nhà máy chế biến',
    'Hợp tác xã',
    'Doanh nghiệp xuất khẩu',
    'Nhà cung cấp thiết bị',
];
const SPECIALTY_OPTIONS = [
    'Rang cà phê',
    'Gia công OEM',
    'Đóng gói',
    'Xay cà phê',
    'Sản xuất Private Label',
    'QC kiểm định',
    'Xuất khẩu',
    'Cung ứng cà phê nhân',
    'Thiết kế bao bì',
];
const CERTIFICATE_OPTIONS = ['HACCP', 'ISO 22000', 'ISO 9001', 'OCOP', 'FDA', 'Khác'];

const RFQ_SERVICE_OPTIONS = [
    { value: 'Roasting', label: 'Rang cà phê (Roasting)' },
    { value: 'Packaging', label: 'Đóng gói (Packaging)' },
    { value: 'OEM', label: 'Gia công OEM' },
    { value: 'Private Label', label: 'Private Label' },
    { value: 'Grinding', label: 'Xay cà phê (Grinding)' },
    { value: 'Green Coffee', label: 'Mua cà phê nhân' },
    { value: 'Blend Development', label: 'Phối trộn blend' },
    { value: 'Sample Roasting', label: 'Rang mẫu / Test profile' },
    { value: 'QC Cupping', label: 'QC / Cupping' },
    { value: 'Drying', label: 'Sấy / sơ chế' },
    { value: 'Other', label: 'Khác' },
];
const RFQ_UNIT_OPTIONS = [
    { value: 'kg', label: 'kg' },
    { value: 'ton', label: 'Tấn (Ton)' },
    { value: 'bag', label: 'Bao' },
    { value: 'package', label: 'Gói' },
    { value: 'batch', label: 'Mẻ / Batch' },
];
const COFFEE_TYPE_OPTIONS = [
    { value: 'Arabica', label: 'Arabica' },
    { value: 'Robusta', label: 'Robusta' },
    { value: 'Liberica', label: 'Liberica' },
    { value: 'Excelsa', label: 'Excelsa' },
    { value: 'Blend', label: 'Blend (Phối trộn)' },
    { value: 'Arabica Specialty', label: 'Arabica Specialty' },
    { value: 'Fine Robusta', label: 'Fine Robusta' },
    { value: 'Culi / Peaberry', label: 'Culi / Peaberry' },
    { value: 'Moka', label: 'Moka' },
    { value: 'Catimor', label: 'Catimor' },
    { value: 'Bourbon', label: 'Bourbon' },
    { value: 'Typica', label: 'Typica' },
    { value: 'Caturra', label: 'Caturra' },
    { value: 'Gesha / Geisha', label: 'Gesha / Geisha' },
    { value: 'Ethiopia Heirloom', label: 'Ethiopia Heirloom' },
    { value: 'Colombia Supremo', label: 'Colombia Supremo' },
    { value: 'Brazil Santos', label: 'Brazil Santos' },
    { value: 'Vietnam Robusta', label: 'Vietnam Robusta' },
    { value: 'Green Coffee Beans', label: 'Cà phê nhân xanh' },
    { value: 'Roasted Beans', label: 'Cà phê rang nguyên hạt' },
    { value: 'Ground Coffee', label: 'Cà phê rang xay' },
    { value: 'Instant Coffee', label: 'Cà phê hòa tan' },
    { value: 'Other', label: 'Khác' },
];
const ROAST_PROFILE_OPTIONS = [
    { value: 'Light', label: 'Light Roast' },
    { value: 'Medium Light', label: 'Medium Light' },
    { value: 'Medium', label: 'Medium Roast' },
    { value: 'Medium Dark', label: 'Medium Dark' },
    { value: 'Dark', label: 'Dark Roast' },
    { value: 'Espresso Roast', label: 'Espresso Roast' },
    { value: 'Custom', label: 'Theo profile riêng' },
];
const PACKAGING_FORMAT_OPTIONS = [
    { value: '100g', label: 'Túi 100g' },
    { value: '250g', label: 'Túi 250g' },
    { value: '500g', label: 'Túi 500g' },
    { value: '1kg', label: 'Túi 1kg' },
    { value: '5kg', label: 'Bao 5kg' },
    { value: '10kg', label: 'Bao 10kg' },
    { value: '20kg', label: 'Bao 20kg' },
    { value: '25kg', label: 'Bao 25kg' },
    { value: '50kg', label: 'Bao 50kg' },
    { value: 'Drip bag', label: 'Drip bag' },
    { value: 'Capsule', label: 'Capsule / Pod' },
    { value: 'Tin can', label: 'Lon thiếc' },
    { value: 'Private Label', label: 'Bao bì private label' },
    { value: 'Custom', label: 'Khác (Custom)' },
];

const profileTabLabels: Record<FactoryProfileTab, string> = {
    overview: 'Tổng quan',
    capabilities: 'Năng lực',
    equipment: 'Máy móc thiết bị',
    certificates: 'Chứng nhận',
    reviews: 'Đánh giá',
    portfolio: 'Dự án (Portfolio)',
    rfq: 'Gửi yêu cầu',
};

const verificationStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
        NOT_SUBMITTED: 'Chưa gửi',
        PENDING: 'Đang chờ quản trị viên duyệt',
        APPROVED: 'Đã xác minh',
        REJECTED: 'Bị từ chối',
    };
    return labels[status] || status;
};

const fallbackFactoryImages = [
    'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1514432324607-a09d9b4aefda?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1504630083234-14187a9df0f5?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1497515114889-1c06568a37b8?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1511537190424-bbbab87ac5eb?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=900&q=85',
    'https://images.unsplash.com/photo-1507133750050-4a2ce37285f1?auto=format&fit=crop&w=900&q=85'
];

const getFactoryImageSeed = (factory: any) => {
    if (!factory) return 0;
    if (factory.id) {
        let hash = 0;
        for (let i = 0; i < factory.id.length; i++) {
            hash = factory.id.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
    }
    return (factory.name?.length || 0) + (factory.completedOrders || 0) + (factory.completedOrdersMock || 0);
};

const getFactoryCardImage = (factory: any) =>
    factory?.factoryImageUrl
    || factory?.factoryImages?.[0]
    || fallbackFactoryImages[getFactoryImageSeed(factory) % fallbackFactoryImages.length];

const handleFactoryImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const target = event.currentTarget;
    if (target.dataset.localFallback === 'true') return;
    target.dataset.localFallback = 'true';
    target.src = '/coffee-hero.png';
};

const marketplaceCategories = [
    { label: 'Tất cả', icon: 'all_inclusive' },
    { label: 'Nguyên liệu', icon: 'eco' },
    { label: 'Dịch vụ rang', icon: 'local_cafe' },
    { label: 'Dịch vụ đóng gói', icon: 'package' },
    { label: 'Dịch vụ trọn gói', icon: 'star' },
    { label: 'Đăng nhu cầu', icon: 'assignment' },
];

// Removed static featuredProducts array
const splitMultiValue = (value?: string | string[]) => {
    if (Array.isArray(value)) return value.filter(Boolean).map(item => item.trim()).filter(Boolean);
    if (!value) return [];
    return value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean);
};

const toggleListValue = (values: string[], value: string) => (
    values.includes(value) ? values.filter(item => item !== value) : [...values, value]
);

const buildCapacityLabel = (team: Team) => {
    if (team.capacityValue && team.capacityUnit) return `${team.capacityValue} ${team.capacityUnit}`;
    return team.capacity || undefined;
};

const normalizeFactory = (team: Team): MarketplaceFactory => {
    let meta: any = {};
    if (team.metadata) {
        try {
            meta = JSON.parse(team.metadata);
        } catch (e) {
            // ignore malformed metadata
        }
    }

    return {
        ...team,
        monthlyCapacity: buildCapacityLabel(team),
        services: splitMultiValue(team.specialty),
        availabilityStatus: 'UNKNOWN',
        verifiedFactory: team.verificationStatus === 'APPROVED',
        verifiedBusiness: team.verificationStatus === 'APPROVED' && Boolean(team.businessLicense),
        verifiedAddress: team.verificationStatus === 'APPROVED' && Boolean(team.businessAddress),
        verifiedCertification: team.verificationStatus === 'APPROVED' && Boolean(team.certificationDocument || team.certificates?.length),
        certifications: team.certificates?.length ? team.certificates : splitMultiValue(team.certificationDocument),

        trustScoreMock: team.trustScore || 85,
        ratingMock: team.rating || 4.5,
        reviewCountMock: team.reviewCount || 10,
        completedOrdersMock: team.completedOrders || 20,
        onTimeRateMock: team.completedOrders ? Math.round(((team.totalOrders || 0) - (team.cancelledOrders || 0)) / team.completedOrders * 100) : 90,
        currentCapacityMock: team.capacityValue ? `${team.capacityValue} ${team.capacityUnit}` : '5 Tấn / Tháng',
        availableCapacityMock: "1 Tấn",
        moqMock: team.moq || "50 kg",
        leadTimeMock: team.leadTime || "5 - 10 Ngày",
        statusBadgeMock: (team.statusBadge as 'Receiving Orders' | 'Nearly Full' | 'Temporarily Unavailable') || 'Receiving Orders',
        specializationsMock: splitMultiValue(team.specialty).length > 0 ? splitMultiValue(team.specialty) : ['Arabica Specialty', 'OEM Coffee'],
        yearsInOperationMock: team.yearsInOperation || 2,
        employeeCountMock: team.employeeCount || 10,
        factorySizeMock: team.factorySize || "500 m2",

        capabilitiesMock: meta.capabilitiesMock || {
            services: splitMultiValue(team.specialty).length > 0 ? splitMultiValue(team.specialty) : ['Rang cà phê', 'Đóng gói', 'Gia công OEM'],
            coffeeTypes: COFFEE_TYPE_OPTIONS.slice(0, 16).map(option => option.label),
            packagingFormats: PACKAGING_FORMAT_OPTIONS.map(option => option.label)
        },
        equipmentMock: meta.equipmentMock || {
            roasters: [],
            packaging: [],
            grinders: [],
            qc: []
        },
        certificatesMock: meta.certificatesMock || [],
        portfolioMock: meta.portfolioMock || [],
        reviewsMock: meta.reviewsMock || []
    };
};

const getCompletionRate = (factory: MarketplaceFactory) => {
    if (!factory.totalOrders) return undefined;
    return Math.round(((factory.completedOrders || 0) / factory.totalOrders) * 100);
};

const getTrustScore = (factory: MarketplaceFactory) => {
    if (!factory.totalOrders) return undefined;
    if (typeof factory.trustScore === 'number') return factory.trustScore;
    return getCompletionRate(factory);
};

const availabilityCopy = (status?: AvailabilityStatus) => {
    switch (status) {
        case 'AVAILABLE':
            return { label: 'Còn nhận đơn', className: 'available' };
        case 'LIMITED':
            return { label: 'Công suất hạn chế', className: 'limited' };
        case 'FULLY_BOOKED':
            return { label: 'Fully Booked', className: 'booked' };
        default:
            return { label: 'Chưa cập nhật', className: 'unknown' };
    }
};

const emptyValue = <span className="mp-empty-value">Chưa cập nhật</span>;


const displayPercent = (value?: number) => (typeof value === 'number' ? `${value}%` : emptyValue);
const displayText = (value?: any) => (value || value === 0 ? value : emptyValue);

const loadRequests = async (): Promise<ManufacturingRequest[]> => {
    try {
        const data = await manufacturingRequestService.getAll();
        return data as ManufacturingRequest[];
    } catch {
        return [];
    }
};

const translations = {
    vi: {
        trustScore: 'Điểm uy tín',
        rating: 'Đánh giá',
        orders: 'Đơn hàng',
        onTime: 'Đúng hạn',
        availableCapacity: 'Công suất trống',
        moq: 'SL tối thiểu',
        leadTime: 'Thời gian giao',
        roastery: 'Xưởng rang cà phê',
        vietnam: 'Việt Nam',
        yearsInOperation: 'Năm hoạt động',
        viewCapacity: 'Xem năng lực',
        sendRequest: 'Gửi yêu cầu',
        verifiedFactory: 'Xưởng đã xác thực',
        manageFactory: 'Quản lý xưởng',
        Receiving_Orders: 'Đang nhận đơn',
        Nearly_Full: 'Sắp kín lịch',
        Temporarily_Unavailable: 'Tạm ngưng',
        Arabica_Specialty: 'Arabica Đặc sản',
        OEM_Coffee: 'Gia công OEM'
    },
    en: {
        trustScore: 'Trust Score',
        rating: 'Rating',
        orders: 'Orders',
        onTime: 'On-time',
        availableCapacity: 'Available Capacity',
        moq: 'MOQ',
        leadTime: 'Lead Time',
        roastery: 'Roastery',
        vietnam: 'Vietnam',
        yearsInOperation: 'Years Operating',
        viewCapacity: 'View Capacity',
        sendRequest: 'Send Request',
        verifiedFactory: 'Verified Factory',
        manageFactory: 'Manage Factory',
        Receiving_Orders: 'Receiving Orders',
        Nearly_Full: 'Nearly Full',
        Temporarily_Unavailable: 'Temporarily Unavailable',
        Arabica_Specialty: 'Arabica Specialty',
        OEM_Coffee: 'OEM Coffee'
    }
};

export default function MarketplacePage() {
    const container = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        const tl = gsap.timeline();
        tl.from('.mp-market-hero-copy h1, .mp-market-hero-copy p', { y: 30, opacity: 0, duration: 0.8, stagger: 0.2, ease: 'power3.out' })
          .from('.mp-top-search', { scaleX: 0.95, opacity: 0, duration: 0.5, ease: 'power2.out' }, '-=0.4')
          .from('.mp-factory-card', { y: 40, opacity: 0, duration: 0.6, stagger: 0.05, ease: 'power3.out' }, '-=0.2');
    }, { scope: container });

    const { user } = useAuth();
    const navigate = useNavigate();
    const [language, setLanguage] = useState<'vi' | 'en'>('vi');
    const t = translations[language] as Record<string, string>;

    const [allTeams, setAllTeams] = useState<Team[]>([]);
    const [myTeams, setMyTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [regionFilter, setRegionFilter] = useState('');
    const [factoryTypeFilter, setFactoryTypeFilter] = useState('');
    const [specialtyFilter, setSpecialtyFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [minCapacityFilter, setMinCapacityFilter] = useState('');
    const [verifiedFilter, setVerifiedFilter] = useState('');
    const [certificateFilter, setCertificateFilter] = useState('');
    const [minRatingFilter, setMinRatingFilter] = useState('');
    const [selectedFactory, setSelectedFactory] = useState<MarketplaceFactory | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [showProductFactories, setShowProductFactories] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [activeProfileTab, setActiveProfileTab] = useState<FactoryProfileTab>('overview');
    const [compareIds, setCompareIds] = useState<string[]>([]);

    const [manufacturingRequests, setManufacturingRequests] = useState<ManufacturingRequest[]>([]);

    const [showChatModal, setShowChatModal] = useState(false);
    const [chatTarget, setChatTarget] = useState<MarketplaceFactory | null>(null);
    const [chatDraft, setChatDraft] = useState('');
    const [chatMessages, setChatMessages] = useState<{sender: 'me' | 'other', text: string}[]>([]);
    const [factoryReviewsSummary, setFactoryReviewsSummary] = useState<Record<string, ReviewSummary>>({});
    const [factoryReviews, setFactoryReviews] = useState<Record<string, Review[]>>({});
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
    const [editReviewRating, setEditReviewRating] = useState(5);
    const [editReviewStatus, setEditReviewStatus] = useState<'ON_TIME' | 'LATE' | 'NOT_DELIVERED'>('ON_TIME');
    const [editReviewComment, setEditReviewComment] = useState('');

    const [showOrderModal, setShowOrderModal] = useState(false);
    const [selectedSeller, setSelectedSeller] = useState<Team | null>(null);
    const [buyerTeamId, setBuyerTeamId] = useState('');
    const [rfqStep, setRfqStep] = useState<RfqStep>(1);
    const [rfqTitle, setRfqTitle] = useState('');
    const [rfqRequestType, setRfqRequestType] = useState(RFQ_SERVICE_OPTIONS[0].value);
    const [rfqProductName, setRfqProductName] = useState('');
    const [rfqQuantity, setRfqQuantity] = useState(1);
    const [rfqUnit, setRfqUnit] = useState(RFQ_UNIT_OPTIONS[0].value);
    const [rfqDeadline, setRfqDeadline] = useState('');
    const [rfqBudget, setRfqBudget] = useState('');
    const [rfqQuality, setRfqQuality] = useState('');
    const [rfqPackaging, setRfqPackaging] = useState('');
    const [rfqNote, setRfqNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showAiMatching, setShowAiMatching] = useState(false);
    const [aiMatchingProgress, setAiMatchingProgress] = useState(0);

    // Delivery profile fields
    const [deliveryPhone, setDeliveryPhone] = useState('');
    const [deliveryPhoneAlt, setDeliveryPhoneAlt] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [deliveryFrom, setDeliveryFrom] = useState('');
    const [deliveryTo, setDeliveryTo] = useState('');
    const [deliveryFailureAction, setDeliveryFailureAction] = useState('RETRY_LATER');
    const [deliveryNote, setDeliveryNote] = useState('');
    const [agreeTerms, setAgreeTerms] = useState(false);

    const [showPublishModal, setShowPublishModal] = useState(false);
    const [publishTeamId, setPublishTeamId] = useState('');
    const [pubFactoryType, setPubFactoryType] = useState('');
    const [pubSpecialty, setPubSpecialty] = useState('');
    const [pubCapacityValue, setPubCapacityValue] = useState('');
    const [pubCapacityUnit, setPubCapacityUnit] = useState('kg/tháng');
    const [pubRegion, setPubRegion] = useState('');
    const [pubDescription, setPubDescription] = useState('');
    const [pubFactoryImageUrl, setPubFactoryImageUrl] = useState('');
    const [pubFactoryImages, setPubFactoryImages] = useState<string[]>([]);
    const [pubBusinessLicense, setPubBusinessLicense] = useState('');
    const [pubBusinessAddress, setPubBusinessAddress] = useState('');
    const [pubWebsiteUrl, setPubWebsiteUrl] = useState('');
    const [pubFacebookUrl, setPubFacebookUrl] = useState('');
    const [pubCertificates, setPubCertificates] = useState<string[]>([]);
    const [pubCertificationDocument, setPubCertificationDocument] = useState('');
    const [publishing, setPublishing] = useState(false);
    const editingPublishedTeam = myTeams.find(team => team.id === publishTeamId && team.isPublished);
    const selectedPublishTeam = myTeams.find(team => team.id === publishTeamId);
    const publishVerificationStatus = selectedPublishTeam?.verificationStatus || 'NOT_SUBMITTED';

    const [featuredProducts, setFeaturedProducts] = useState<InventoryItem[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setError('');
                const [teamsAllResult, teamsMineResult] = await Promise.allSettled([
                    teamService.getAllTeams(),
                    teamService.getMyTeams()
                ]);
                if (teamsAllResult.status === 'rejected') {
                    throw teamsAllResult.reason;
                }

                const teamsAll = teamsAllResult.value;
                const teamsMine = teamsMineResult.status === 'fulfilled' ? teamsMineResult.value : [];
                const publishedTeams = teamsAll.filter(t => t.isPublished);
                const ownedTeams = teamsMine.filter(t => t.ownerId === user?.id);
                setAllTeams(publishedTeams);
                setMyTeams(ownedTeams);
                if (ownedTeams.length > 0) {
                    setBuyerTeamId(ownedTeams[0].id);
                    setPublishTeamId(ownedTeams[0].id);
                }

                const [featuredItems, reqs] = await Promise.all([
                    inventoryService.getFeaturedProducts().catch(() => []),
                    loadRequests()
                ]);
                setFeaturedProducts(featuredItems);
                setManufacturingRequests(reqs);
            } catch (err) {
                setError('Không thể tải dữ liệu thị trường.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user]);

    useEffect(() => {
        if (!allTeams.length) return;
        const fetchReviews = async () => {
            const summaries: typeof factoryReviewsSummary = {};
            await Promise.all(allTeams.map(async (team) => {
                try {
                    summaries[team.id] = await reviewService.getSummary(team.id);
                } catch {}
            }));
            setFactoryReviewsSummary(summaries);
        };
        fetchReviews();
    }, [allTeams]);

    const loadFactoryReviews = async (teamId: string) => {
        setReviewsLoading(true);
        try {
            const [reviews, summary] = await Promise.all([
                reviewService.getByTeam(teamId),
                reviewService.getSummary(teamId),
            ]);
            setFactoryReviews(prev => ({ ...prev, [teamId]: reviews }));
            setFactoryReviewsSummary(prev => ({ ...prev, [teamId]: summary }));
        } catch (err) {
            // ignore review load failure
        } finally {
            setReviewsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedFactory && activeProfileTab === 'reviews') {
            loadFactoryReviews(selectedFactory.id);
        }
    }, [selectedFactory?.id, activeProfileTab]);

    const factories = useMemo(() => allTeams.map(normalizeFactory), [allTeams]);

    const displayedFactories = useMemo(() => {
        const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
        const q = removeAccents(searchQuery.trim());
        const minCapacity = Number(minCapacityFilter) || 0;

        return factories.filter(factory => {
            const translatedRegion = t[factory.region || ''] || factory.region || t.vietnam;
            const translatedType = t[factory.factoryType || ''] || factory.factoryType || t.roastery;
            const translatedTags = factory.specializationsMock?.map(tag => t[tag.replace(' ', '_')] || tag) || [];

            const searchable = removeAccents([
                factory.name,
                factory.region,
                translatedRegion,
                factory.factoryType,
                translatedType,
                factory.specialty,
                factory.description,
                ...(factory.services || []),
                ...(factory.coffeeTypes || []),
                ...translatedTags
            ].filter(Boolean).join(' '));

            const matchesSearch = !q || searchable.includes(q);
            const matchesRegion = !regionFilter || factory.region === regionFilter;
            const matchesType = !factoryTypeFilter || factory.factoryType === factoryTypeFilter;
            const matchesSpecialty = !specialtyFilter || factory.capabilitiesMock?.services.includes(specialtyFilter) || splitMultiValue(factory.specialty).includes(specialtyFilter);
            const matchesStatus = !statusFilter || factory.statusBadgeMock === statusFilter;
            const matchesCapacity = !minCapacity || (factory.capacityValue || 0) >= minCapacity;
            const matchesVerified = !verifiedFilter
                || (verifiedFilter === 'verified' ? factory.verificationStatus === 'APPROVED' : factory.verificationStatus !== 'APPROVED');
            const matchesCertificate = !certificateFilter
                || (certificateFilter === 'has' ? Boolean(factory.certifications?.length) : !factory.certifications?.length);
            const matchesRating = !minRatingFilter || (factory.rating || 0) >= Number(minRatingFilter);

            return matchesSearch && matchesRegion && matchesType && matchesSpecialty && matchesStatus && matchesCapacity && matchesVerified && matchesCertificate && matchesRating;
        });
    }, [certificateFilter, factories, factoryTypeFilter, minCapacityFilter, regionFilter, searchQuery, specialtyFilter, statusFilter, verifiedFilter, minRatingFilter, t]);

    const selectedCompareFactories = factories.filter(factory => compareIds.includes(factory.id));
    const myPublishedTeams = myTeams.filter(team => team.isPublished);

    useEffect(() => {
        setCurrentPage(1);
    }, [displayedFactories]);

    const itemsPerPage = 12;
    const totalPages = Math.ceil(displayedFactories.length / itemsPerPage);
    const featuredFactories = displayedFactories.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const totalCompletedOrders = factories.reduce((sum, factory) => sum + (factory.completedOrders || 0), 0);

    const fillPublishForm = (team: Team) => {
        const images = team.factoryImages?.length ? team.factoryImages : team.factoryImageUrl ? [team.factoryImageUrl] : [];
        setPublishTeamId(team.id);
        setPubFactoryType(team.factoryType || '');
        setPubSpecialty(team.specialty || '');
        setPubCapacityValue(team.capacityValue ? String(team.capacityValue) : '');
        setPubCapacityUnit(team.capacityUnit || 'kg/tháng');
        setPubRegion(team.region || '');
        setPubDescription(team.description || '');
        setPubFactoryImageUrl(team.factoryImageUrl || images[0] || '');
        setPubFactoryImages(images);
        setPubBusinessLicense(team.businessLicense || '');
        setPubBusinessAddress(team.businessAddress || '');
        setPubWebsiteUrl(team.websiteUrl || '');
        setPubFacebookUrl(team.facebookUrl || '');
        setPubCertificates(team.certificates || []);
        setPubCertificationDocument(team.certificationDocument || '');
    };

    const openPublishModal = () => {
        if (myTeams.length === 0) {
            alert('Bạn cần tạo ít nhất 1 nhóm xưởng trước khi đăng tải.');
            navigate('/groups');
            return;
        }
        fillPublishForm(myTeams[0]);
        setShowPublishModal(true);
    };

    const openEditPublishedTeam = (team: Team) => {
        fillPublishForm(team);
        setShowPublishModal(true);
    };

    const handleFactoryImageFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;
        if (pubFactoryImages.length + files.length > 10) {
            alert('Chỉ được tải tối đa 10 ảnh xưởng.');
            event.target.value = '';
            return;
        }
        const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
        if (invalid) {
            alert('Ảnh xưởng chỉ hỗ trợ JPG, PNG hoặc WEBP.');
            event.target.value = '';
            return;
        }
        const tooLarge = files.find(file => file.size > 5 * 1024 * 1024);
        if (tooLarge) {
            alert('Mỗi ảnh xưởng tối đa 5MB.');
            event.target.value = '';
            return;
        }
        Promise.all(files.map(file => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(file);
        }))).then(images => {
            setPubFactoryImages(current => {
                const next = [...current, ...images].slice(0, 10);
                setPubFactoryImageUrl(next[0] || '');
                return next;
            });
        });
        event.target.value = '';
    };

    const handleDocumentFile = (event: React.ChangeEvent<HTMLInputElement>, setter: (value: string) => void) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
            alert('Tài liệu chỉ hỗ trợ PDF, JPG hoặc PNG.');
            event.target.value = '';
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert('Tài liệu tối đa 10MB.');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setter(String(reader.result || ''));
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const openChat = (factory: MarketplaceFactory) => {
        setChatTarget(factory);
        setChatDraft('');
        setChatMessages([{ sender: 'other', text: `Chào bạn, ${factory.name} có thể giúp gì cho bạn?` }]);
        setShowChatModal(true);
    };

    const handleSaveChatDraft = () => {
        if (!chatDraft.trim()) return;
        const newMsg = chatDraft.trim();
        setChatMessages(prev => [...prev, { sender: 'me', text: newMsg }]);
        setChatDraft('');

        setTimeout(() => {
            setChatMessages(prev => [...prev, { sender: 'other', text: 'Dạ, xưởng đã nhận được thông tin và sẽ phản hồi lại sớm ạ.' }]);
        }, 1500);
    };

    const resetRfqForm = () => {
        setRfqStep(1);
        setRfqTitle('');
        setRfqRequestType(RFQ_SERVICE_OPTIONS[0].value);
        setRfqProductName('');
        setRfqQuantity(1);
        setRfqUnit(RFQ_UNIT_OPTIONS[0].value);
        setRfqDeadline('');
        setRfqBudget('');
        setRfqQuality('');
        setRfqPackaging('');
        setRfqNote('');
        setDeliveryPhone('');
        setDeliveryPhoneAlt('');
        setDeliveryAddress('');
        // setDeliveryFrom('');
        // setDeliveryTo('');
        setDeliveryFailureAction('RETRY_LATER');
        setDeliveryNote('');
    };

    const handleOrderClick = (seller?: Team) => {
        setSelectedSeller(seller || null);
        if (!buyerTeamId) {
            setBuyerTeamId(myTeams[0]?.id || '');
        }
        setShowOrderModal(true);
    };

    const closeOrderModal = () => {
        setShowOrderModal(false);
    };

    const validateCurrentRfqStep = () => {
        if (rfqStep === 1) {
            if (!rfqTitle.trim() || !rfqProductName.trim()) {
                alert('Vui lòng nhập tiêu đề RFQ và chọn loại sản phẩm.');
                return false;
            }
            if (rfqQuantity <= 0) {
                alert('Số lượng phải lớn hơn 0.');
                return false;
            }
        }
        if (rfqStep === 2 && rfqDeadline && new Date(rfqDeadline) <= new Date()) {
            alert('Deadline mong muốn phải là ngày trong tương lai.');
            return false;
        }
        if (rfqStep === 3 && (!deliveryPhone.trim() || !deliveryAddress.trim())) {
            alert('Vui lòng nhập SĐT liên hệ và địa chỉ giao hàng.');
            return false;
        }
        return true;
    };

    const handleNextRfqStep = () => {
        if (!validateCurrentRfqStep()) return;
        setRfqStep(prev => (prev < 3 ? ((prev + 1) as RfqStep) : prev));
    };

    const handlePrevRfqStep = () => {
        setRfqStep(prev => (prev > 1 ? ((prev - 1) as RfqStep) : prev));
    };

    const handleSubmitOrder = async (event: React.FormEvent) => {
        event.preventDefault();
        if (rfqStep !== 3) {
            handleNextRfqStep();
            return;
        }
        if (!validateCurrentRfqStep()) return;
        if (!rfqTitle.trim() || !rfqProductName.trim()) return;
        if (rfqQuantity <= 0) {
            alert('Số lượng phải lớn hơn 0.');
            return;
        }
        if (rfqDeadline && new Date(rfqDeadline) <= new Date()) {
            alert('Deadline mong muốn phải là ngày trong tương lai.');
            return;
        }

        try {
            setSubmitting(true);
            const detailLines = [
                `Dịch vụ yêu cầu: ${rfqRequestType}`,
                `Loại sản phẩm: ${rfqProductName}`,
                `Số lượng: ${rfqQuantity} ${rfqUnit}`,
                rfqQuality ? `Mức rang: ${rfqQuality}` : '',
                rfqPackaging ? `Quy cách đóng gói: ${rfqPackaging}` : '',
                rfqBudget ? `Ngân sách dự kiến: ${rfqBudget}` : '',
                rfqNote ? `Ghi chú: ${rfqNote}` : '',
            ].filter(Boolean).join('\n');

            setShowOrderModal(false);
            setShowAiMatching(true);
            setAiMatchingProgress(0);

            const interval = setInterval(() => {
                setAiMatchingProgress(prev => {
                    if (prev >= 100) {
                        clearInterval(interval);
                        return 100;
                    }
                    return prev + 15;
                });
            }, 300);

            setTimeout(async () => {
                const apiDeadline = toApiLocalDateTime(rfqDeadline);
                const request = {
                    type: rfqRequestType,
                    title: rfqTitle,
                    coffeeType: rfqProductName,
                    quantity: `${rfqQuantity} ${rfqUnit}`,
                    deadline: apiDeadline,
                    region: selectedSeller?.region || 'Toàn quốc',
                    details: detailLines,
                    buyerTeamId: buyerTeamId || undefined,
                };

                try {
                    if (selectedSeller) {
                        const dto: Partial<InterGroupOrder> = {
                            ...(buyerTeamId ? { buyerTeamId } : {}),
                            sellerTeamId: selectedSeller.id,
                            title: rfqTitle,
                            description: detailLines,
                            quantity: rfqQuantity,
                            deadline: apiDeadline,
                            contactPhone: deliveryPhone || undefined,
                            contactPhoneAlt: deliveryPhoneAlt || undefined,
                            deliveryAddress: deliveryAddress || undefined,
                            preferredDeliveryFrom: toApiLocalDateTime(deliveryFrom),
                            preferredDeliveryTo: toApiLocalDateTime(deliveryTo),
                            deliveryFailureAction: deliveryFailureAction || undefined,
                            deliveryNote: deliveryNote || undefined,
                        };
                        await interGroupOrderService.placeOrder(dto);
                    }
                } catch {
                    // RFQ marketplace listing below still gives the buyer a trackable draft.
                }

                try {
                    const savedRequest = await manufacturingRequestService.create(request);
                    setManufacturingRequests(prev => [savedRequest, ...prev]);
                } catch {
                    const localRequest: ManufacturingRequest = {
                        id: `local-${Date.now()}`,
                        type: request.type,
                        title: request.title,
                        coffeeType: request.coffeeType,
                        quantity: request.quantity,
                        deadline: rfqDeadline,
                        region: request.region,
                        details: request.details,
                        createdAt: new Date().toISOString(),
                        buyerTeamId: request.buyerTeamId,
                    };
                    setManufacturingRequests(prev => [localRequest, ...prev]);
                } finally {
                    setSubmitting(false);
                    clearInterval(interval);
                    setAiMatchingProgress(100);
                    setTimeout(() => {
                        setShowAiMatching(false);
                        resetRfqForm();
                        navigate('/orders');
                    }, 1000);
                }
            }, 2500);

        } catch {
            alert('Không thể gửi RFQ. Vui lòng thử lại.');
            setSubmitting(false);
        }
    };

    const handlePublish = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!publishTeamId) return;
        const capacityValue = pubCapacityValue.trim() ? Number(pubCapacityValue) : undefined;
        const capacityText = [pubCapacityValue.trim(), pubCapacityUnit].filter(Boolean).join(' ');

        try {
            setPublishing(true);
            await teamService.advertise(publishTeamId, {
                factoryType: pubFactoryType,
                specialty: pubSpecialty,
                capacity: capacityText,
                capacityValue: typeof capacityValue === 'number' && Number.isFinite(capacityValue) ? capacityValue : undefined,
                capacityUnit: pubCapacityUnit,
                region: pubRegion,
                description: pubDescription,
                factoryImageUrl: pubFactoryImages[0] || pubFactoryImageUrl,
                factoryImages: pubFactoryImages,
            } as Partial<Team>);
            await teamService.submitVerification(publishTeamId, {
                businessLicense: pubBusinessLicense,
                businessAddress: pubBusinessAddress,
                websiteUrl: pubWebsiteUrl,
                facebookUrl: pubFacebookUrl,
                certificates: pubCertificates,
                certificationDocument: pubCertificationDocument,
            } as Partial<Team>);
            setShowPublishModal(false);
            alert('Xưởng đã được lưu và hồ sơ xác minh đã gửi Admin duyệt.');
            const [teamsAll, teamsMine] = await Promise.all([teamService.getAllTeams(), teamService.getMyTeams()]);
            setAllTeams(teamsAll.filter(t => t.isPublished));
            setMyTeams(teamsMine.filter(t => t.ownerId === user?.id));
        } catch {
            alert('Không thể đăng xưởng. Vui lòng thử lại.');
        } finally {
            setPublishing(false);
        }
    };

    const handleUnpublish = async (teamId: string) => {
        if (!confirm('Gỡ xưởng này khỏi thị trường?')) return;
        try {
            await teamService.unpublish(teamId);
            alert('Đã gỡ xưởng khỏi thị trường.');
            const [teamsAll, teamsMine] = await Promise.all([teamService.getAllTeams(), teamService.getMyTeams()]);
            setAllTeams(teamsAll.filter(t => t.isPublished));
            setMyTeams(teamsMine.filter(t => t.ownerId === user?.id));
        } catch {
            alert('Không thể gỡ xưởng.');
        }
    };

    const deliveryResultLabel = (status?: string) => {
        switch (status) {
            case 'ON_TIME': return 'Giao đúng hẹn';
            case 'LATE': return 'Giao trễ';
            case 'NOT_DELIVERED': return 'Chưa nhận hàng';
            default: return 'Chưa rõ';
        }
    };

    const canManageReview = (review: Review) => {
        if (!user) return false;
        const ownsByUser = review.buyerUserId === user.id;
        const ownsByTeam = myTeams.some(team => team.id === review.buyerTeamId && team.ownerId === user.id);
        return ownsByUser || ownsByTeam;
    };

    const startEditReview = (review: Review) => {
        setEditingReviewId(review.id);
        setEditReviewRating(review.rating);
        setEditReviewStatus((review.deliveryResult as "ON_TIME" | "LATE" | "NOT_DELIVERED") || 'ON_TIME');
        setEditReviewComment(review.comment || '');
    };

    const cancelEditReview = () => {
        setEditingReviewId(null);
        setEditReviewRating(5);
        setEditReviewStatus('ON_TIME');
        setEditReviewComment('');
    };

    const handleUpdateReview = async (factoryId: string, reviewId: string) => {
        try {
            await reviewService.update(reviewId, {
                rating: editReviewRating,
                deliveryResult: editReviewStatus,
                comment: editReviewComment,
            });
            cancelEditReview();
            await loadFactoryReviews(factoryId);
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Không thể cập nhật đánh giá.');
        }
    };

    const handleDeleteReview = async (factoryId: string, reviewId: string) => {
        if (!confirm('Xóa đánh giá này? Điểm sao của xưởng sẽ được cập nhật lại.')) return;
        try {
            await reviewService.remove(reviewId);
            await loadFactoryReviews(factoryId);
        } catch (err: any) {
            alert(err?.response?.data?.error || 'Không thể xóa đánh giá.');
        }
    };

    const renderMetric = (label: string, value?: string | number | React.ReactNode) => (
        <div className="mp-capacity-metric">
            <span>{label}</span>
            <strong>{displayText(value)}</strong>
        </div>
    );

    const renderVerification = (factory: MarketplaceFactory) => {
        const badges = [
            { label: 'Xưởng đã xác minh', active: factory.verifiedFactory },
            { label: 'Doanh nghiệp đã xác minh', active: factory.verifiedBusiness },
            { label: 'Địa chỉ đã xác minh', active: factory.verifiedAddress },
            { label: 'Chứng nhận đã xác minh', active: factory.verifiedCertification },
        ];
        const hasAny = badges.some(badge => badge.active);
        if (!hasAny) return <p className="mp-empty-inline">Chưa xác minh</p>;
        return (
            <div className="mp-verification-list">
                {badges.map(badge => (
                    <span className={badge.active ? 'verified' : ''} key={badge.label}>
                        <span className="material-symbols-outlined">{badge.active ? 'verified' : 'radio_button_unchecked'}</span>
                        {badge.label}
                    </span>
                ))}
            </div>
        );
    };

    const renderReviewsTab = (factory: MarketplaceFactory) => {
        const summary = factoryReviewsSummary[factory.id] || {};
        const avgRating = summary.avgRating || 0;
        const reviewCount = summary.reviewCount || 0;
        const onTimeRate = summary.onTimeRate || 0;
        const completed = summary.completedOrders || 0;
        const late = summary.lateOrders || 0;
        const starCounts = summary.starCounts || {};
        const reviews = factoryReviews[factory.id] || [];

        if (reviewsLoading && reviews.length === 0) {
            return (
                <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                        <div className="btn-spinner" style={{ margin: '0 auto 12px' }} />
                        <p>Đang tải đánh giá...</p>
                    </div>
                </div>
            );
        }

        if (reviewCount === 0) {
            return (
                <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>Chưa có đánh giá</div>
                        <p>Chưa có đơn hàng nào được hoàn thành với xưởng này.</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                <div style={{display: 'flex', alignItems: 'stretch', gap: '24px', padding: '24px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap'}}>
                    <div style={{textAlign: 'center', minWidth: 120}}>
                        <div style={{fontSize: '36px', fontWeight: 700, color: '#f59e0b'}}>{avgRating > 0 ? avgRating.toFixed(1) : '-'}</div>
                        <div style={{color: '#f59e0b', margin: '4px 0', letterSpacing: '2px'}}>{avgRating > 0 ? '★'.repeat(Math.round(avgRating)) + '☆'.repeat(5 - Math.round(avgRating)) : '-'}</div>
                        <div style={{fontSize: '13px', color: '#a79d94'}}>{reviewCount} đánh giá</div>
                    </div>
                    <div style={{flex: 1, minWidth: 240}}>
                        {[5, 4, 3, 2, 1].map(star => {
                            const count = Number(starCounts[star as keyof typeof starCounts] || 0);
                            const pct = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
                            return (
                                <div key={star} style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px'}}>
                                    <span style={{fontSize: '12px', color: '#f59e0b', width: '44px'}}>{star} sao</span>
                                    <div style={{flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden'}}>
                                        <div style={{height: '100%', background: '#f59e0b', width: `${pct}%`, transition: 'width 0.3s'}} />
                                    </div>
                                    <span style={{fontSize: '12px', color: '#a79d94', width: '56px', textAlign: 'right'}}>{count} ({pct}%)</span>
                                </div>
                            );
                        })}
                        <div style={{display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap'}}>
                            <span style={{fontSize: 12, color: '#a79d94'}}>Đúng hẹn {Math.round(onTimeRate)}%</span>
                            <span style={{fontSize: 12, color: '#a79d94'}}>{completed} đơn hoàn thành</span>
                            <span style={{fontSize: 12, color: '#a79d94'}}>{late} đơn trễ</span>
                        </div>
                    </div>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                    {reviews.map(review => (
                        <div key={review.id} style={{padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10}}>
                            {editingReviewId === review.id ? (
                                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                                    <div style={{display: 'flex', gap: 6}}>
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button key={star} onClick={() => setEditReviewRating(star)} style={{background: 'transparent', border: 'none', color: star <= editReviewRating ? '#f59e0b' : '#6b7280', fontSize: 24, cursor: 'pointer'}}>★</button>
                                        ))}
                                    </div>
                                    <select value={editReviewStatus} onChange={event => setEditReviewStatus(event.target.value as typeof editReviewStatus)} style={{padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)'}}>
                                        <option value="ON_TIME">Giao đúng hẹn</option>
                                        <option value="LATE">Giao trễ</option>
                                        <option value="NOT_DELIVERED">Chưa nhận hàng</option>
                                    </select>
                                    <textarea value={editReviewComment} onChange={event => setEditReviewComment(event.target.value)} rows={3} style={{padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', resize: 'vertical'}} />
                                    <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                                        <button onClick={cancelEditReview} style={{padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer'}}>Hủy</button>
                                        <button onClick={() => handleUpdateReview(factory.id, review.id)} style={{padding: '8px 12px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer'}}>Lưu đánh giá</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
                                        <div>
                                            <strong style={{color: '#ece8e1'}}>{review.buyerTeamName || review.buyerUserName || 'Người đặt hàng'}</strong>
                                            <div style={{fontSize: 12, color: '#a79d94', marginTop: 4}}>
                                                {deliveryResultLabel(review.deliveryResult)} - {new Date(review.createdAt).toLocaleDateString('vi-VN')}
                                            </div>
                                        </div>
                                        <div style={{color: '#f59e0b', letterSpacing: 1}}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</div>
                                    </div>
                                    {review.comment && <p style={{margin: '12px 0 0', color: '#cfc7bf', lineHeight: 1.6}}>{review.comment}</p>}
                                    {canManageReview(review) && (
                                        <div style={{display: 'flex', gap: 8, marginTop: 12}}>
                                            <button onClick={() => startEditReview(review)} style={{padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', color: '#fbbf24', cursor: 'pointer'}}>Sửa</button>
                                            <button onClick={() => handleDeleteReview(factory.id, review.id)} style={{padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', cursor: 'pointer'}}>Xóa</button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderProfileTab = (factory: MarketplaceFactory) => {
        switch (activeProfileTab) {
            case 'overview':
                return (
                    <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                        <p style={{fontSize: '15px', color: '#ece8e1', lineHeight: '1.6'}}>{factory.description || 'Chưa cập nhật mô tả xưởng'}</p>
                        <div className="mp-profile-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                            {renderMetric('Năm hoạt động', factory.yearsInOperationMock + ' Năm')}
                            {renderMetric('Quy mô nhân sự', factory.employeeCountMock + ' Người')}
                            {renderMetric('Diện tích', factory.factorySizeMock)}
                            {renderMetric('Loại hình', factory.factoryType)}
                            {renderMetric('Công suất', factory.currentCapacityMock)}
                            {renderMetric('Đơn đã hoàn thành', factory.completedOrdersMock)}
                        </div>
                    </div>
                );
            case 'capabilities':
                return (
                    <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
                        <div>
                            <h4 style={{marginBottom: '12px', color: '#d4a574'}}>Dịch vụ gia công</h4>
                            <div className="mp-detail-tags">
                                {factory.capabilitiesMock?.services.map(s => <span key={s}>{s}</span>)}
                            </div>
                        </div>
                        <div>
                            <h4 style={{marginBottom: '12px', color: '#d4a574'}}>Dòng cà phê</h4>
                            <div className="mp-detail-tags">
                                {factory.capabilitiesMock?.coffeeTypes.map(c => <span key={c}>{c}</span>)}
                            </div>
                        </div>
                        <div>
                            <h4 style={{marginBottom: '12px', color: '#d4a574'}}>Quy cách đóng gói</h4>
                            <div className="mp-detail-tags">
                                {factory.capabilitiesMock?.packagingFormats.map(p => <span key={p}>{p}</span>)}
                            </div>
                        </div>
                    </div>
                );
            case 'equipment':
                return (
                    <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
                        <div>
                            <h4 style={{marginBottom: '12px', color: '#d4a574'}}>Máy rang</h4>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                {factory.equipmentMock?.roasters.map(r => (
                                    <div key={r.model} style={{display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)'}}>
                                        <strong style={{color: '#ece8e1'}}>{r.model}</strong>
                                        <span style={{color: '#a79d94'}}>{r.capacity} • Đời {r.year}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 style={{marginBottom: '12px', color: '#d4a574'}}>Máy đóng gói & Xay</h4>
                            <ul style={{color: '#a79d94', paddingLeft: '20px', lineHeight: '1.8'}}>
                                {factory.equipmentMock?.packaging.map(p => <li key={p}>{p}</li>)}
                                {factory.equipmentMock?.grinders.map(p => <li key={p}>{p}</li>)}
                            </ul>
                        </div>
                        <div>
                            <h4 style={{marginBottom: '12px', color: '#d4a574'}}>Thiết bị kiểm định (QC)</h4>
                            <div className="mp-detail-tags">
                                {factory.equipmentMock?.qc.map(q => <span key={q} style={{background: 'transparent', border: '1px dashed #d4a574', color: '#d4a574'}}>{q}</span>)}
                            </div>
                        </div>
                    </div>
                );
            case 'certificates':
                return (
                    <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                        {renderVerification(factory)}
                        <div style={{display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px'}}>
                            {factory.certificatesMock?.map(cert => (
                                <div key={cert.name} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)'}}>
                                    <div>
                                        <h4 style={{margin: '0 0 4px 0', color: '#ece8e1', fontSize: '15px'}}>{cert.name}</h4>
                                        <span style={{fontSize: '13px', color: '#a79d94'}}>Ngày cấp: {cert.issueDate} • Hết hạn: {cert.expDate}</span>
                                    </div>
                                    <span style={{color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600}}>
                                        <span className="material-symbols-outlined" style={{fontSize: '16px'}}>verified</span> {cert.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'reviews':
                return renderReviewsTab(factory);
                return (
                    <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                        {(() => {
                            const summary = factoryReviewsSummary[factory.id] || {};
                            const avgRating = summary.avgRating || 0;
                            const reviewCount = summary.reviewCount || 0;
                            const onTimeRate = summary.onTimeRate || 0;
                            const completed = summary.completedOrders || 0;
                            const late = summary.lateOrders || 0;
                            if (reviewCount === 0) {
                                return (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: 40, marginBottom: 12 }}>Chưa có đánh giá</div>
                                        <p>Chưa có đơn hàng nào được hoàn thành với xưởng này.</p>
                                    </div>
                                );
                            }
                            return (
                                <>
                                    <div style={{display: 'flex', alignItems: 'center', gap: '24px', padding: '24px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)'}}>
                                        <div style={{textAlign: 'center'}}>
                                            <div style={{fontSize: '36px', fontWeight: 700, color: '#f59e0b'}}>{avgRating > 0 ? avgRating.toFixed(1) : '—'}</div>
                                            <div style={{color: '#f59e0b', margin: '4px 0', letterSpacing: '2px'}}>{avgRating > 0 ? '★'.repeat(Math.round(avgRating)) + '☆'.repeat(5 - Math.round(avgRating)) : '—'}</div>
                                            <div style={{fontSize: '13px', color: '#a79d94'}}>{reviewCount} đánh giá</div>
                                        </div>
                                        <div style={{flex: 1}}>
                                            {[['Đúng hẹn', onTimeRate, '#10b981'], ['Trễ hẹn', 100 - onTimeRate, '#f59e0b']].map(([label, pct, color]) => (
                                                <div key={label as string} style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px'}}>
                                                    <span style={{fontSize: '12px', color: '#a79d94', width: '70px'}}>{label}</span>
                                                    <div style={{flex: 1, height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden'}}>
                                                        <div style={{height: '100%', background: color as string, width: `${pct}%`, transition: 'width 0.3s'}}></div>
                                                    </div>
                                                    <span style={{fontSize: '12px', color: '#a79d94', width: '35px', textAlign: 'right'}}>{pct}%</span>
                                                </div>
                                            ))}
                                            <div style={{display: 'flex', gap: 16, marginTop: 8}}>
                                                <span style={{fontSize: 12, color: '#a79d94'}}>✓ {completed} đơn đúng hẹn</span>
                                                <span style={{fontSize: 12, color: '#a79d94'}}>⚠ {late} đơn trễ</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{fontSize: 13, color: 'var(--text-muted)', padding: '0 4px'}}>
                                        Đánh giá chi tiết sẽ hiển thị sau khi có đơn hàng được hoàn thành.
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                );
            case 'portfolio':
                return (
                    <div className="mp-profile-overview" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                            {factory.portfolioMock?.map((p, i) => (
                                <div key={i} style={{background: 'rgba(255,255,255,0.03)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)'}}>
                                    <img src={p.image} alt={p.name} style={{width: '100%', height: '140px', objectFit: 'cover'}} />
                                    <div style={{padding: '12px'}}>
                                        <strong style={{color: '#ece8e1', display: 'block', marginBottom: '4px'}}>{p.name}</strong>
                                        <span style={{fontSize: '12px', color: '#d4a574', background: 'rgba(212, 165, 116, 0.1)', padding: '4px 8px', borderRadius: '4px'}}>{p.type}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'rfq':
                return (
                    <div className="mp-profile-overview">
                        <p>Gửi yêu cầu Báo giá & Gia công (RFQ) trực tiếp tới xưởng này. Xưởng sẽ phản hồi trong vòng {factory.leadTimeMock}.</p>
                        <button
                            className="mp-submit-btn"
                            disabled={factory.ownerId === user?.id}
                            onClick={() => handleOrderClick(factory)}
                        >
                            {factory.ownerId === user?.id ? 'Xưởng của bạn' : 'Gửi yêu cầu RFQ'}
                        </button>
                    </div>
                );
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="mp-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <div className="btn-spinner" />
            </div>
        );
    }

    return (
        <div className="mp-body mp-market-style mp-manufacturing-market" ref={container}>
            <Sidebar />

            <header className="mp-topbar">
                <div className="mp-top-spacer" />
                <div className="mp-top-actions">
                    <button aria-label="Thông báo">
                        <span className="material-symbols-outlined">notifications</span>
                    </button>
                    <button aria-label="Lịch sử">
                        <span className="material-symbols-outlined">history</span>
                    </button>
                    <button aria-label="Đơn liên xưởng" onClick={() => navigate('/orders')}>
                        <span className="material-symbols-outlined">receipt_long</span>
                    </button>
                    <button aria-label="Bộ lọc" onClick={() => document.getElementById('mp-filters')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                        <span className="material-symbols-outlined">tune</span>
                    </button>
                    <button aria-label="Language Toggle" onClick={() => setLanguage(lang => lang === 'vi' ? 'en' : 'vi')} style={{ fontSize: '13px', fontWeight: 'bold', padding: '0 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)' }}>
                        {language === 'vi' ? 'EN' : 'VI'}
                    </button>
                    <div className="mp-user-avatar">{(user?.username || user?.fullName || 'O').charAt(0).toUpperCase()}</div>
                </div>
            </header>

            <main className="mp-main">
                <section className="mp-market-hero">
                    <div className="mp-market-hero-copy">
                        <span className="mp-verified">
                            <span className="material-symbols-outlined">verified</span>
                            Hệ sinh thái đối tác
                        </span>
                        <h1><span style={{color: "#F59E0B"}}>Mạng Lưới</span> Xưởng Rang <em>Chuyên Nghiệp</em></h1>
                        <p>Kết nối trực tiếp với những xưởng rang thủ công và công nghiệp hàng đầu Việt Nam. Nâng tầm chất lượng cà phê cho doanh nghiệp của bạn.</p>
                        <div className="mp-hero-buttons">
                            <button onClick={() => document.getElementById('mp-partners')?.scrollIntoView({ behavior: 'smooth' })}>Tìm đối tác ngay</button>
                            <button onClick={() => document.getElementById('mp-products')?.scrollIntoView({ behavior: 'smooth' })}>Tìm hiểu thêm</button>
                        </div>
                    </div>
                    <aside className="mp-hero-control-card">
                        <h3>Quản lý Cửa hàng</h3>
                        <dl>
                            {factories.length > 0 && (
                                <div>
                                    <dt>Sản phẩm đang bán</dt>
                                    <dd>{factories.length}</dd>
                                </div>
                            )}
                            {manufacturingRequests.length > 0 && (
                                <div>
                                    <dt>Đơn hàng mới</dt>
                                    <dd>{manufacturingRequests.length}</dd>
                                </div>
                            )}
                            {totalCompletedOrders > 0 && (
                                <div>
                                    <dt>Lượt giao dịch</dt>
                                    <dd>{totalCompletedOrders}</dd>
                                </div>
                            )}
                        </dl>
                        <button type="button" onClick={openPublishModal}>
                            <span className="material-symbols-outlined">upload</span>
                            Đăng tải sản phẩm
                        </button>
                    </aside>
                </section>

                <section id="mp-filters" className="mp-category-row" aria-label="Bộ lọc thị trường">
                    {marketplaceCategories.map((category, index) => (
                        <button
                            key={category.label}
                            type="button"
                            className={
                                (index === 0 && !specialtyFilter && !factoryTypeFilter && !statusFilter)
                                    || (category.label === 'Nguyên liệu' && specialtyFilter === 'Cung ứng cà phê nhân')
                                    || (category.label === 'Dịch vụ rang' && specialtyFilter === 'Rang cà phê')
                                    || (category.label === 'Dịch vụ đóng gói' && specialtyFilter === 'Đóng gói')
                                    || (category.label === 'Dịch vụ trọn gói' && specialtyFilter === 'Gia công OEM')
                                    ? 'active'
                                    : ''
                            }
                            onClick={() => {
                                if (category.label === 'Đăng nhu cầu') {
                                    handleOrderClick();
                                    return;
                                }
                                if (index === 0) {
                                    setRegionFilter('');
                                    setFactoryTypeFilter('');
                                    setSpecialtyFilter('');
                                    setStatusFilter('');
                                    setMinCapacityFilter('');
                                    setVerifiedFilter('');
                                    setCertificateFilter('');
                                    return;
                                }

                                setFactoryTypeFilter('');
                                setSpecialtyFilter('');
                                setStatusFilter('');

                                if (category.label === 'Nguyên liệu') setSpecialtyFilter('Cung ứng cà phê nhân');
                                if (category.label === 'Dịch vụ rang') setSpecialtyFilter('Rang cà phê');
                                if (category.label === 'Dịch vụ đóng gói') setSpecialtyFilter('Đóng gói');
                                if (category.label === 'Dịch vụ trọn gói') setSpecialtyFilter('Gia công OEM');
                            }}
                        >
                            <span className="material-symbols-outlined">{category.icon}</span>
                            {category.label}
                        </button>
                    ))}
                    <div className="mp-top-search mp-spotlight-search" style={{marginLeft: 'auto'}}>
                        <span className="material-symbols-outlined">search</span>
                        <input
                            type="text"
                            placeholder="Tìm hạt, xưởng, hoặc thiết bị..."
                            value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                            style={{ height: '38px', borderRadius: '10px' }}
                        />
                    </div>
                </section>

                {myPublishedTeams.length > 0 && (
                    <section className="mp-published-panel" aria-labelledby="mp-published-title">
                        <div className="mp-published-heading">
                            <div className="mp-published-heading-icon" aria-hidden="true">
                                <span className="material-symbols-outlined">storefront</span>
                            </div>
                            <div>
                                <h3 id="mp-published-title">Xưởng của bạn trên thị trường</h3>
                                <p>Quản lý thông tin mà khách hàng và đối tác đang nhìn thấy.</p>
                            </div>
                        </div>
                        <div className="mp-my-published-list">
                            {myPublishedTeams.map(team => (
                                <article key={team.id} className="mp-my-pub-item">
                                    <img
                                        className="mp-my-pub-image"
                                        src={getFactoryCardImage(team)}
                                        alt={`Ảnh đại diện ${team.name}`}
                                        onError={handleFactoryImageError}
                                    />
                                    <div className="mp-my-pub-content">
                                        <div className="mp-my-pub-title-row">
                                            <strong>{team.name}</strong>
                                            <span className="mp-pub-badge">
                                                <span aria-hidden="true" />
                                                Đang hiển thị
                                            </span>
                                        </div>
                                        <div className="mp-my-pub-meta">
                                            {team.region && (
                                                <span><span className="material-symbols-outlined" aria-hidden="true">location_on</span>{team.region}</span>
                                            )}
                                            {(team.specialty || team.factoryType) && (
                                                <span><span className="material-symbols-outlined" aria-hidden="true">coffee</span>{team.specialty || team.factoryType}</span>
                                            )}
                                        </div>
                                        <p className="mp-my-pub-visibility">
                                            <span className="material-symbols-outlined" aria-hidden="true">visibility</span>
                                            Khách hàng có thể tìm thấy xưởng này trên thị trường ORCA.
                                        </p>
                                    </div>
                                    <div className="mp-my-pub-actions">
                                        <button type="button" className="mp-edit-pub-btn" onClick={() => openEditPublishedTeam(team)}>
                                            <span className="material-symbols-outlined" aria-hidden="true">edit</span>
                                            Chỉnh sửa thông tin
                                        </button>
                                        <button type="button" className="mp-unpub-btn" onClick={() => handleUnpublish(team.id)}>
                                            <span className="material-symbols-outlined" aria-hidden="true">visibility_off</span>
                                            Gỡ khỏi thị trường
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}

                <section id="mp-partners" className="mp-partner-section">
                    <div className="mp-section-title-row">
                        <div>
                            <h2>Xưởng Đối Tác</h2>
                            <p>Những đơn vị rang uy tín hàng đầu trong mạng lưới ORCA</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <select
                                value={minRatingFilter}
                                onChange={e => setMinRatingFilter(e.target.value)}
                                className="mp-filter-select"
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">Tất cả số sao</option>
                                <option value="5">5 Sao</option>
                                <option value="4">Từ 4 Sao</option>
                                <option value="3">Từ 3 Sao</option>
                                <option value="2">Từ 2 Sao</option>
                                <option value="1">Từ 1 Sao</option>
                                <option value="0">Từ 0 Sao</option>
                            </select>
                        </div>
                    </div>

                    {error && <div className="mp-error">{error}</div>}

                    {displayedFactories.length === 0 ? (
                        <div className="mp-empty mp-styled-empty">
                            <span className="material-symbols-outlined">factory</span>
                            <h3>Chưa có xưởng đối tác</h3>
                            <p>Đăng xưởng của bạn để bắt đầu nhận yêu cầu gia công và hiển thị trong mạng lưới ORCA.</p>
                            <button className="mp-publish-btn" onClick={openPublishModal}>Đăng xưởng ngay</button>
                        </div>
                    ) : (
                        <div className="mp-factory-grid">
                            {featuredFactories.map((factory) => {
                                const isOwnFactory = factory.ownerId === user?.id;
                                const image = getFactoryCardImage(factory);
                                return (
                                    <article key={factory.id} className="mp-factory-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                        <div className="mp-factory-image">
                                            <img
                                                src={image}
                                                alt={`Ảnh xưởng ${factory.name}`}
                                                referrerPolicy="no-referrer"
                                                onError={handleFactoryImageError}
                                            />
                                            <span className="mp-card-ribbon">{t[factory.statusBadgeMock?.replace(' ', '_') || ''] || factory.statusBadgeMock}</span>
                                        </div>
                                        <div className="mp-factory-card-body" style={{padding: '16px 20px', display: 'flex', flexDirection: 'column', flexGrow: 1}}>
                                            <div className="mp-fcard-header">
                                                <h3>{factory.name} {factory.verifiedFactory && <span className="material-symbols-outlined verified-icon" title={t.verifiedFactory} style={{fontSize: 16, color: '#10b981'}}>verified</span>}</h3>
                                                <span className="mp-fcard-location"><span className="material-symbols-outlined" style={{fontSize: 14}}>location_on</span> {t[factory.region || ''] || factory.region || t.vietnam}</span>
                                            </div>
                                            <div className="mp-fcard-type" style={{color: 'var(--text-muted)', fontSize: 13, marginBottom: 8}}>
                                                {t[factory.factoryType || ''] || factory.factoryType || t.roastery} • {factory.yearsInOperationMock} {t.yearsInOperation}
                                            </div>
                                            <div className="mp-fcard-tags" style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16}}>
                                                {factory.specializationsMock?.slice(0, 3).map(tag => (
                                                    <span key={tag} style={{background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 4, fontSize: 12, border: '1px solid rgba(255,255,255,0.1)'}}>{t[tag.replace(' ', '_')] || tag}</span>
                                                ))}
                                            </div>
                                            <div className="mp-fcard-metrics" style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16, padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)'}}>
                                                <div className="mp-metric" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
                                                    <span style={{fontSize: 14, fontWeight: 600, color: '#10b981'}}>{factory.trustScoreMock}</span>
                                                    <span style={{fontSize: 11, color: 'var(--text-muted)'}}>{t.trustScore}</span>
                                                </div>
                                                <div className="mp-metric" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
                                                    <span style={{fontSize: 14, fontWeight: 600, color: '#f59e0b'}}>{factory.ratingMock?.toFixed(1)}★</span>
                                                    <span style={{fontSize: 11, color: 'var(--text-muted)'}}>{t.rating} ({factory.reviewCountMock})</span>
                                                </div>
                                                <div className="mp-metric" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
                                                    <span style={{fontSize: 14, fontWeight: 600}}>{factory.completedOrdersMock}</span>
                                                    <span style={{fontSize: 11, color: 'var(--text-muted)'}}>{t.orders}</span>
                                                </div>
                                                <div className="mp-metric" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
                                                    <span style={{fontSize: 14, fontWeight: 600}}>{factory.onTimeRateMock}%</span>
                                                    <span style={{fontSize: 11, color: 'var(--text-muted)'}}>{t.onTime}</span>
                                                </div>
                                            </div>
                                            <div className="mp-fcard-capacity" style={{display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, marginBottom: 16}}>
                                                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                                    <span style={{color: 'var(--text-muted)'}}>{t.availableCapacity}</span>
                                                    <strong style={{color: 'var(--text-primary)'}}>{factory.availableCapacityMock}</strong>
                                                </div>
                                                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                                    <span style={{color: 'var(--text-muted)'}}>{t.moq}</span>
                                                    <strong style={{color: 'var(--text-primary)'}}>{factory.moqMock}</strong>
                                                </div>
                                                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                                    <span style={{color: 'var(--text-muted)'}}>{t.leadTime}</span>
                                                    <strong style={{color: 'var(--text-primary)'}}>{factory.leadTimeMock?.replace('Ngày', language === 'en' ? 'Days' : 'Ngày')}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mp-factory-actions" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px 16px', marginTop: 'auto'}}>
                                            {isOwnFactory ? (
                                                <button onClick={() => openEditPublishedTeam(factory)} style={{gridColumn: '1 / -1', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, height: 38}}>{t.manageFactory}</button>
                                            ) : (
                                                <>
                                                    <button onClick={() => { setSelectedFactory(factory); setActiveProfileTab('overview'); }} style={{background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{t.viewCapacity}</button>
                                                    <button onClick={() => { const fact = factory; handleOrderClick(fact); }} style={{background: '#b97820', color: '#fff', padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{t.sendRequest}</button>
                                                </>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                    {totalPages > 1 && (
                        <div className="mp-pagination">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span> Trước
                            </button>
                            <span className="mp-page-info">Trang {currentPage} / {totalPages}</span>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                                Sau <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
                            </button>
                        </div>
                    )}
                </section>

                <section id="mp-products" className="mp-product-section">
                    <div className="mp-section-title-row">
                        <div>
                            <h2>Sản phẩm Mới</h2>
                        </div>
                    </div>
                    <div className="mp-marquee-container">
                        <div className="mp-marquee-track">
                            {[...featuredProducts, ...featuredProducts].map((product, index) => (
                                <article className="mp-clean-product-card" key={product.name + index}>
                                    <div className="mp-cpc-image" onClick={() => { setSelectedProduct({ ...product, factories: featuredFactories.slice((index % featuredProducts.length) % featuredFactories.length, ((index % featuredProducts.length) % featuredFactories.length) + 2) }); setShowProductFactories(false); }}>
                                        <img src={product.imageUrl} alt={product.name} />
                                    </div>
                                    <div className="mp-cpc-info">
                                        <h3>{product.name.toUpperCase()}</h3>
                                        <p>{product.origin || product.description}</p>
                                        <strong>{product.price}</strong>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {selectedCompareFactories.length > 0 && (
                    <section className="mp-compare-panel">
                        <div className="mp-section-title-row">
                            <div>
                                <h2>So sánh xưởng</h2>
                                <p>So sánh 2-4 xưởng theo chỉ số năng lực chính.</p>
                            </div>
                            <button onClick={() => setCompareIds([])}>Xóa so sánh</button>
                        </div>
                        <div className="mp-compare-table-wrap">
                            <table className="mp-compare-table">
                                <thead>
                                    <tr>
                                        <th>Chỉ số</th>
                                        {selectedCompareFactories.map(factory => <th key={factory.id}>{factory.name}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td>Công suất</td>{selectedCompareFactories.map(factory => <td key={factory.id}>{displayText(factory.monthlyCapacity)}</td>)}</tr>
                                    <tr><td>MOQ</td>{selectedCompareFactories.map(factory => <td key={factory.id}>{displayText(factory.moq)}</td>)}</tr>
                                    <tr><td>Giá</td>{selectedCompareFactories.map(factory => <td key={factory.id}>{emptyValue}</td>)}</tr>
                                    <tr><td>Uy tín</td>{selectedCompareFactories.map(factory => <td key={factory.id}>{displayPercent(getTrustScore(factory))}</td>)}</tr>
                                    <tr><td>Đúng hạn</td>{selectedCompareFactories.map(factory => <td key={factory.id}>{displayPercent(factory.onTimeRate)}</td>)}</tr>
                                    <tr><td>Chứng nhận</td>{selectedCompareFactories.map(factory => <td key={factory.id}>{factory.certifications?.join(', ') || emptyValue}</td>)}</tr>
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                <section className="mp-open-requests">
                    <div className="mp-section-title-row">
                        <div>
                            <h2>Yêu cầu gia công đang mở</h2>
                            <p>Nhu cầu rang, đóng gói, OEM và kiểm định đang mở để xưởng gửi báo giá.</p>
                        </div>
                    </div>

                    {manufacturingRequests.length === 0 ? (
                        <div className="mp-empty mp-styled-empty">
                            <span className="material-symbols-outlined">request_quote</span>
                            <h3>Chưa có nhu cầu sản xuất đang mở</h3>
                            <p>Các nhu cầu gia công đang mở sẽ hiển thị tại đây khi có dữ liệu mới.</p>
                        </div>
                    ) : (
                        <div className="mp-request-grid">
                            {manufacturingRequests.map(request => (
                                <article className="mp-request-card" key={request.id}>
                                    <span>{request.type}</span>
                                    <h3>{request.title}</h3>
                                    <dl>
                                        <div><dt>Cà phê</dt><dd>{displayText(request.coffeeType)}</dd></div>
                                        <div><dt>Sản lượng</dt><dd>{displayText(request.quantity)}</dd></div>
                                        <div><dt>Deadline</dt><dd>{request.deadline ? new Date(request.deadline).toLocaleDateString('vi-VN') : emptyValue}</dd></div>
                                        <div><dt>Khu vực</dt><dd>{displayText(request.region)}</dd></div>
                                    </dl>
                                    <p>{request.details || 'Chưa cập nhật yêu cầu chi tiết'}</p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section className="mp-cta">
                    <h2>Sẵn sàng đưa xưởng của bạn lên ORCA?</h2>
                    <p>Gia nhập cộng đồng xưởng rang lớn nhất Việt Nam. Quản lý bán hàng, tiếp cận khách hàng B2B và tối ưu hóa vận hành chỉ trong một nền tảng.</p>
                    <button onClick={openPublishModal}>Đăng ký trở thành Đối tác</button>
                    <small>Hơn 50 xưởng rang đã tin tưởng sử dụng</small>
                </section>

                <footer className="mp-showcase-footer">
                    <span>ORCA</span>
                    <p>© 2026 Coffee Workshop Ecosystem</p>
                    <div>
                        <a href="#!" onClick={e => e.preventDefault()}>Điều khoản</a>
                        <a href="#!" onClick={e => e.preventDefault()}>Hỗ trợ đối tác</a>
                    </div>
                </footer>
            </main>

            {selectedProduct && (
                <div className="mp-modal-overlay" onClick={() => setSelectedProduct(null)}>
                    <div className="mp-modal" onClick={event => event.stopPropagation()} style={{ maxWidth: 800 }}>
                        <div className="mp-modal-header">
                            <h2>{showProductFactories ? 'Xưởng nhận gia công' : 'Chi tiết sản phẩm'}</h2>
                            <button className="mp-modal-close" onClick={() => setSelectedProduct(null)}>×</button>
                        </div>

                        {!showProductFactories ? (
                            <>
                                <div style={{ display: 'flex', gap: 32, marginBottom: 24, marginTop: 10 }}>
                                    <div style={{ flex: '0 0 300px' }}>
                                        <img src={selectedProduct.imageUrl} alt={selectedProduct.name} style={{ width: '100%', height: 300, objectFit: 'cover', borderRadius: 12, background: '#171a1b', border: '1px solid rgba(255,255,255,0.1)' }} />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                            <h3 style={{ margin: 0, fontSize: 26, color: '#fff7ef' }}>{selectedProduct.name}</h3>
                                            {selectedProduct.status && <span style={{ background: '#d4a574', color: '#171a1b', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>{selectedProduct.status}</span>}
                                        </div>
                                        <p style={{ margin: '0 0 20px', color: '#a79d94', fontSize: 15, lineHeight: 1.6 }}>{selectedProduct.description}</p>

                                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px 20px', borderRadius: 12, marginBottom: 20 }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 16 }}>
                                                <strong style={{ fontSize: 28, color: '#ffd9bd', lineHeight: 1 }}>{selectedProduct.price}</strong>
                                                <small style={{ color: '#a79d94', fontSize: 15, marginBottom: 2 }}>/{selectedProduct.unit}</small>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', fontSize: 14 }}>
                                                {selectedProduct.origin && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8f8580' }}>Xuất xứ:</span> <strong style={{ color: '#ece8e1', textAlign: 'right' }}>{selectedProduct.origin}</strong></div>}
                                                {selectedProduct.processing && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8f8580' }}>Sơ chế:</span> <strong style={{ color: '#ece8e1', textAlign: 'right' }}>{selectedProduct.processing}</strong></div>}
                                                {selectedProduct.roastLevel && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8f8580' }}>Mức rang:</span> <strong style={{ color: '#ece8e1', textAlign: 'right' }}>{selectedProduct.roastLevel}</strong></div>}
                                                {selectedProduct.quantity > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#8f8580' }}>Tình trạng:</span> <strong style={{ color: '#5cb85c', textAlign: 'right' }}>Có sẵn ({selectedProduct.quantity}+ {selectedProduct.unit})</strong></div>}
                                            </div>
                                        </div>

                                        {selectedProduct.tasteNotes && selectedProduct.tasteNotes.trim() !== '' && (
                                            <div style={{ marginBottom: 20 }}>
                                                <strong style={{ display: 'block', marginBottom: 12, color: '#ece8e1', fontSize: 14 }}>Hương vị nổi bật (Taste Notes):</strong>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {selectedProduct.tasteNotes.split(',').map((note: string) => note.trim()).map((note: string) => (
                                                        <span key={note} style={{ background: 'rgba(212, 165, 116, 0.1)', color: '#d4a574', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, border: '1px solid rgba(212, 165, 116, 0.2)' }}>{note}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mp-modal-actions" style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                                    <button type="button" className="mp-cancel-btn" onClick={() => setSelectedProduct(null)} style={{ flex: 1, padding: '14px', fontSize: 15, fontWeight: 600 }}>Đóng</button>
                                    <button type="button" className="mp-submit-btn" style={{ flex: 2, padding: '14px', fontSize: 15, fontWeight: 600 }} onClick={() => setShowProductFactories(true)}>
                                        Tìm xưởng gia công
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p style={{ margin: '10px 0 20px', color: '#a79d94', fontSize: 13, lineHeight: 1.5 }}>
                                    Các xưởng sau có năng lực và sẵn sàng gia công <strong>{selectedProduct.name}</strong>.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto', marginBottom: 24, paddingRight: 8 }}>
                                    {selectedProduct.factories?.length > 0 ? selectedProduct.factories.map((factory: MarketplaceFactory) => (
                                        <div key={factory.id} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: 14, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <p style={{ margin: '0 0 4px', color: '#ece8e1', fontWeight: 600, fontSize: 14 }}>{factory.name}</p>
                                                <p style={{ margin: 0, color: '#a79d94', fontSize: 12 }}>{displayText(factory.region)} • {factory.factoryType || 'Đối tác ORCA'}</p>
                                            </div>
                                            <button type="button" style={{ background: '#b97820', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }} onClick={() => {
                                                setSelectedProduct(null);
                                                handleOrderClick(factory);
                                            }}>
                                                Gửi RFQ
                                            </button>
                                        </div>
                                    )) : (
                                        <div style={{ padding: 20, textAlign: 'center', color: '#8f8580' }}>Không tìm thấy xưởng gia công phù hợp</div>
                                    )}
                                </div>
                                <div className="mp-modal-actions" style={{ display: 'flex', gap: 12 }}>
                                    <button type="button" className="mp-cancel-btn" onClick={() => setShowProductFactories(false)} style={{ flex: 1 }}>Quay lại</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {selectedFactory && (
                <div className="mp-modal-overlay" onClick={() => setSelectedFactory(null)}>
                    <div className="mp-workshop-detail mp-profile-detail" onClick={event => event.stopPropagation()}>
                        <button className="mp-detail-close" onClick={() => setSelectedFactory(null)}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                        <aside className="mp-profile-side">
                            <span className={`mp-availability ${availabilityCopy(selectedFactory.availabilityStatus).className}`}>
                                {availabilityCopy(selectedFactory.availabilityStatus).label}
                            </span>
                            {(selectedFactory.factoryImages && selectedFactory.factoryImages.length > 0) ? (
                                <div className="mp-profile-gallery" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                                    {selectedFactory.factoryImages.map((img, i) => (
                                        <img
                                            key={i}
                                            src={img}
                                            alt={`Ảnh ${i}`}
                                            style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                                            onError={handleFactoryImageError}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="mp-profile-image">
                                    <img
                                        src={getFactoryCardImage(selectedFactory)}
                                        alt={`Ảnh xưởng ${selectedFactory.name}`}
                                        onError={handleFactoryImageError}
                                    />
                                </div>
                            )}
                            <h2>{selectedFactory.name}</h2>
                            <p>{displayText(selectedFactory.region)}</p>
                            <div className="mp-profile-side-metrics">
                                {renderMetric('Độ tin cậy', selectedFactory.totalOrders ? displayPercent(getTrustScore(selectedFactory)) : undefined)}
                                {renderMetric('Công suất', selectedFactory.monthlyCapacity)}
                                {renderMetric('Loại hình', selectedFactory.factoryType)}
                            </div>
                            {renderVerification(selectedFactory)}
                        </aside>
                        <div className="mp-detail-content">
                            <div className="mp-profile-tabs">
                                {(['overview', 'capabilities', 'equipment', 'certificates', 'reviews', 'portfolio', 'rfq'] as FactoryProfileTab[]).map(tab => (
                                    <button
                                        key={tab}
                                        className={activeProfileTab === tab ? 'active' : ''}
                                        onClick={() => setActiveProfileTab(tab)}
                                    >
                                        {profileTabLabels[tab]}
                                    </button>
                                ))}
                            </div>
                            {renderProfileTab(selectedFactory)}
                            <div className="mp-detail-actions">
                                <button disabled={selectedFactory.ownerId === user?.id} onClick={() => openChat(selectedFactory)}>Trao đổi</button>
                                <button disabled={selectedFactory.ownerId === user?.id} onClick={() => { const factory = selectedFactory; setSelectedFactory(null); handleOrderClick(factory); }}>
                                    {selectedFactory.ownerId === user?.id ? 'Xưởng của bạn' : 'Gửi yêu cầu'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showChatModal && chatTarget && (
                <div className="fb-chat-popup">
                    <div className="fb-chat-header" onClick={() => setShowChatModal(false)}>
                        <div className="fb-chat-header-info">
                            <img src={chatTarget.factoryImageUrl || chatTarget.factoryImages?.[0] || fallbackFactoryImages[getFactoryImageSeed(chatTarget) % fallbackFactoryImages.length]} alt="avatar" />
                            <div className="fb-chat-header-text">
                                <h4>{chatTarget.name}</h4>
                                <span style={{ color: '#10b981' }}>Đang hoạt động</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button className="fb-chat-action-btn" onClick={(e) => e.stopPropagation()} title="Tính năng gọi thoại sắp ra mắt" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                                <span className="material-symbols-outlined" style={{fontSize: 20}}>call</span>
                            </button>
                            <button className="fb-chat-action-btn" onClick={(e) => e.stopPropagation()} title="Tính năng gọi video sắp ra mắt" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                                <span className="material-symbols-outlined" style={{fontSize: 20}}>videocam</span>
                            </button>
                            <button className="fb-chat-close" onClick={(e) => { e.stopPropagation(); setShowChatModal(false); }}>
                                <span className="material-symbols-outlined" style={{fontSize: 20}}>close</span>
                            </button>
                        </div>
                    </div>
                    <div className="fb-chat-body">
                        {chatMessages.map((msg, i) => (
                            <div key={i} className={`fb-msg-row ${msg.sender === 'me' ? 'sent' : 'received'}`}>
                                <div className="fb-msg-bubble">
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="fb-chat-footer">
                        <span className="material-symbols-outlined" style={{color: '#d4a574', opacity: 0.5, cursor: 'not-allowed', fontSize: 24}} title="Tính năng gửi file sắp ra mắt">attach_file</span>
                        <span className="material-symbols-outlined" style={{color: '#d4a574', opacity: 0.5, cursor: 'not-allowed', fontSize: 24}} title="Tính năng gửi ảnh sắp ra mắt">image</span>
                        <input
                            className="fb-chat-input"
                            placeholder="Nhập tin nhắn..."
                            value={chatDraft}
                            onChange={event => setChatDraft(event.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && chatDraft.trim()) {
                                    handleSaveChatDraft();
                                }
                            }}
                        />
                        <button className="fb-chat-send" onClick={() => { if(chatDraft.trim()) handleSaveChatDraft(); }} disabled={!chatDraft.trim()}>
                            <span className="material-symbols-outlined" style={{fontSize: 24}}>send</span>
                        </button>
                    </div>
                </div>
            )}

            {showOrderModal && (
                <div className="mp-modal-overlay" onClick={closeOrderModal}>
                    <div className="mp-modal mp-rfq-modal" onClick={event => event.stopPropagation()}>
                        <div className="mp-modal-header">
                            <div>
                                <span className="mp-rfq-kicker">Bản yêu cầu {rfqStep}/3</span>
                                <h2>{selectedSeller ? 'Gửi yêu cầu' : 'Đăng yêu cầu tìm xưởng'}</h2>
                            </div>
                            <button className="mp-modal-close" onClick={closeOrderModal}>×</button>
                        </div>
                        {selectedSeller && <div className="mp-modal-seller">Xưởng nhận RFQ: <strong>{selectedSeller.name}</strong></div>}
                        <div className="mp-rfq-steps" aria-label="Tiến độ gửi yêu cầu">
                            {RFQ_STEP_LABELS.map(item => (
                                <button
                                    key={item.step}
                                    type="button"
                                    className={`mp-rfq-step ${rfqStep === item.step ? 'is-active' : ''} ${rfqStep > item.step ? 'is-done' : ''}`}
                                    onClick={() => {
                                        if (item.step < rfqStep) setRfqStep(item.step);
                                    }}
                                >
                                    <span className="mp-rfq-step-index">{item.step}</span>
                                    <span>
                                        <strong>{item.title}</strong>
                                        <small>{item.description}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                        <form onSubmit={handleSubmitOrder}>
                            {rfqStep === 1 && (
                                <div className="mp-rfq-panel">
                                    <div className="mp-form-group">
                                        <label>Tiêu đề RFQ</label>
                                        <input value={rfqTitle} onChange={event => setRfqTitle(event.target.value)} placeholder="VD: Báo giá gia công 2 tấn Arabica" required />
                                    </div>
                                    <div className="mp-form-row">
                                        <div className="mp-form-group">
                                            <label>Dịch vụ yêu cầu (Service Required)</label>
                                            <select value={rfqRequestType} onChange={event => setRfqRequestType(event.target.value)} required>
                                                {RFQ_SERVICE_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="mp-form-group">
                                            <label>Loại sản phẩm (Product Type)</label>
                                            <select value={rfqProductName} onChange={event => setRfqProductName(event.target.value)} required>
                                                <option value="">Chọn loại cà phê</option>
                                                {COFFEE_TYPE_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mp-form-row">
                                        <div className="mp-form-group">
                                            <label>Số lượng (Quantity)</label>
                                            <input type="text" value={rfqQuantity ? new Intl.NumberFormat('vi-VN').format(rfqQuantity) : ''} onChange={event => {
                                                const numericValue = event.target.value.replace(/\D/g, '');
                                                setRfqQuantity(numericValue ? parseInt(numericValue) : 0);
                                            }} required />
                                        </div>
                                        <div className="mp-form-group">
                                            <label>Đơn vị (Unit)</label>
                                            <select value={rfqUnit} onChange={event => setRfqUnit(event.target.value)} required>
                                                {RFQ_UNIT_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {rfqStep === 2 && (
                                <div className="mp-rfq-panel">
                                    <div className="mp-form-row">
                                        <div className="mp-form-group">
                                            <label>Mức rang (Roast Profile)</label>
                                            <select value={rfqQuality} onChange={event => setRfqQuality(event.target.value)}>
                                                <option value="">Không yêu cầu</option>
                                                {ROAST_PROFILE_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="mp-form-group">
                                            <label>Quy cách đóng gói (Packaging)</label>
                                            <select value={rfqPackaging} onChange={event => setRfqPackaging(event.target.value)}>
                                                <option value="">Không yêu cầu</option>
                                                {PACKAGING_FORMAT_OPTIONS.map(option => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mp-form-row">
                                        <div className="mp-form-group">
                                            <label>Ngày nhận hàng dự kiến (Target Date)</label>
                                            <input type="date" value={rfqDeadline} onChange={event => setRfqDeadline(event.target.value)} />
                                        </div>
                                        <div className="mp-form-group">
                                            <label>Ngân sách dự kiến (Budget Range)</label>
                                            <input value={rfqBudget} onChange={event => setRfqBudget(event.target.value)} placeholder="VD: 50tr - 100tr" />
                                        </div>
                                    </div>
                                    <div className="mp-form-group">
                                        <label>Ghi chú bổ sung (Additional Notes)</label>
                                        <textarea rows={4} value={rfqNote} onChange={event => setRfqNote(event.target.value)} placeholder="Mô tả chi tiết yêu cầu của bạn..." />
                                    </div>
                                </div>
                            )}

                            {rfqStep === 3 && (
                                <div className="mp-rfq-panel">
                                    <div className="mp-rfq-delivery-heading">
                                        <span className="material-symbols-outlined">local_shipping</span>
                                        <div>
                                            <h3>Thông tin giao nhận hàng</h3>
                                            <p>Điền thông tin để xưởng xác nhận lịch giao và liên hệ khi cần.</p>
                                        </div>
                                    </div>
                                    <div className="mp-form-row">
                                        <div className="mp-form-group">
                                            <label>SĐT liên hệ <span className="mp-required">*</span></label>
                                            <input value={deliveryPhone} onChange={event => setDeliveryPhone(event.target.value)} placeholder="VD: 0912 345 678" required />
                                        </div>
                                        <div className="mp-form-group">
                                            <label>SĐT phụ (nếu không liên lạc được)</label>
                                            <input value={deliveryPhoneAlt} onChange={event => setDeliveryPhoneAlt(event.target.value)} placeholder="Tùy chọn" />
                                        </div>
                                    </div>
                                    <div className="mp-form-group">
                                        <label>Địa chỉ giao hàng <span className="mp-required">*</span></label>
                                        <input value={deliveryAddress} onChange={event => setDeliveryAddress(event.target.value)} placeholder="Địa chỉ cụ thể để xưởng giao hàng" required />
                                    </div>
                                    <div className="mp-form-row">
                                        <div className="mp-form-group">
                                            <label>Giờ giao mong muốn (từ)</label>
                                            <input type="datetime-local" value={deliveryFrom} onChange={event => setDeliveryFrom(event.target.value)} />
                                        </div>
                                        <div className="mp-form-group">
                                            <label>Giờ giao mong muốn (đến)</label>
                                            <input type="datetime-local" value={deliveryTo} onChange={event => setDeliveryTo(event.target.value)} />
                                        </div>
                                    </div>
                                    <div className="mp-form-group">
                                        <label>Nếu không liên lạc được / không nhận hàng</label>
                                        <select value={deliveryFailureAction} onChange={event => setDeliveryFailureAction(event.target.value)}>
                                            <option value="RETRY_LATER">Giao lại sau</option>
                                            <option value="LEAVE_AT_DOOR">Để hàng tại cổng/kho</option>
                                            <option value="RETURN_TO_SENDER">Trả hàng về cho xưởng</option>
                                            <option value="CONTACT_ALTERNATIVE">Liên hệ SĐT phụ</option>
                                        </select>
                                    </div>
                                    <div className="mp-form-group">
                                        <label>Ghi chú giao hàng</label>
                                        <textarea rows={2} value={deliveryNote} onChange={event => setDeliveryNote(event.target.value)} placeholder="VD: Giao cổng sau, gọi trước 30 phút..." />
                                    </div>
                                    <div className="mp-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
                                        <input type="checkbox" id="agreeTerms" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }} />
                                        <label htmlFor="agreeTerms" style={{ marginBottom: 0, cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            Tôi đã đọc và đồng ý với <a href="#" onClick={e => { e.preventDefault(); alert('Chi tiết hợp đồng dịch vụ gia công rang xay...'); }} style={{ color: 'var(--primary-color)', textDecoration: 'underline' }}>Hợp đồng dịch vụ gia công rang xay</a>
                                        </label>
                                    </div>
                                </div>
                            )}
                            <div className="mp-modal-actions">
                                <button type="button" className="mp-cancel-btn" onClick={closeOrderModal}>Hủy</button>
                                {rfqStep > 1 && (
                                    <button type="button" className="mp-back-btn" onClick={handlePrevRfqStep}>Quay lại</button>
                                )}
                                {rfqStep < 3 ? (
                                    <button type="button" className="mp-submit-btn" onClick={handleNextRfqStep}>Tiếp tục</button>
                                ) : (
                                    <button type="submit" className="mp-submit-btn" disabled={submitting || !agreeTerms} style={{ opacity: (!agreeTerms || submitting) ? 0.5 : 1, cursor: (!agreeTerms || submitting) ? 'not-allowed' : 'pointer' }}>{submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showPublishModal && (
                <div className="mp-publish-sheet-overlay" onClick={() => setShowPublishModal(false)}>
                    <div className="mp-publish-sheet" onClick={event => event.stopPropagation()}>
                        <div className="mp-publish-header">
                            <button type="button" className="mp-publish-back" onClick={() => setShowPublishModal(false)} aria-label="Quay lại">
                                <span className="material-symbols-outlined">arrow_back</span>
                            </button>
                            <h2>{editingPublishedTeam ? 'Cập nhật hồ sơ xưởng' : 'Workshop Registration'}</h2>
                        </div>
                        <form className="mp-publish-form" onSubmit={handlePublish}>
                            <div className="mp-form-group">
                                <label>Chọn xưởng</label>
                                <select
                                    value={publishTeamId}
                                    onChange={event => {
                                        const team = myTeams.find(item => item.id === event.target.value);
                                        if (team) fillPublishForm(team);
                                    }}
                                >
                                    {myTeams.map(team => <option key={team.id} value={team.id}>{team.name} {team.isPublished ? '(Đã đăng)' : ''}</option>)}
                                </select>
                            </div>
                            <div className="mp-form-group">
                                <label>Loại hình xưởng</label>
                                <select value={pubFactoryType} onChange={event => setPubFactoryType(event.target.value)}>
                                    <option value="">Chọn loại hình</option>
                                    {FACTORY_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </div>
                            <div className="mp-form-group">
                                <label>Khu vực</label>
                                <select value={pubRegion} onChange={event => setPubRegion(event.target.value)}>
                                    <option value="">Chọn khu vực</option>
                                    {REGION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                                </select>
                            </div>
                            <div className="mp-form-group">
                                <label>Chuyên môn</label>
                                <div className="mp-publish-chip-grid">
                                    {SPECIALTY_OPTIONS.map(option => {
                                        const selected = splitMultiValue(pubSpecialty).includes(option);
                                        return (
                                            <button
                                                type="button"
                                                className={selected ? 'selected' : ''}
                                                key={option}
                                                onClick={() => setPubSpecialty(toggleListValue(splitMultiValue(pubSpecialty), option).join(', '))}
                                            >
                                                {option}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <section className="mp-publish-section">
                                <h3>Năng lực sản xuất</h3>
                            </section>
                            <div className="mp-form-row mp-publish-capacity-row">
                                <div className="mp-form-group">
                                    <label>Công suất</label>
                                    <input type="text" value={pubCapacityValue ? new Intl.NumberFormat('vi-VN').format(Number(pubCapacityValue.toString().replace(/\D/g, ''))) : ''} onChange={event => {
                                        const numericValue = event.target.value.replace(/\D/g, '');
                                        setPubCapacityValue(numericValue);
                                    }} placeholder="0" />
                                </div>
                                <div className="mp-form-group">
                                    <label>Đơn vị</label>
                                    <select value={pubCapacityUnit} onChange={event => setPubCapacityUnit(event.target.value)}>
                                        <option value="kg/tháng">kg/tháng</option>
                                        <option value="tấn/tháng">tấn/tháng</option>
                                    </select>
                                </div>
                            </div>
                            <div className="mp-form-group">
                                <label>Mô tả năng lực</label>
                                <textarea
                                    rows={4}
                                    value={pubDescription}
                                    onChange={event => setPubDescription(event.target.value)}
                                    placeholder="Tối thiểu 30 ký tự mô tả chi tiết năng lực vận hành của xưởng..."
                                />
                            </div>
                            <section className="mp-publish-section">
                                <h3>Hình ảnh & Pháp lý</h3>
                            </section>
                            <div className="mp-form-group mp-publish-upload-group">
                                <label>Ảnh xưởng (1-10 ảnh)</label>
                                <label className="mp-publish-upload">
                                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFactoryImageFile} />
                                    <span className="material-symbols-outlined">add_photo_alternate</span>
                                    <strong>Thêm ảnh xưởng</strong>
                                    <small>JPG, PNG, WEBP tối đa 5MB/ảnh</small>
                                </label>
                                <input value={pubFactoryImageUrl} onChange={event => {
                                    setPubFactoryImageUrl(event.target.value);
                                    setPubFactoryImages(event.target.value ? [event.target.value, ...pubFactoryImages.slice(1)] : pubFactoryImages.slice(1));
                                }} placeholder="Hoặc dán URL ảnh đại diện xưởng" />
                                {pubFactoryImages.length > 0 && (
                                    <div className="mp-factory-image-preview-grid">
                                        {pubFactoryImages.map((image, index) => (
                                            <div className="mp-factory-image-preview" key={`${image}-${index}`}>
                                                <img src={image} alt={`Ảnh xưởng ${index + 1}`} />
                                                <button type="button" onClick={() => {
                                                    const next = pubFactoryImages.filter((_, itemIndex) => itemIndex !== index);
                                                    setPubFactoryImages(next);
                                                    setPubFactoryImageUrl(next[0] || '');
                                                }}>Xóa ảnh</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="mp-verification-form">
                                <div className="mp-verification-form-head">
                                    <div>
                                        <h3>Xác minh xưởng</h3>
                                        <p>Điền thông tin để quản trị viên kiểm tra và duyệt hồ sơ.</p>
                                    </div>
                                    {selectedPublishTeam && (
                                        <span className={`mp-verification-status ${publishVerificationStatus.toLowerCase()}`}>
                                            {verificationStatusLabel(publishVerificationStatus)}
                                        </span>
                                    )}
                                </div>
                                {selectedPublishTeam?.verificationRejectReason && (
                                    <div className="mp-verification-note">
                                        Lý do từ chối: {selectedPublishTeam.verificationRejectReason}
                                    </div>
                                )}
                                <div className="mp-verification-grid">
                                    <div className="mp-form-group">
                                        <label>Giấy phép kinh doanh</label>
                                        <input value={pubBusinessLicense} onChange={event => setPubBusinessLicense(event.target.value)} placeholder="Link tài liệu hoặc tải file bên dưới" />
                                        <label className="mp-publish-file">
                                            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => handleDocumentFile(event, setPubBusinessLicense)} />
                                            <span className="material-symbols-outlined">upload_file</span>
                                            Tải giấy phép
                                        </label>
                                    </div>
                                    <div className="mp-form-group">
                                        <label>Địa chỉ xưởng</label>
                                        <input value={pubBusinessAddress} onChange={event => setPubBusinessAddress(event.target.value)} placeholder="Địa chỉ pháp lý / địa chỉ xưởng" />
                                    </div>
                                    <div className="mp-form-group">
                                        <label>Website doanh nghiệp</label>
                                        <input value={pubWebsiteUrl} onChange={event => setPubWebsiteUrl(event.target.value)} placeholder="https://..." />
                                    </div>
                                    <div className="mp-form-group">
                                        <label>Facebook doanh nghiệp</label>
                                        <input value={pubFacebookUrl} onChange={event => setPubFacebookUrl(event.target.value)} placeholder="https://facebook.com/..." />
                                    </div>
                                    <div className="mp-form-group mp-verification-wide">
                                        <label>Chứng nhận</label>
                                        <div className="mp-publish-chip-grid">
                                            {CERTIFICATE_OPTIONS.map(option => (
                                                <button
                                                    type="button"
                                                    className={pubCertificates.includes(option) ? 'selected' : ''}
                                                    key={option}
                                                    onClick={() => setPubCertificates(toggleListValue(pubCertificates, option))}
                                                >
                                                    {option}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mp-form-group mp-verification-wide">
                                        <label>File chứng nhận</label>
                                        <input value={pubCertificationDocument} onChange={event => setPubCertificationDocument(event.target.value)} placeholder="Link tài liệu nếu có" />
                                        <label className="mp-publish-file">
                                            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => handleDocumentFile(event, setPubCertificationDocument)} />
                                            <span className="material-symbols-outlined">upload_file</span>
                                            Tải chứng nhận
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="mp-publish-bottom-bar">
                                <button type="button" className="mp-cancel-btn" onClick={() => setShowPublishModal(false)}>Hủy</button>
                                <button type="submit" className="mp-submit-btn" disabled={publishing}>
                                    {publishing ? 'Đang gửi...' : editingPublishedTeam ? 'Lưu & gửi duyệt' : 'Đăng ký xưởng'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAiMatching && (
                <div className="mp-modal-overlay" style={{background: 'rgba(9, 10, 11, 0.95)', backdropFilter: 'blur(8px)', zIndex: 10000}}>
                    <div className="mp-modal" style={{background: 'transparent', border: 'none', boxShadow: 'none', color: '#fff', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
                        {aiMatchingProgress < 100 ? (
                            <>
                                <div className="btn-spinner" style={{width: 80, height: 80, border: '4px solid rgba(212, 165, 116, 0.2)', borderTopColor: '#d4a574', borderRadius: '50%', marginBottom: 24}}></div>
                                <h2 style={{fontSize: 24, marginBottom: 12, color: '#ece8e1'}}>AI Matching Đang Phân Tích...</h2>
                                <p style={{color: '#a79d94', fontSize: 15, marginBottom: 32, maxWidth: 400}}>Hệ thống ORCA đang phân tích RFQ của bạn và tìm kiếm các xưởng phù hợp nhất dựa trên công suất, profile rang và độ tin cậy.</p>
                                <div style={{width: 300, background: 'rgba(255,255,255,0.1)', height: 6, borderRadius: 3, overflow: 'hidden'}}>
                                    <div style={{height: '100%', background: '#d4a574', width: `${aiMatchingProgress}%`, transition: 'width 0.3s ease'}}></div>
                                </div>
                            </>
                        ) : (
                            <div style={{background: '#171a1b', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 600, textAlign: 'left', animation: 'fadeIn 0.5s ease'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24}}>
                                    <span className="material-symbols-outlined" style={{fontSize: 32, color: '#10b981'}}>check_circle</span>
                                    <h2 style={{margin: 0, color: '#ece8e1'}}>Phân tích hoàn tất!</h2>
                                </div>
                                <p style={{color: '#a79d94', marginBottom: 24}}>RFQ của bạn đã được ghi nhận. AI ORCA đã tự động phân bổ RFQ này cho <strong>Top 5 xưởng phù hợp nhất</strong>.</p>

                                <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32}}>
                                    {[1, 2, 3].map((_, idx) => {
                                        const matchFactory = featuredFactories[idx] || factories[idx];
                                        if (!matchFactory) return null;
                                        return (
                                        <button
                                            key={matchFactory.id || idx}
                                            type="button"
                                            className="mp-ai-match-card"
                                            onClick={() => {
                                                setShowAiMatching(false);
                                                setSelectedFactory(matchFactory);
                                                setActiveProfileTab('overview');
                                            }}
                                            aria-label={`Xem hồ sơ ${matchFactory.name}`}
                                        >
                                            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                                                <div style={{width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontWeight: 700}}>{95 - idx * 3}%</div>
                                                <div>
                                                    <strong style={{display: 'block', color: '#ece8e1', marginBottom: 4}}>{matchFactory.name}</strong>
                                                    <span style={{fontSize: 12, color: '#a79d94'}}>Phù hợp Profile • Còn công suất</span>
                                                </div>
                                            </div>
                                            <span className="material-symbols-outlined" style={{color: '#d4a574'}}>chevron_right</span>
                                        </button>
                                    )})}
                                </div>

                                <div style={{display: 'flex', gap: 12}}>
                                    <button style={{flex: 1, padding: 14, background: '#b97820', color: '#fff', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer'}} onClick={() => { setShowAiMatching(false); navigate('/orders'); }}>Theo dõi RFQ</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

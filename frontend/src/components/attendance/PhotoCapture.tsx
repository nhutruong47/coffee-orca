import { useEffect, useRef, useState } from 'react';
interface Props { value: string; onChange: (value: string) => void; disabled?: boolean }
export default function PhotoCapture({ value, onChange, disabled = false }: Props) {
    const [error, setError] = useState('');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [opening, setOpening] = useState(false);
    const video = useRef<HTMLVideoElement>(null);
    const activeStream = useRef<MediaStream | null>(null);
    const mounted = useRef(true);
    const stop = () => { activeStream.current?.getTracks().forEach(track => track.stop()); activeStream.current = null; setStream(null); };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; activeStream.current?.getTracks().forEach(track => track.stop()); }; }, []);
    useEffect(() => { if (video.current && stream) video.current.srcObject = stream; }, [stream]);
    const open = async () => {
        setError('');
        if (!navigator.mediaDevices?.getUserMedia) { setError('Camera không khả dụng. Dùng HTTPS hoặc chọn ảnh từ thiết bị.'); return; }
        setOpening(true);
        try {
            const result = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
            if (!mounted.current) { result.getTracks().forEach(track => track.stop()); return; }
            activeStream.current = result; setStream(result);
        } catch { if (mounted.current) setError('Không mở được camera. Kiểm tra quyền camera hoặc chọn ảnh từ thiết bị.'); }
        finally { if (mounted.current) setOpening(false); }
    };
    const encode = (source: CanvasImageSource, width: number, height: number) => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 960 / Math.max(width, height));
        canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Không xử lý được ảnh trên thiết bị này.');
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.85, 0.7, 0.5, 0.3]) {
            const data = canvas.toDataURL('image/jpeg', quality);
            if (data.startsWith('data:image/jpeg;base64,') && Math.ceil(data.split(',')[1].length * 3 / 4) <= 300 * 1024) { onChange(data); stop(); return; }
        }
        throw new Error('Ảnh quá lớn. Chọn ảnh nhỏ hơn 300 KB sau nén.');
    };
    const capture = () => {
        setError('');
        if (!video.current?.videoWidth) { setError('Camera chưa sẵn sàng. Vui lòng chờ rồi chụp lại.'); return; }
        try { encode(video.current, video.current.videoWidth, video.current.videoHeight); }
        catch (err) { setError((err as Error).message); }
    };
    const choose = (file?: File) => {
        setError(''); if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) { setError('Chọn tệp ảnh dưới 12 MB.'); return; }
        const url = URL.createObjectURL(file); const image = new Image();
        image.onload = () => { try { if (mounted.current) encode(image, image.naturalWidth, image.naturalHeight); } catch (err) { setError((err as Error).message); } finally { URL.revokeObjectURL(url); } };
        image.onerror = () => { URL.revokeObjectURL(url); if (mounted.current) setError('Không đọc được ảnh đã chọn.'); };
        image.src = url;
    };
    return <div className="attendance-camera"><p>Ảnh chấm công {value ? 'đã chọn' : 'chưa có'} · Chỉ gửi ảnh bạn chụp/chọn thật.</p>
        {stream ? <><video ref={video} autoPlay muted playsInline aria-label="Camera trực tiếp" /><div><button type="button" disabled={disabled} onClick={capture}>Chụp ảnh</button><button type="button" onClick={stop}>Đóng camera</button></div></> : <button type="button" onClick={() => void open()} disabled={disabled || opening}>{opening ? 'Đang mở camera…' : 'Mở camera'}</button>}
        <label>Chọn ảnh hoặc chụp trên điện thoại<input type="file" accept="image/*" capture="user" disabled={disabled} onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} /></label>
        {value && <><img src={value} alt="Ảnh chấm công chuẩn bị gửi" /><button type="button" disabled={disabled} onClick={() => onChange('')}>Bỏ ảnh</button></>}
        {error && <p role="alert">{error}</p>}
    </div>;
}

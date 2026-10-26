import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PhotoCapture from './PhotoCapture';
describe('photo capture', () => {
    it('requests camera only on click, displays denial and leaves optional photo empty', async () => {
        const camera = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: camera } });
        const onChange = vi.fn(); render(<PhotoCapture value="" onChange={onChange} />);
        expect(camera).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Mở camera' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Không mở được camera/);
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByLabelText(/Chọn ảnh/)).toHaveAttribute('capture', 'user');
    });
});

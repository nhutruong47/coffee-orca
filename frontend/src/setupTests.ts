import '@testing-library/jest-dom';
import { vi } from 'vitest';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock localStorage for Node 22+ / jsdom environments
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = String(value);
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  }),
  key: vi.fn((i: number) => Object.keys(storage)[i] ?? null),
  get length() {
    return Object.keys(storage).length;
  },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
}

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

const TestComponent = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
};

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides the default theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    // Should match system preference or fallback to dark
    const themeValue = screen.getByTestId('theme-value').textContent;
    expect(['dark', 'light']).toContain(themeValue);
  });

  it('toggles the theme correctly', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    const initialTheme = screen.getByTestId('theme-value').textContent;
    
    act(() => {
      screen.getByText('Toggle').click();
    });

    const newTheme = screen.getByTestId('theme-value').textContent;
    expect(newTheme).not.toBe(initialTheme);
  });
});

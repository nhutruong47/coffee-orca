import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AiAssistantPanel from './AiAssistantPanel';
import { BrowserRouter } from 'react-router-dom';

// Mock context and services
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'user-1' } })
}));

vi.mock('../services/AiService', () => ({
  default: {
    queryRag: vi.fn(),
    generatePlan: vi.fn(),
    revisePlan: vi.fn(),
    promotePlanToGoal: vi.fn()
  }
}));

describe('AiAssistantPanel', () => {
  it('renders the chat interface correctly', () => {
    render(
      <BrowserRouter>
        <AiAssistantPanel 
          trialActive={true} 
          trialDays={14} 
          teamId="test-team" 
        />
      </BrowserRouter>
    );
    // Find the input by looking for either disabled state or active placeholder
    const input = document.querySelector('.form-input');
    expect(input).toBeInTheDocument();
  });
});

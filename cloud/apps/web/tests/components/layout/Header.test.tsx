import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Header } from '../../../src/components/layout/Header';

const mockLogout = vi.fn();
const mockUser = { id: '1', email: 'test@example.com', name: 'Test User' };

vi.mock('../../../src/auth/hooks', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}));

function renderHeader() {
  return render(
    <BrowserRouter>
      <Header />
    </BrowserRouter>
  );
}

describe('Header Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render logo', () => {
    renderHeader();
    expect(screen.getByText('ValueRank')).toBeInTheDocument();
  });

  it('should render user initials from name', () => {
    renderHeader();
    expect(screen.getByText('TU')).toBeInTheDocument();
  });

  it('should render user name', () => {
    renderHeader();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('should open dropdown when clicking user button', async () => {
    renderHeader();
    const userButton = screen.getByRole('button');
    await userEvent.click(userButton);
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('should show user email in dropdown', async () => {
    renderHeader();
    const userButton = screen.getByRole('button');
    await userEvent.click(userButton);
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('should call logout when clicking sign out', async () => {
    renderHeader();
    const userButton = screen.getByRole('button');
    await userEvent.click(userButton);
    const signOutButton = screen.getByText('Sign out');
    await userEvent.click(signOutButton);
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should close dropdown when clicking outside', async () => {
    renderHeader();
    const userButton = screen.getByRole('button');
    await userEvent.click(userButton);
    expect(screen.getByText('Sign out')).toBeInTheDocument();

    // Click outside (on the document body)
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
    });
  });
});

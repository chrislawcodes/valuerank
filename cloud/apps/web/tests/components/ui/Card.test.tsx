import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card, CardHeader, CardContent, CardFooter } from '../../../src/components/ui/Card';

describe('Card', () => {
  describe('rendering', () => {
    it('should render children correctly', () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('should apply default variant styles', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('border', 'border-gray-200');
    });

    it('should apply bordered variant styles', () => {
      render(<Card data-testid="card" variant="bordered">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('border-2', 'border-gray-300');
    });

    it('should apply elevated variant styles', () => {
      render(<Card data-testid="card" variant="elevated">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('shadow-md');
    });

    it('should apply interactive variant styles', () => {
      render(<Card data-testid="card" variant="interactive">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('cursor-pointer', 'hover:shadow-md');
    });
  });

  describe('padding variants', () => {
    it('should apply default padding', () => {
      render(<Card data-testid="card">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('p-4');
    });

    it('should apply compact padding', () => {
      render(<Card data-testid="card" padding="compact">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('p-3');
    });

    it('should apply spacious padding', () => {
      render(<Card data-testid="card" padding="spacious">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('p-6');
    });

    it('should apply no padding when none specified', () => {
      render(<Card data-testid="card" padding="none">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).not.toHaveClass('p-3', 'p-4', 'p-6');
    });
  });

  describe('interactivity', () => {
    it('should handle onClick for interactive cards', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Card onClick={handleClick}>Clickable</Card>);

      await user.click(screen.getByText('Clickable'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should add button role when onClick is provided', () => {
      render(<Card data-testid="card" onClick={() => {}}>Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveAttribute('role', 'button');
    });

    it('should be keyboard accessible when interactive', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Card data-testid="card" onClick={handleClick}>Content</Card>);

      const card = screen.getByTestId('card');
      card.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should handle Space key for interactive cards', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<Card data-testid="card" onClick={handleClick}>Content</Card>);

      const card = screen.getByTestId('card');
      card.focus();
      await user.keyboard(' ');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should have tabIndex 0 when interactive', () => {
      render(<Card data-testid="card" onClick={() => {}}>Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('custom className', () => {
    it('should merge custom className with default styles', () => {
      render(<Card data-testid="card" className="custom-class">Content</Card>);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('custom-class');
      expect(card).toHaveClass('rounded-lg', 'bg-white');
    });
  });
});

describe('CardHeader', () => {
  it('should render children', () => {
    render(<CardHeader>Header Content</CardHeader>);
    expect(screen.getByText('Header Content')).toBeInTheDocument();
  });

  it('should have border-bottom styling', () => {
    render(<CardHeader data-testid="header">Header</CardHeader>);
    expect(screen.getByTestId('header')).toHaveClass('border-b');
  });
});

describe('CardContent', () => {
  it('should render children', () => {
    render(<CardContent>Body Content</CardContent>);
    expect(screen.getByText('Body Content')).toBeInTheDocument();
  });
});

describe('CardFooter', () => {
  it('should render children', () => {
    render(<CardFooter>Footer Content</CardFooter>);
    expect(screen.getByText('Footer Content')).toBeInTheDocument();
  });

  it('should have border-top styling', () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>);
    expect(screen.getByTestId('footer')).toHaveClass('border-t');
  });
});

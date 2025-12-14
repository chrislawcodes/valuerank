import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, getStatusVariant } from '../../../src/components/ui/Badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('should render children correctly', () => {
      render(<Badge>Badge text</Badge>);
      expect(screen.getByText('Badge text')).toBeInTheDocument();
    });

    it('should apply default neutral variant', () => {
      render(<Badge data-testid="badge">Default</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-gray-100', 'text-gray-700');
    });
  });

  describe('status variants', () => {
    it('should apply success variant styles', () => {
      render(<Badge data-testid="badge" variant="success">Success</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-green-100', 'text-green-700');
    });

    it('should apply warning variant styles', () => {
      render(<Badge data-testid="badge" variant="warning">Warning</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-amber-100', 'text-amber-700');
    });

    it('should apply error variant styles', () => {
      render(<Badge data-testid="badge" variant="error">Error</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-red-100', 'text-red-700');
    });

    it('should apply info variant styles', () => {
      render(<Badge data-testid="badge" variant="info">Info</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-blue-100', 'text-blue-700');
    });

    it('should apply tag variant styles', () => {
      render(<Badge data-testid="badge" variant="tag">Tag</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('bg-gray-100', 'text-gray-600');
    });
  });

  describe('size variants', () => {
    it('should apply small size', () => {
      render(<Badge data-testid="badge" size="sm">Small</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-xs', 'px-2', 'py-0.5');
    });

    it('should apply medium size (default)', () => {
      render(<Badge data-testid="badge" size="md">Medium</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-sm', 'px-2.5', 'py-1');
    });

    it('should apply large size', () => {
      render(<Badge data-testid="badge" size="lg">Large</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-base', 'px-3', 'py-1.5');
    });

    it('should apply count size with rounded-full', () => {
      render(<Badge data-testid="badge" size="count">5</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('rounded-full', 'min-w-[1.25rem]', 'justify-center');
    });
  });

  describe('truncation', () => {
    it('should apply truncation styles when maxWidth is provided', () => {
      render(
        <Badge data-testid="badge" maxWidth="100px">
          Very long text that should be truncated
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveStyle({ maxWidth: '100px' });
    });

    it('should set title attribute for truncated content', () => {
      render(
        <Badge data-testid="badge" maxWidth="100px">
          Long content for title
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('title', 'Long content for title');
    });

    it('should use custom title when provided with maxWidth', () => {
      render(
        <Badge data-testid="badge" maxWidth="100px" title="Custom title">
          Content
        </Badge>
      );
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveAttribute('title', 'Custom title');
    });
  });

  describe('custom className', () => {
    it('should merge custom className', () => {
      render(<Badge data-testid="badge" className="custom-class">Badge</Badge>);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('custom-class');
      expect(badge).toHaveClass('inline-flex', 'items-center');
    });
  });
});

describe('getStatusVariant', () => {
  it('should return success for completed status', () => {
    expect(getStatusVariant('completed')).toBe('success');
    expect(getStatusVariant('COMPLETED')).toBe('success');
  });

  it('should return warning for running status', () => {
    expect(getStatusVariant('running')).toBe('warning');
    expect(getStatusVariant('RUNNING')).toBe('warning');
  });

  it('should return warning for summarizing status', () => {
    expect(getStatusVariant('summarizing')).toBe('warning');
    expect(getStatusVariant('SUMMARIZING')).toBe('warning');
  });

  it('should return error for failed status', () => {
    expect(getStatusVariant('failed')).toBe('error');
    expect(getStatusVariant('FAILED')).toBe('error');
  });

  it('should return error for cancelled status', () => {
    expect(getStatusVariant('cancelled')).toBe('error');
    expect(getStatusVariant('CANCELLED')).toBe('error');
  });

  it('should return info for pending status', () => {
    expect(getStatusVariant('pending')).toBe('info');
    expect(getStatusVariant('PENDING')).toBe('info');
  });

  it('should return neutral for unknown status', () => {
    expect(getStatusVariant('unknown')).toBe('neutral');
    expect(getStatusVariant('other')).toBe('neutral');
  });
});

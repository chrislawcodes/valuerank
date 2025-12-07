import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  InheritanceIndicator,
  InheritanceBanner,
} from '../../../src/components/definitions/InheritanceIndicator';

describe('InheritanceIndicator', () => {
  describe('when not forked', () => {
    it('should return null for root definitions', () => {
      const { container } = render(
        <InheritanceIndicator
          isOverridden={false}
          isForked={false}
          fieldName="preamble"
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('should return null even when overridden flag is true', () => {
      const { container } = render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={false}
          fieldName="template"
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('badge variant (default)', () => {
    it('should show "Local" badge when property is overridden', () => {
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="preamble"
        />
      );

      expect(screen.getByText('Local')).toBeInTheDocument();
      expect(screen.queryByText('Inherited')).not.toBeInTheDocument();
    });

    it('should show "Inherited" badge when property is not overridden', () => {
      render(
        <InheritanceIndicator
          isOverridden={false}
          isForked={true}
          fieldName="template"
        />
      );

      expect(screen.getByText('Inherited')).toBeInTheDocument();
      expect(screen.queryByText('Local')).not.toBeInTheDocument();
    });

    it('should have correct title for local badge', () => {
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="preamble"
        />
      );

      const badge = screen.getByTitle('preamble is locally defined');
      expect(badge).toBeInTheDocument();
    });

    it('should have correct title for inherited badge', () => {
      render(
        <InheritanceIndicator
          isOverridden={false}
          isForked={true}
          fieldName="template"
        />
      );

      const badge = screen.getByTitle('template is inherited from parent');
      expect(badge).toBeInTheDocument();
    });

    it('should show "Inherit from parent" button when overridden with callback', () => {
      const onClearOverride = vi.fn();
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="dimensions"
          onClearOverride={onClearOverride}
        />
      );

      expect(screen.getByText('Inherit from parent')).toBeInTheDocument();
    });

    it('should not show "Inherit from parent" button without callback', () => {
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="dimensions"
        />
      );

      expect(screen.queryByText('Inherit from parent')).not.toBeInTheDocument();
    });

    it('should not show "Inherit from parent" button when not overridden', () => {
      const onClearOverride = vi.fn();
      render(
        <InheritanceIndicator
          isOverridden={false}
          isForked={true}
          fieldName="preamble"
          onClearOverride={onClearOverride}
        />
      );

      expect(screen.queryByText('Inherit from parent')).not.toBeInTheDocument();
    });

    it('should call onClearOverride when "Inherit from parent" is clicked', async () => {
      const user = userEvent.setup();
      const onClearOverride = vi.fn();
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="template"
          onClearOverride={onClearOverride}
        />
      );

      await user.click(screen.getByText('Inherit from parent'));
      expect(onClearOverride).toHaveBeenCalledTimes(1);
    });

    it('should have correct title on inherit button', () => {
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="preamble"
          onClearOverride={() => {}}
        />
      );

      const button = screen.getByTitle('Clear local preamble and inherit from parent');
      expect(button).toBeInTheDocument();
    });
  });

  describe('inline variant', () => {
    it('should show "(local)" text when property is overridden', () => {
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="preamble"
          variant="inline"
        />
      );

      expect(screen.getByText('(local)')).toBeInTheDocument();
      expect(screen.queryByText('(inherited)')).not.toBeInTheDocument();
    });

    it('should show "(inherited)" text when property is not overridden', () => {
      render(
        <InheritanceIndicator
          isOverridden={false}
          isForked={true}
          fieldName="template"
          variant="inline"
        />
      );

      expect(screen.getByText('(inherited)')).toBeInTheDocument();
      expect(screen.queryByText('(local)')).not.toBeInTheDocument();
    });

    it('should have correct title for local text', () => {
      render(
        <InheritanceIndicator
          isOverridden={true}
          isForked={true}
          fieldName="dimensions"
          variant="inline"
        />
      );

      const badge = screen.getByTitle('dimensions is locally defined');
      expect(badge).toBeInTheDocument();
    });

    it('should have correct title for inherited text', () => {
      render(
        <InheritanceIndicator
          isOverridden={false}
          isForked={true}
          fieldName="preamble"
          variant="inline"
        />
      );

      const badge = screen.getByTitle('preamble is inherited from parent');
      expect(badge).toBeInTheDocument();
    });
  });
});

describe('InheritanceBanner', () => {
  it('should return null when not forked', () => {
    const { container } = render(<InheritanceBanner isForked={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render banner when forked', () => {
    render(<InheritanceBanner isForked={true} />);

    expect(screen.getByText(/This is a fork of/i)).toBeInTheDocument();
  });

  it('should show parent name when provided', () => {
    render(
      <InheritanceBanner
        isForked={true}
        parentName="Parent Definition"
        parentId="parent-123"
      />
    );

    expect(screen.getByText('Parent Definition')).toBeInTheDocument();
  });

  it('should show fallback when parent name not provided', () => {
    render(<InheritanceBanner isForked={true} />);

    expect(screen.getByText('parent definition')).toBeInTheDocument();
  });

  it('should render parent name as clickable when onViewParent provided', () => {
    const onViewParent = vi.fn();
    render(
      <InheritanceBanner
        isForked={true}
        parentName="Original Definition"
        parentId="parent-456"
        onViewParent={onViewParent}
      />
    );

    const button = screen.getByRole('button', { name: 'Original Definition' });
    expect(button).toBeInTheDocument();
  });

  it('should call onViewParent when parent name is clicked', async () => {
    const user = userEvent.setup();
    const onViewParent = vi.fn();
    render(
      <InheritanceBanner
        isForked={true}
        parentName="Original Definition"
        parentId="parent-789"
        onViewParent={onViewParent}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Original Definition' }));
    expect(onViewParent).toHaveBeenCalledTimes(1);
  });

  it('should not render parent as button when onViewParent not provided', () => {
    render(
      <InheritanceBanner
        isForked={true}
        parentName="Static Parent"
        parentId="parent-abc"
      />
    );

    expect(screen.queryByRole('button', { name: 'Static Parent' })).not.toBeInTheDocument();
    expect(screen.getByText('Static Parent')).toBeInTheDocument();
  });

  it('should show inheritance explanation text', () => {
    render(<InheritanceBanner isForked={true} parentName="Test Parent" />);

    expect(
      screen.getByText('Properties without local overrides are inherited from parent')
    ).toBeInTheDocument();
  });
});

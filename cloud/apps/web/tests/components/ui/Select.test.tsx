import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, type SelectOption } from '../../../src/components/ui/Select';

const defaultOptions: SelectOption[] = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

describe('Select', () => {
  describe('rendering', () => {
    it('should render placeholder when no value selected', () => {
      render(
        <Select options={defaultOptions} onChange={() => {}} placeholder="Choose one" />
      );
      expect(screen.getByText('Choose one')).toBeInTheDocument();
    });

    it('should render selected option label', () => {
      render(
        <Select options={defaultOptions} value="option2" onChange={() => {}} />
      );
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });

    it('should render label when provided', () => {
      render(
        <Select options={defaultOptions} onChange={() => {}} label="Select Option" />
      );
      expect(screen.getByText('Select Option')).toBeInTheDocument();
    });

    it('should render error message when provided', () => {
      render(
        <Select options={defaultOptions} onChange={() => {}} error="Required field" />
      );
      expect(screen.getByText('Required field')).toBeInTheDocument();
    });
  });

  describe('dropdown behavior', () => {
    it('should open dropdown on click', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      await user.click(screen.getByRole('button'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should close dropdown on second click', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      await user.click(trigger);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.click(trigger);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('should show all options in dropdown', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
      expect(screen.getByText('Option 3')).toBeInTheDocument();
    });

    it('should close dropdown on outside click', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <Select options={defaultOptions} onChange={() => {}} />
          <button>Outside</button>
        </div>
      );

      await user.click(screen.getByRole('button', { name: /select/i }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.click(screen.getByText('Outside'));
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('selection', () => {
    it('should call onChange when option is clicked', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Select options={defaultOptions} onChange={handleChange} />);

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByText('Option 2'));

      expect(handleChange).toHaveBeenCalledWith('option2');
    });

    it('should close dropdown after selection', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByText('Option 2'));

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('should show check icon for selected option', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} value="option2" onChange={() => {}} />);

      await user.click(screen.getByRole('button'));

      const selectedOption = screen.getByRole('option', { selected: true });
      expect(selectedOption).toHaveTextContent('Option 2');
    });
  });

  describe('keyboard navigation', () => {
    it('should open dropdown on Enter', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard('{Enter}');

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should open dropdown on Space', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard(' ');

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should navigate down with ArrowDown', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} value="option1" onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard('{Enter}');
      await user.keyboard('{ArrowDown}');

      // Verify highlight moved (visual check - highlighted option gets bg-teal-50)
      const options = screen.getAllByRole('option');
      expect(options[1]).toHaveClass('bg-teal-50');
    });

    it('should navigate up with ArrowUp', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} value="option2" onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard('{Enter}');
      await user.keyboard('{ArrowUp}');

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveClass('bg-teal-50');
    });

    it('should select highlighted option with Enter', async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();
      render(<Select options={defaultOptions} value="option1" onChange={handleChange} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard('{Enter}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(handleChange).toHaveBeenCalledWith('option2');
    });

    it('should close dropdown on Escape', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      await user.click(screen.getByRole('button'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('should go to first option on Home', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} value="option3" onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard('{Enter}');
      await user.keyboard('{Home}');

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveClass('bg-teal-50');
    });

    it('should go to last option on End', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} value="option1" onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard('{Enter}');
      await user.keyboard('{End}');

      const options = screen.getAllByRole('option');
      expect(options[2]).toHaveClass('bg-teal-50');
    });
  });

  describe('disabled state', () => {
    it('should not open when disabled', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} disabled />);

      await user.click(screen.getByRole('button'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('should have disabled attribute', () => {
      render(<Select options={defaultOptions} onChange={() => {}} disabled />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should skip disabled options during keyboard navigation', async () => {
      const user = userEvent.setup();
      const optionsWithDisabled: SelectOption[] = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2', disabled: true },
        { value: 'option3', label: 'Option 3' },
      ];
      render(<Select options={optionsWithDisabled} value="option1" onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      trigger.focus();
      await user.keyboard('{Enter}');
      await user.keyboard('{ArrowDown}');

      // Should skip option2 and highlight option3
      const options = screen.getAllByRole('option');
      expect(options[2]).toHaveClass('bg-teal-50');
    });
  });

  describe('accessibility', () => {
    it('should have aria-haspopup on trigger', () => {
      render(<Select options={defaultOptions} onChange={() => {}} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('should have aria-expanded based on open state', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} onChange={() => {}} />);

      const trigger = screen.getByRole('button');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('should have aria-selected on options', async () => {
      const user = userEvent.setup();
      render(<Select options={defaultOptions} value="option2" onChange={() => {}} />);

      await user.click(screen.getByRole('button'));

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'false');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
      expect(options[2]).toHaveAttribute('aria-selected', 'false');
    });

    it('should have aria-disabled on disabled options', async () => {
      const user = userEvent.setup();
      const optionsWithDisabled: SelectOption[] = [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2', disabled: true },
      ];
      render(<Select options={optionsWithDisabled} onChange={() => {}} />);

      await user.click(screen.getByRole('button'));

      const options = screen.getAllByRole('option');
      expect(options[1]).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

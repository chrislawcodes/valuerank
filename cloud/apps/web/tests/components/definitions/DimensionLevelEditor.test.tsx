import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DimensionLevelEditor } from '../../../src/components/definitions/DimensionLevelEditor';

const mockLevel = {
  score: 1,
  label: 'Low Risk',
  description: 'A low risk scenario',
  options: ['minimal', 'negligible'],
};

describe('DimensionLevelEditor', () => {
  it('renders level information', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Low Risk')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A low risk scenario')).toBeInTheDocument();
    expect(screen.getByDisplayValue('minimal, negligible')).toBeInTheDocument();
  });

  it('displays correct level index', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={4}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    expect(screen.getByText('Level 5')).toBeInTheDocument();
  });

  it('calls onChange when score is changed', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const scoreInput = screen.getByDisplayValue('1');
    fireEvent.change(scoreInput, { target: { value: '2' } });

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      score: 2,
    });
  });

  it('does not call onChange for invalid score', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const scoreInput = screen.getByDisplayValue('1');
    fireEvent.change(scoreInput, { target: { value: 'invalid' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange when label is changed', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const labelInput = screen.getByDisplayValue('Low Risk');
    fireEvent.change(labelInput, { target: { value: 'Medium Risk' } });

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      label: 'Medium Risk',
    });
  });

  it('calls onChange when description is changed', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const descriptionInput = screen.getByDisplayValue('A low risk scenario');
    fireEvent.change(descriptionInput, { target: { value: 'Updated description' } });

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      description: 'Updated description',
    });
  });

  it('clears description when empty', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const descriptionInput = screen.getByDisplayValue('A low risk scenario');
    fireEvent.change(descriptionInput, { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      description: undefined,
    });
  });

  it('calls onChange when options are changed', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const optionsInput = screen.getByDisplayValue('minimal, negligible');
    fireEvent.change(optionsInput, { target: { value: 'low, minimal, trivial' } });
    fireEvent.blur(optionsInput);

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      options: ['low', 'minimal', 'trivial'],
    });
  });

  it('clears options when empty', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const optionsInput = screen.getByDisplayValue('minimal, negligible');
    fireEvent.change(optionsInput, { target: { value: '' } });
    fireEvent.blur(optionsInput);

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      options: undefined,
    });
  });

  it('shows remove button when canRemove is true', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const removeButton = screen.getByRole('button');
    expect(removeButton).toBeInTheDocument();
  });

  it('hides remove button when canRemove is false', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={false}
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalled();
  });

  it('renders level without description', () => {
    const levelWithoutDesc = { ...mockLevel, description: undefined };
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={levelWithoutDesc}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const descriptionInput = screen.getByPlaceholderText('A brief description of this level...');
    expect(descriptionInput).toHaveValue('');
  });

  it('renders level without options', () => {
    const levelWithoutOpts = { ...mockLevel, options: undefined };
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={levelWithoutOpts}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const optionsInput = screen.getByPlaceholderText('e.g., minimal, negligible, trivial');
    expect(optionsInput).toHaveValue('');
  });

  it('handles decimal scores', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const scoreInput = screen.getByDisplayValue('1');
    fireEvent.change(scoreInput, { target: { value: '1.5' } });

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      score: 1.5,
    });
  });

  it('trims whitespace from options', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const optionsInput = screen.getByDisplayValue('minimal, negligible');
    fireEvent.change(optionsInput, { target: { value: '  option1  ,  option2  ' } });
    fireEvent.blur(optionsInput);

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      options: ['option1', 'option2'],
    });
  });

  it('filters out empty options', () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();

    render(
      <DimensionLevelEditor
        level={mockLevel}
        index={0}
        onChange={onChange}
        onRemove={onRemove}
        canRemove={true}
      />
    );

    const optionsInput = screen.getByDisplayValue('minimal, negligible');
    fireEvent.change(optionsInput, { target: { value: 'option1, , option2, ' } });
    fireEvent.blur(optionsInput);

    expect(onChange).toHaveBeenCalledWith({
      ...mockLevel,
      options: ['option1', 'option2'],
    });
  });
});

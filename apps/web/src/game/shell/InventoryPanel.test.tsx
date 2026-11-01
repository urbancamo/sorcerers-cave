import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InventoryPanel } from './InventoryPanel';
import type { InventoryRow } from '../inventory';

const row = (over: Partial<InventoryRow> = {}): InventoryRow => ({ mi: 0, idx: 0, tid: 12, name: 'Charmed Flute', weight: 0, artifact: true,
  carrier: 'Hero', color: 'green', tag: 'usable now', ...over });

describe('InventoryPanel', () => {
  it('shows each item with its carrier and a text tag as well as colour', () => {
    render(<InventoryPanel rows={[row(), row({ idx: 1, name: 'Silver', weight: 25, color: 'gray', tag: 'treasure only', carrier: 'Dwarf' })]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText('usable now')).toBeInTheDocument();
    expect(screen.getByText('treasure only')).toBeInTheDocument();
    expect(screen.getByText(/carried by Dwarf · 25 kg/)).toBeInTheDocument();
  });

  it('selects an item for the card panel', () => {
    const onSelect = vi.fn();
    const r = row();
    render(<InventoryPanel rows={[r]} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /Charmed Flute/ }));
    expect(onSelect).toHaveBeenCalledWith(r);
  });

  it('says so when nothing is carried, and offers treasure management only when wired', () => {
    const { rerender } = render(<InventoryPanel rows={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText('The party carries nothing.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move or drop/ })).toBeNull();
    const onManage = vi.fn();
    rerender(<InventoryPanel rows={[]} selected={null} onSelect={() => {}} onManage={onManage} />);
    fireEvent.click(screen.getByRole('button', { name: /Move or drop/ }));
    expect(onManage).toHaveBeenCalledOnce();
  });
});

describe('InventoryPanel help', () => {
  it('explains the status colours and what an item can do', () => {
    render(<InventoryPanel rows={[row()]} selected={null} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Help with the inventory' }));
    const pop = screen.getByTestId('help-popover');
    expect(pop).toHaveTextContent(/usable now/);
    expect(pop).toHaveTextContent(/give it to another member/);
  });
});

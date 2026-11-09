import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConvexError } from 'convex/values';
import { BugReportModal } from './BugReportModal';

vi.mock('../../convex/_generated/api', () => ({ api: { bugReport: { submit: 'bugReport:submit' } } }));
const { submitMock } = vi.hoisted(() => ({ submitMock: vi.fn() }));
vi.mock('convex/react', () => ({ useMutation: () => submitMock }));

const GAME = 'game1' as never;
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  submitMock.mockReset();
  submitMock.mockResolvedValue({ ref: 'ref123', code: 'ABCD' });
});

describe('BugReportModal', () => {
  it('disables Send until the description is at least 10 characters', () => {
    render(<BugReportModal gameId={GAME} onClose={() => {}} />);
    const send = screen.getByRole('button', { name: /send report/i });
    expect(send).toBeDisabled();
    type(/what happened/i, 'too short');
    expect(send).toBeDisabled();
    type(/what happened/i, 'The Dragon did not wake up');
    expect(send).not.toBeDisabled();
  });

  it('submits the form with the game, category and browser details', async () => {
    render(<BugReportModal gameId={GAME} onClose={() => {}} />);
    type(/what happened/i, '  The Dragon did not wake up  ');
    type(/what did you expect/i, 'It should wake');
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'display' } });
    type(/contact/i, 'me@example.com');
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledOnce());
    const arg = submitMock.mock.calls[0]![0];
    expect(arg).toMatchObject({
      gameId: GAME, description: 'The Dragon did not wake up', expected: 'It should wake', category: 'display', contact: 'me@example.com',
    });
    expect(arg.client.userAgent).toBe(navigator.userAgent);
    expect(arg.client.viewport).toMatch(/^\d+x\d+$/);
    expect(typeof arg.client.build).toBe('string');
  });

  it('leaves optional fields out when blank and omits the game when there is none', async () => {
    render(<BugReportModal gameId={null} onClose={() => {}} />);
    type(/what happened/i, 'The Dragon did not wake up');
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledOnce());
    const arg = submitMock.mock.calls[0]![0];
    expect(arg.gameId).toBeUndefined();
    expect(arg.expected).toBeUndefined();
    expect(arg.contact).toBeUndefined();
  });

  it('shows the reference and game code after sending', async () => {
    render(<BugReportModal gameId={GAME} onClose={() => {}} />);
    type(/what happened/i, 'The Dragon did not wake up');
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    expect(await screen.findByTestId('bug-ref')).toHaveTextContent('ref123');
    expect(screen.getByTestId('bug-code')).toHaveTextContent('ABCD');
  });

  it('keeps the typed text and shows the server message when sending fails', async () => {
    submitMock.mockRejectedValue(new ConvexError('Too many reports; please try again later.'));
    render(<BugReportModal gameId={GAME} onClose={() => {}} />);
    type(/what happened/i, 'The Dragon did not wake up');
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many reports');
    expect(screen.getByLabelText(/what happened/i)).toHaveValue('The Dragon did not wake up');
    expect(screen.getByRole('button', { name: /send report/i })).not.toBeDisabled();
  });

  it('shows a generic message for an unexpected error', async () => {
    submitMock.mockRejectedValue(new Error('boom'));
    render(<BugReportModal gameId={GAME} onClose={() => {}} />);
    type(/what happened/i, 'The Dragon did not wake up');
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send/i);
  });

  it('states what is sent and that the issue is public, and offers help', () => {
    render(<BugReportModal gameId={GAME} onClose={() => {}} />);
    expect(screen.getByTestId('bug-privacy')).toHaveTextContent(/public/i);
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('closes without submitting anything', () => {
    const onClose = vi.fn();
    render(<BugReportModal gameId={GAME} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(submitMock).not.toHaveBeenCalled();
  });
});

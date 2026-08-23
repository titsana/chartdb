import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../use-debounce-v2';

/**
 * This hook exists specifically to prevent the appendix-b:6 class of bug
 * (see debounce.test.ts's doc comment): a stale pending debounce firing
 * later against whatever it closed over when created. canvas.tsx's
 * "table falls out of its area on a fast drag" bug (fixed this session)
 * was exactly this, at a call site that recreated a raw `debounce(...)`
 * fresh on every drag-move frame instead of using this hook — dozens of
 * uncoordinated, never-canceled timers racing each other. These tests
 * pin the property that fix now relies on: repeated calls collapse into
 * ONE, using the latest data, even across a re-render.
 */
describe('useDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('collapses many rapid calls into one, using the latest args', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useDebounce(fn, 100));

        act(() => {
            result.current('a');
            result.current('b');
            result.current('c');
        });
        act(() => {
            vi.advanceTimersByTime(100);
        });

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('c');
    });

    // The exact mechanism canvas.tsx's fix depends on: a rapid sequence of
    // calls (simulating drag-move frames) across a re-render (simulating
    // `nodes` changing) must still fire only once, for the LAST call —
    // never once per frame, and never for a stale intermediate one.
    it('cancels a pending call when the wrapped callback identity changes before it fires', () => {
        const fn = vi.fn();
        const { result, rerender } = renderHook(
            ({ cb }: { cb: (value: string) => void }) => useDebounce(cb, 100),
            { initialProps: { cb: fn } }
        );

        act(() => {
            result.current('stale-frame');
        });

        const fn2 = vi.fn();
        rerender({ cb: fn2 });

        act(() => {
            result.current('final-frame');
        });
        act(() => {
            vi.advanceTimersByTime(100);
        });

        expect(fn).not.toHaveBeenCalled();
        expect(fn2).toHaveBeenCalledTimes(1);
        expect(fn2).toHaveBeenCalledWith('final-frame');
    });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../utils';

/**
 * Phase 1 (docs/design/realtime-collaboration.md §10) regression guard for
 * the appendix-b:6 fix: `debounce()`'s returned function must expose a
 * real `.cancel()`. `use-debounce-v2.ts` already calls
 * `debouncedFnRef.current?.cancel?.()` on every dependency change, but
 * before this fix that call was a silent no-op — a stale pending debounce
 * kept firing later against whatever it closed over when created, which is
 * exactly how a debounced field-name write could apply after the value it
 * was comparing against had changed elsewhere.
 */

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls the underlying function after the delay', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('a');
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('exposes a real cancel() that prevents the pending call', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('a');
        debounced.cancel();
        vi.advanceTimersByTime(200);

        expect(fn).not.toHaveBeenCalled();
    });

    it('fix for appendix-b:6 — cancel() only affects the pending call, a later call still fires', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('stale');
        debounced.cancel(); // simulates a dependency change abandoning this write
        debounced('fresh');
        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('fresh');
    });
});

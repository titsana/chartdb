import { describe, expect, it, vi } from 'vitest';
import { seedWhenDecided } from '../seed-gate';
import type { StatusEmitter } from '../seed-gate';

/** Minimal fake matching StatusEmitter — records handlers so tests can
 * fire them directly, in whichever order a given scenario needs. */
function fakeProvider() {
    const handlers: Record<string, ((data?: unknown) => void)[]> = {
        synced: [],
        status: [],
    };
    const provider: StatusEmitter = {
        on: (event: string, cb: (data?: unknown) => void) => {
            handlers[event].push(cb);
        },
    } as unknown as StatusEmitter;
    return {
        provider,
        fireSynced: () => handlers.synced.forEach((cb) => cb()),
        fireStatus: (status: string) =>
            handlers.status.forEach((cb) => cb({ status })),
    };
}

describe('seedWhenDecided', () => {
    it('seeds once on synced', () => {
        const { provider, fireSynced } = fakeProvider();
        const seed = vi.fn();
        seedWhenDecided(provider, seed);
        fireSynced();
        expect(seed).toHaveBeenCalledTimes(1);
    });

    it('seeds once on a disconnected status, without ever having synced', () => {
        const { provider, fireStatus } = fakeProvider();
        const seed = vi.fn();
        seedWhenDecided(provider, seed);
        fireStatus('connecting');
        expect(seed).not.toHaveBeenCalled();
        fireStatus('disconnected');
        expect(seed).toHaveBeenCalledTimes(1);
    });

    it('does not seed on a connected status alone — only synced or disconnected decide', () => {
        const { provider, fireStatus } = fakeProvider();
        const seed = vi.fn();
        seedWhenDecided(provider, seed);
        fireStatus('connecting');
        fireStatus('connected');
        expect(seed).not.toHaveBeenCalled();
    });

    it('never seeds twice — disconnected then a later synced only fires once total', () => {
        const { provider, fireSynced, fireStatus } = fakeProvider();
        const seed = vi.fn();
        seedWhenDecided(provider, seed);
        fireStatus('disconnected');
        fireSynced();
        expect(seed).toHaveBeenCalledTimes(1);
    });

    it('never seeds twice — synced then a later disconnected only fires once total', () => {
        const { provider, fireSynced, fireStatus } = fakeProvider();
        const seed = vi.fn();
        seedWhenDecided(provider, seed);
        fireSynced();
        fireStatus('disconnected');
        expect(seed).toHaveBeenCalledTimes(1);
    });
});

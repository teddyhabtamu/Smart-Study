import { describe, it, expect } from 'vitest';
import { isPushSupported, getPushState, enablePush, urlBase64ToUint8Array } from './push';

// DOM-less runner (node): no window/serviceWorker/Notification, so support
// detection must fail closed to 'unsupported' without throwing.
describe('push client (support gating)', () => {
  it('reports unsupported without browser APIs', () => {
    expect(isPushSupported()).toBe(false);
  });

  it('resolves unsupported state instead of hanging', async () => {
    await expect(getPushState()).resolves.toEqual({ kind: 'unsupported' });
  });

  it('refuses to enable without browser APIs', async () => {
    await expect(enablePush()).rejects.toThrow(/not supported/);
  });
});

describe('urlBase64ToUint8Array (VAPID key decoding)', () => {
  it('decodes unpadded base64url', () => {
    // 'Hello' without padding, URL-safe alphabet.
    expect(Array.from(urlBase64ToUint8Array('SGVsbG8'))).toEqual([72, 101, 108, 108, 111]);
    expect(urlBase64ToUint8Array('BCoZ2aJefA').length).toBeGreaterThan(0);
  });
});

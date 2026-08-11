/* eslint-disable @typescript-eslint/no-explicit-any */
import {ScanGuards} from './scanGuards';

const guards = ScanGuards() as any;

const scan = (params: string) => ({params});

describe('ScanGuards.isOnlineSharing', () => {
  it('accepts a spec-shaped request, which leaves the authority undefined', () => {
    const request =
      'openid4vp://?client_id=did%3Aweb%3Averifier.example&request_uri=https%3A%2F%2Fverifier.example%2Foid4vp%2Frequest';

    expect(guards.isOnlineSharing({}, scan(request))).toBe(true);
  });

  it('still accepts the authorize form', () => {
    expect(
      guards.isOnlineSharing({}, scan('openid4vp://authorize?client_id=abc')),
    ).toBe(true);
  });

  it('leaves the offline BLE share to isOpenIdQr, which the machine matches first', () => {
    const bleConnect = 'OPENID4VP://connect:?name=OVPMOSIP';

    expect(guards.isOpenIdQr({}, scan(bleConnect))).toBe(true);
  });

  it('rejects anything that is not an openid4vp request', () => {
    expect(
      guards.isOnlineSharing({}, scan('openid-credential-offer://?x=1')),
    ).toBe(false);
    expect(guards.isOnlineSharing({}, scan('https://example.com'))).toBe(false);
    expect(guards.isOnlineSharing({}, scan(''))).toBe(false);
  });
});

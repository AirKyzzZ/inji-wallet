import {VERANA_NETWORKS} from './constants';
import {isVeranaActionBlocked, veranaNetworkLabel} from './veranaVerdict';

describe('isVeranaActionBlocked', () => {
  const settled = {isResolving: false, isCheckingPermission: false};

  it('allows only a trusted counterparty with a granted permission', () => {
    expect(
      isVeranaActionBlocked({
        ...settled,
        trustStatus: 'TRUSTED',
        permissionGranted: true,
      }),
    ).toBe(false);
  });

  it('blocks when the registry could not be reached', () => {
    expect(
      isVeranaActionBlocked({
        ...settled,
        trustStatus: 'UNVERIFIED',
        permissionGranted: true,
      }),
    ).toBe(true);
    expect(
      isVeranaActionBlocked({
        ...settled,
        trustStatus: 'TRUSTED',
        permissionGranted: undefined,
      }),
    ).toBe(true);
  });

  it('blocks a refusal and a check still running', () => {
    expect(
      isVeranaActionBlocked({
        ...settled,
        trustStatus: 'UNTRUSTED',
        permissionGranted: true,
      }),
    ).toBe(true);
    expect(
      isVeranaActionBlocked({
        ...settled,
        trustStatus: 'TRUSTED',
        permissionGranted: false,
      }),
    ).toBe(true);
    expect(
      isVeranaActionBlocked({
        trustStatus: 'TRUSTED',
        permissionGranted: true,
        isResolving: true,
      }),
    ).toBe(true);
  });
});

describe('veranaNetworkLabel', () => {
  it('names the non-production network that answered', () => {
    expect(veranaNetworkLabel(VERANA_NETWORKS[0])).toBe('DEVNET');
  });

  it('names nothing for a production network', () => {
    expect(
      veranaNetworkLabel({...VERANA_NETWORKS[0], production: true}),
    ).toBeUndefined();
  });

  it('names every non-production network when none answered', () => {
    expect(veranaNetworkLabel()).toBe('DEVNET · TESTNET');
  });
});

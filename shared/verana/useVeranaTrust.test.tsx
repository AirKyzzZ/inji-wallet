import React from 'react';
import {render, waitFor} from '@testing-library/react-native';
import {useVeranaTrust, VeranaTrust} from './useVeranaTrust';
import {checkVeranaAccreditation} from './veranaPermissions';
import {resolveVeranaTrust} from './veranaTrustService';

jest.unmock('react');
jest.mock('./canonicalDid', () => ({
  canonicalVeranaDid: async (did?: string) => did,
}));
jest.mock('./vctName', () => ({credentialNameFromVct: async () => undefined}));
jest.mock('./veranaPermissions', () => ({checkVeranaAccreditation: jest.fn()}));
jest.mock('./veranaTrustService', () => ({
  ...jest.requireActual('./veranaTrustService'),
  resolveVeranaTrust: jest.fn(),
}));

const TRUSTED_DID = 'did:webvh:QmTrusted:trusted.example';
const PENDING_DID = 'did:webvh:QmPending:pending.example';

const never = () => new Promise(jest.fn());

let latest: VeranaTrust | undefined;

const Probe = (props: Parameters<typeof useVeranaTrust>[0]) => {
  latest = useVeranaTrust(props);
  return null;
};

beforeEach(() => {
  latest = undefined;
  (resolveVeranaTrust as jest.Mock).mockImplementation((did: string) =>
    did === TRUSTED_DID
      ? Promise.resolve({
          did,
          trustStatus: 'TRUSTED',
          ecsCredentials: [],
          failedCredentialIds: [],
        })
      : never(),
  );
  (checkVeranaAccreditation as jest.Mock).mockImplementation(
    ({did}: {did: string}) =>
      did === TRUSTED_DID
        ? Promise.resolve({granted: true, reason: 'granted'})
        : never(),
  );
});

describe('useVeranaTrust', () => {
  it('unblocks a trusted counterparty with a granted permission', async () => {
    render(<Probe clientId={TRUSTED_DID} role="issuer" vct="v" />);

    await waitFor(() => expect(latest?.blocked).toBe(false));
    expect(latest?.trustStatus).toBe('TRUSTED');
  });

  it('does not carry a verdict over to the next counterparty', async () => {
    const view = render(<Probe clientId={TRUSTED_DID} role="issuer" vct="v" />);
    await waitFor(() => expect(latest?.blocked).toBe(false));

    view.rerender(<Probe clientId={PENDING_DID} role="issuer" vct="v" />);

    expect(latest?.blocked).toBe(true);
    expect(latest?.did).not.toBe(TRUSTED_DID);
    expect(latest?.accreditation).toBeUndefined();
  });

  it('blocks while the issuer identity is still pending', () => {
    render(<Probe role="issuer" pending />);

    expect(latest?.blocked).toBe(true);
  });
});

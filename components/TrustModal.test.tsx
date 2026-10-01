import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {TrustModal} from './TrustModal';

// Mock useTranslation hook
const mockT = jest.fn((key: string, options) => {
  if (key.endsWith('infoPoints')) {
    return ['Point 1', 'Point 2', 'Point 3'];
  }

  if (key === 'successfullyTrustedSubtitle') {
    return `Redirecting in ${options?.seconds} seconds…`;
  }

  return key;
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: {changeLanguage: jest.fn()},
  }),
  // ✅ prevents i18next.use(initReactI18next) crash
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

// --------------------
// UI mock
// --------------------
jest.mock('./ui', () => ({
  Button: jest.fn(() => null),
}));

// --------------------
// React Native mock
// --------------------
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Modal: ({children}: any) => <>{children}</>,
    View: ({children}: any) => <>{children}</>,
    Image: jest.fn(() => null),
    Text: ({children}: any) => <>{children}</>,
  };
});

describe('TrustModal', () => {
  const baseProps = {
    isVisible: true,
    logo: 'https://example.com/logo.png',
    name: 'Test Issuer',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  const veranaTrust = (overrides = {}) =>
    ({
      did: 'did:webvh:QmDemo:issuer.example',
      trustStatus: 'TRUSTED',
      isResolving: false,
      isCheckingAccreditation: false,
      blocked: false,
      ...overrides,
    } as any);

  it('matches snapshot in idle state', () => {
    const {toJSON} = render(<TrustModal {...baseProps} consentStatus="idle" />);

    expect(toJSON()).toMatchSnapshot();
  });

  it('states the issuer accreditation even when the credential has no name', () => {
    const {getByText} = render(
      <TrustModal
        {...baseProps}
        consentStatus="idle"
        verana={veranaTrust({
          accreditation: {granted: false, reason: 'no issuer permission'},
        })}
      />,
    );

    expect(getByText('OFFERS YOU')).toBeTruthy();
    expect(getByText('this credential')).toBeTruthy();
  });

  it('names the credential the accreditation was checked against', () => {
    const {getByText} = render(
      <TrustModal
        {...baseProps}
        consentStatus="idle"
        verana={veranaTrust({
          accreditation: {granted: true},
          credentialName: 'DemoCredential',
        })}
      />,
    );

    expect(getByText('DemoCredential')).toBeTruthy();
  });

  it('labels the network and names the ecosystem of the accreditation', () => {
    const {getByText} = render(
      <TrustModal
        {...baseProps}
        consentStatus="idle"
        verana={veranaTrust({
          networkLabel: 'DEVNET',
          accreditation: {granted: true, ecosystemName: 'Playground Demo'},
          credentialName: 'DemoCredential',
        })}
      />,
    );

    expect(getByText('DEVNET')).toBeTruthy();
    expect(
      getByText(
        'Test Issuer is an authorized issuer of DemoCredential in Playground Demo',
      ),
    ).toBeTruthy();
  });

  it('offers a retry when the registry could not be reached', () => {
    const retry = jest.fn();
    const {getByText} = render(
      <TrustModal
        {...baseProps}
        consentStatus="idle"
        verana={veranaTrust({trustStatus: 'UNVERIFIED', blocked: true, retry})}
      />,
    );

    fireEvent.press(getByText('Retry'));
    expect(retry).toHaveBeenCalled();
  });

  it('matches snapshot in loading state', () => {
    const {toJSON} = render(
      <TrustModal {...baseProps} consentStatus="loading" />,
    );

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot in success state', () => {
    const {toJSON} = render(
      <TrustModal {...baseProps} consentStatus="success" />,
    );

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot without logo', () => {
    const {toJSON} = render(
      <TrustModal {...baseProps} logo={undefined} consentStatus="idle" />,
    );

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot without name', () => {
    const {toJSON} = render(
      <TrustModal {...baseProps} name="" consentStatus="idle" />,
    );

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot without logo and name', () => {
    const {toJSON} = render(
      <TrustModal
        isVisible
        logo={undefined}
        name=""
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        consentStatus="idle"
      />,
    );

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot with long issuer name', () => {
    const {toJSON} = render(
      <TrustModal
        {...baseProps}
        name="Very Long Issuer Name That Should Wrap Properly"
        consentStatus="idle"
      />,
    );

    expect(toJSON()).toMatchSnapshot();
  });
});

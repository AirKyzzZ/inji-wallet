// Fixed by the versioned card at playground/public/trust-card/index.html. The same evaluation has
// to read identically in every wallet, so these are deliberately not routed through the app's
// locales: a missing translation would render a key name where a verdict belongs.
export const VERANA_STRINGS = {
  sectionService: 'Service',
  sectionOperatedBy: 'Operated by',
  sectionOffersYou: 'Offers you',
  sectionAsksYouFor: 'Asks you for',
  sectionConditions: 'Conditions of connecting',
  registryChip: 'REG',
  testnet: 'TESTNET',
  verdictTrusted: 'TRUSTED',
  verdictPartial: 'PARTIAL',
  verdictUntrusted: 'UNTRUSTED',
  verdictUnverified: 'COULD NOT VERIFY',
  verdictResolving: 'RESOLVING',
  serviceClaimsNotVerified: 'Service claims not verified',
  operatorClaimsNotVerified: 'Operator claims not verified',
  noServiceCredential: 'No ECS-Service credential presented',
  noOrganizationCredential: 'No ECS-Organization credential presented',
  nothingVerifiesOperator: 'Nothing verifies who operates this service',
  notChecked: 'Not checked.',
  claimsWithheld:
    'Nothing in the registry vouches for this credential, so its claims are not shown.',
  resolving: 'Resolving trust credentials…',
  checkingRegistry: 'Checking the Verana public registry…',
  permissionUncheckable: 'This could not be checked against the registry.',
  authorizedIssuer: 'authorized issuer',
  authorizedVerifier: 'authorized verifier',
  noAgeRestriction: 'No age restriction',
  termsAndConditions: 'Terms & conditions',
  privacyPolicy: 'Privacy policy',
  intact: 'intact',
  noDigest: 'no digest',
  openInVerana: 'Open this DID in Verana',
  demoNetwork: 'Demo network - do not share real data',
  claimsSelfIssued:
    'Issued by this service to itself, so nothing independent verifies it.',
} as const;

export const ageRestriction = (age: number) =>
  `This service requires you to be at least ${age} to connect`;

export const authorizedFor = (
  party: string,
  authority: string,
  credential: string,
) => `${party} is an ${authority} of ${credential}`;

export const notAuthorizedFor = (
  party: string,
  authority: string,
  credential: string,
) => `${party} is not an ${authority} of ${credential}`;

export const VERIFIER_CLIENT_ID = 'w5dHa_PtVP97vV49-BwLFaKg-n021dOB3abj9W-DTYc';

export const VERIFIER_CERTIFICATE_CHAIN = [
  'MIICsjCCAlmgAwIBAgIQKzutWB9L3gaxg9nOHwfx0TAKBggqhkjOPQQDAjBNMUswSQYDVQQDE0JkZW1vLXZlcmlmaWVyLWFjY3JlZGl0ZWQucGxheWdyb3VuZC5kZXZuZXQudmVyYW5hLm5ldHdvcmsgdmVyaWZpZXIwHhcNMjYxMDAxMTU1NTAxWhcNMjcxMDAxMTU1NjAxWjBNMUswSQYDVQQDE0JkZW1vLXZlcmlmaWVyLWFjY3JlZGl0ZWQucGxheWdyb3VuZC5kZXZuZXQudmVyYW5hLm5ldHdvcmsgdmVyaWZpZXIwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARex6qpcJ8dxTQj/+3eccx1Cib9Lbu2bIFKf5BZh4MtLMggkdmFrMKjdMC8XW9EijbTXOBc44P7vlEqOroz5vNxo4IBGTCCARUwHQYDVR0OBBYEFMO81Y5VTikBL6PiF4bvUVZKuIvkMAsGA1UdDwQEAwIHgDAfBgNVHSMEGDAWgBTDvNWOVU4pAS+j4heG71FWSriL5DCBugYDVR0RBIGyMIGvhnJkaWQ6d2Vidmg6UW1VWFZLNTlkVGJLY1VpU3NiTEdBQnJqYXFoQmlubTJ0dTllVllqQVg1d2JFQTpkZW1vLXZlcmlmaWVyLWFjY3JlZGl0ZWQucGxheWdyb3VuZC5kZXZuZXQudmVyYW5hLm5ldHdvcmuCOWRlbW8tdmVyaWZpZXItYWNjcmVkaXRlZC5wbGF5Z3JvdW5kLmRldm5ldC52ZXJhbmEubmV0d29yazAJBgNVHRMEAjAAMAoGCCqGSM49BAMCA0cAMEQCIFTvvf65wvzzm0938qEMUFa/q4HEKwoP6Y667ic1z3rtAiAA9Zq+w2p4iaEAOpQ/KLL8wTEQbISEw3hxsKkT/nT1Xg==',
];

export const VERIFIER_DID_DOCUMENT = {
  '@context': [
    'https://www.w3.org/ns/did/v1',
    'https://w3id.org/security/multikey/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1',
    'https://w3id.org/security/suites/x25519-2019/v1',
    'https://identity.foundation/linked-vp/contexts/v1',
    'https://w3id.org/security/suites/jws-2020/v1',
  ],
  id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network',
  controller:
    'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network',
  verificationMethod: [
    {
      controller:
        'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network',
      type: 'Multikey',
      publicKeyMultibase: 'z6MkqbBYpJg1hhCA9bstC1cd19nxdaaEW2ACxnc8KLWgJFtT',
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#KLWgJFtT',
    },
    {
      controller:
        'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network',
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#z6MkfSZhTwugSTmfkEikBqea6BcdtkfB5DEeRvJr7rigYmxH',
      publicKeyMultibase: 'z6MkfSZhTwugSTmfkEikBqea6BcdtkfB5DEeRvJr7rigYmxH',
      type: 'Ed25519VerificationKey2020',
    },
    {
      controller:
        'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network',
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#key-agreement-1',
      publicKeyMultibase: 'z6LSgTtpguiB8GGhAsLXsvZc5XXJeX4CwmJUsuygoAUzb5WK',
      type: 'Multikey',
    },
    {
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#openid4vc-development-issuer',
      type: 'JsonWebKey2020',
      controller:
        'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network',
      publicKeyJwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'Pnad-_QflvkJbeti-JNSz25Ria1Ti8lKdrme1E2eCzM',
        y: 'ZsOcyIOCsHsLAjgtPGL2UQWM8TJ5dgrkFn96yP2Z56A',
        kid: '8e579485-25b4-4c5e-b849-46ccb4f4dfe7',
      },
    },
    {
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#openid4vc-development-verifier',
      type: 'JsonWebKey2020',
      controller:
        'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network',
      publicKeyJwk: {
        kty: 'EC',
        crv: 'P-256',
        x: 'XseqqXCfHcU0I__t3nHMdQom_S27tmyBSn-QWYeDLSw',
        y: 'yCCR2YWswqN0wLxdb0SKNtNc4Fzjg_u-USo6ujPm83E',
        kid: '89f0be82-864f-432f-9854-b7434e710672',
      },
    },
  ],
  authentication: [
    'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#z6MkfSZhTwugSTmfkEikBqea6BcdtkfB5DEeRvJr7rigYmxH',
    'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#openid4vc-development-verifier',
  ],
  assertionMethod: [
    'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#z6MkfSZhTwugSTmfkEikBqea6BcdtkfB5DEeRvJr7rigYmxH',
    'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#openid4vc-development-issuer',
  ],
  keyAgreement: [
    'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#key-agreement-1',
  ],
  capabilityDelegation: [],
  capabilityInvocation: [],
  service: [
    {
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#did-communication',
      serviceEndpoint:
        'wss://demo-verifier-accredited.playground.devnet.verana.network',
      type: 'did-communication',
      priority: 0,
      recipientKeys: [
        'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#z6MkfSZhTwugSTmfkEikBqea6BcdtkfB5DEeRvJr7rigYmxH',
      ],
      routingKeys: [],
      accept: ['didcomm/aip2;env=rfc19'],
    },
    {
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#didcomm-messaging-0',
      serviceEndpoint: {
        uri: 'wss://demo-verifier-accredited.playground.devnet.verana.network',
        accept: ['didcomm/v2'],
      },
      type: 'DIDCommMessaging',
    },
    {
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#files',
      serviceEndpoint:
        'https://demo-verifier-accredited.playground.devnet.verana.network',
      type: 'relativeRef',
    },
    {
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#vpr-schemas-8-vtjsc-vp',
      serviceEndpoint:
        'https://demo-verifier-accredited.playground.devnet.verana.network/vt/schemas-8-vtjsc-vp.json',
      type: 'LinkedVerifiablePresentation',
    },
    {
      id: 'did:webvh:QmUXVK59dTbKcUiSsbLGABrjaqhBinm2tu9eVYjAX5wbEA:demo-verifier-accredited.playground.devnet.verana.network#vpr-schemas-service-vtc-vp',
      serviceEndpoint:
        'https://demo-verifier-accredited.playground.devnet.verana.network/vt/schemas-service-vtc-vp.json',
      type: 'LinkedVerifiablePresentation',
    },
  ],
  alsoKnownAs: [
    'did:web:demo-verifier-accredited.playground.devnet.verana.network',
  ],
};

export const VERIFIER_DID = VERIFIER_DID_DOCUMENT.id;

import {vctFromPresentationDefinition} from './presentationVct';

const VCT =
  'https://demo-issuer-accredited.playground.testnet.verana.network/oid4vc/vct/demo-credential';

const definition = (fields: unknown[]) => ({
  id: 'demo-credential-presentation-exchange',
  input_descriptors: [{id: 'demo-credential', constraints: {fields}}],
});

describe('vctFromPresentationDefinition', () => {
  it('reads the vct a verifier pins with const', () => {
    expect(
      vctFromPresentationDefinition(
        definition([
          {path: ['$.vct'], filter: {type: 'string', const: VCT}},
          {path: ['$.name']},
        ]),
      ),
    ).toBe(VCT);
  });

  it('accepts the bracket notations for the same path', () => {
    for (const path of ["$['vct']", '$["vct"]']) {
      expect(
        vctFromPresentationDefinition(
          definition([{path: [path], filter: {const: VCT}}]),
        ),
      ).toBe(VCT);
    }
  });

  it('reads a single-entry enum', () => {
    expect(
      vctFromPresentationDefinition(
        definition([{path: ['$.vct'], filter: {enum: [VCT]}}]),
      ),
    ).toBe(VCT);
  });

  it('ignores a regex pattern, which is not a credential type', () => {
    expect(
      vctFromPresentationDefinition(
        definition([{path: ['$.vct'], filter: {pattern: '^https://.*'}}]),
      ),
    ).toBeUndefined();
  });

  it('ignores a vct field with no filter', () => {
    expect(
      vctFromPresentationDefinition(definition([{path: ['$.vct']}])),
    ).toBeUndefined();
  });

  it('ignores paths other than vct', () => {
    expect(
      vctFromPresentationDefinition(
        definition([{path: ['$.type'], filter: {const: 'DemoCredential'}}]),
      ),
    ).toBeUndefined();
  });

  it('refuses to guess when descriptors disagree', () => {
    expect(
      vctFromPresentationDefinition({
        id: 'multi',
        input_descriptors: [
          {constraints: {fields: [{path: ['$.vct'], filter: {const: VCT}}]}},
          {
            constraints: {
              fields: [{path: ['$.vct'], filter: {const: 'https://other/vct'}}],
            },
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('collapses the same vct repeated across descriptors', () => {
    expect(
      vctFromPresentationDefinition({
        id: 'repeated',
        input_descriptors: [
          {constraints: {fields: [{path: ['$.vct'], filter: {const: VCT}}]}},
          {constraints: {fields: [{path: ['$.vct'], filter: {const: VCT}}]}},
        ],
      }),
    ).toBe(VCT);
  });

  it('survives a malformed or absent definition', () => {
    expect(vctFromPresentationDefinition(undefined)).toBeUndefined();
    expect(vctFromPresentationDefinition({})).toBeUndefined();
    expect(
      vctFromPresentationDefinition({input_descriptors: 'nope'}),
    ).toBeUndefined();
    expect(
      vctFromPresentationDefinition({input_descriptors: [{}, null, 7]}),
    ).toBeUndefined();
  });
});

describe('a filter that only survived as a pattern', () => {
  const vct =
    'https://demo-issuer-accredited.playground.testnet.verana.network/oid4vc/vct/demo-credential';
  const escaped = vct.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const definitionWith = (filter: unknown) => ({
    id: 'demo',
    input_descriptors: [
      {id: 'd', constraints: {fields: [{path: ['$.vct'], filter}]}},
    ],
  });

  it('reads the escaped literal when const was dropped', () => {
    expect(
      vctFromPresentationDefinition(
        definitionWith({type: 'string', pattern: escaped}),
      ),
    ).toBe(vct);
  });

  it('ignores a pattern that matches more than one value', () => {
    expect(
      vctFromPresentationDefinition(
        definitionWith({type: 'string', pattern: '^https://.*/demo.*$'}),
      ),
    ).toBeUndefined();
  });
});

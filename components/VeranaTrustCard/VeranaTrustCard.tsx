import {IS_VERANA_TESTNET as isVeranaTestnet} from '../../shared/verana/constants';
import type {VeranaServiceInfo as ServiceInfo} from '../../shared/verana/serviceInfo';
import type {VeranaAccreditationCheck as VeranaPermissionCheck} from '../../shared/verana/veranaPermissions';
import type {VeranaTrustStatus} from '../../shared/verana/veranaTrustService';
import {
  describeVeranaVerdict,
  VERANA_EXPLORER_URL,
} from '../../shared/verana/veranaVerdict';
import React, {memo} from 'react';
import {Linking, Text, TouchableOpacity, View} from 'react-native';
import {
  ageRestriction,
  authorizedFor,
  notAuthorizedFor,
  VERANA_STRINGS,
} from './strings';
import {
  ArrowUpRightIcon,
  CheckIcon,
  CountryFlag,
  CrossIcon,
  InfoIcon,
  LockIcon,
  RegistryChip,
  SectionLabel,
  StepTick,
  StepTone,
  VeranaMark,
} from './parts';
import styles, {veranaCardColors} from './styles';

export type VeranaTrustAsk = {
  kind: 'offer' | 'request';
  credential: string;
  party: string;
  accreditation?: VeranaPermissionCheck;
  isChecking: boolean;
};

type Props = {
  did: string;
  serviceInfo?: ServiceInfo;
  trustStatus: VeranaTrustStatus;
  isFetchingInfo: boolean;
  isResolving?: boolean;
  ask?: VeranaTrustAsk;
};

const VERDICT_TONE: Record<VeranaTrustStatus, {color: string; label: string}> =
  {
    TRUSTED: {color: veranaCardColors.ok, label: VERANA_STRINGS.verdictTrusted},
    PARTIAL: {
      color: veranaCardColors.warn,
      label: VERANA_STRINGS.verdictPartial,
    },
    UNTRUSTED: {
      color: veranaCardColors.bad,
      label: VERANA_STRINGS.verdictUntrusted,
    },
    UNVERIFIED: {
      color: veranaCardColors.faint,
      label: VERANA_STRINGS.verdictUnverified,
    },
  };

const RESOLVING_TONE = {
  color: veranaCardColors.faint,
  label: VERANA_STRINGS.verdictResolving,
};

const isHttpUri = (uri?: string): uri is string =>
  typeof uri === 'string' && /^https?:\/\//i.test(uri);

const VeranaTrustCard = ({
  did,
  serviceInfo,
  trustStatus,
  isFetchingInfo,
  isResolving,
  ask,
}: Props) => {
  const organization = serviceInfo?.organization;
  const claimsVerified = Boolean(serviceInfo?.claimsVerified);
  const serviceCredentialPresented = Boolean(serviceInfo?.name);
  const organizationCredentialPresented = Boolean(organization?.entityName);
  const hasServiceCredential = claimsVerified && serviceCredentialPresented;
  const hasOrganizationCredential =
    claimsVerified && organizationCredentialPresented;
  const tone = isResolving ? RESOLVING_TONE : VERDICT_TONE[trustStatus];
  // Nothing has been checked yet, or nothing came back. Either way the chain has no rows to show,
  // and drawing empty ones reads as a finding about the counterparty rather than about the check.
  const showChain = !isResolving && trustStatus !== 'UNVERIFIED';

  const stepTone = (present: boolean): StepTone => (present ? 'ok' : 'bad');

  const withheldDetail =
    trustStatus === 'UNVERIFIED'
      ? VERANA_STRINGS.notChecked
      : serviceInfo?.claimsSelfIssued
      ? VERANA_STRINGS.claimsSelfIssued
      : VERANA_STRINGS.claimsWithheld;

  const minimumAgeRequired = serviceInfo?.minimumAgeRequired ?? 0;
  // Conditions read off the ECS-Service credential, so they are claims too: an unanchored service
  // does not get to state binding conditions on this surface.
  const hasConditions =
    claimsVerified &&
    (minimumAgeRequired > 0 ||
      isHttpUri(serviceInfo?.termsAndConditionsUrl) ||
      isHttpUri(serviceInfo?.dataPrivacyUrl));

  return (
    <View style={styles.card}>
      <View style={styles.didRow}>
        <View style={[styles.didDot, {backgroundColor: tone.color}]} />
        <Text style={styles.didText} numberOfLines={1}>
          {did}
        </Text>
        {isVeranaTestnet && (
          <View style={styles.testnetChip}>
            <Text style={styles.testnetChipText}>{VERANA_STRINGS.testnet}</Text>
          </View>
        )}
        <VeranaMark />
      </View>

      {showChain && (
        <>
          <View style={styles.section}>
            <SectionLabel>{VERANA_STRINGS.sectionService}</SectionLabel>
            <View style={styles.identityRow}>
              <View style={styles.identityBody}>
                <Text style={styles.identityName} numberOfLines={2}>
                  {hasServiceCredential
                    ? serviceInfo?.name
                    : serviceCredentialPresented
                    ? VERANA_STRINGS.serviceClaimsNotVerified
                    : VERANA_STRINGS.noServiceCredential}
                </Text>
                {hasServiceCredential ? (
                  <Text style={styles.identityDetail} numberOfLines={3}>
                    {serviceInfo?.description}
                  </Text>
                ) : (
                  serviceCredentialPresented && (
                    <Text style={styles.identityWithheld} numberOfLines={3}>
                      {withheldDetail}
                    </Text>
                  )
                )}
              </View>
              <StepTick tone={stepTone(hasServiceCredential)} />
            </View>
          </View>

          <View style={styles.section}>
            <SectionLabel>{VERANA_STRINGS.sectionOperatedBy}</SectionLabel>
            <View style={styles.identityRow}>
              <View style={styles.identityBody}>
                <View style={styles.identityHeadingRow}>
                  <Text style={styles.identityName} numberOfLines={2}>
                    {hasOrganizationCredential
                      ? organization?.entityName
                      : organizationCredentialPresented
                      ? VERANA_STRINGS.operatorClaimsNotVerified
                      : VERANA_STRINGS.noOrganizationCredential}
                  </Text>
                  {hasOrganizationCredential && (
                    <CountryFlag code={organization?.countryCode} />
                  )}
                </View>
                {hasOrganizationCredential ? (
                  <>
                    {organization?.address ? (
                      <Text style={styles.identityDetail} numberOfLines={2}>
                        {organization.address}
                      </Text>
                    ) : null}
                    <RegistryChip
                      label={VERANA_STRINGS.registryChip}
                      value={organization?.officialPublicRegistryNumber}
                    />
                  </>
                ) : (
                  <Text style={styles.identityWithheld} numberOfLines={3}>
                    {organizationCredentialPresented
                      ? withheldDetail
                      : VERANA_STRINGS.nothingVerifiesOperator}
                  </Text>
                )}
              </View>
              <StepTick tone={stepTone(hasOrganizationCredential)} />
            </View>
          </View>
        </>
      )}

      <View style={styles.verdictStack}>
        <View style={[styles.verdictPill, {borderColor: tone.color}]}>
          <VeranaMark />
          <Text
            style={[styles.verdictPillLabel, {color: tone.color}]}
            numberOfLines={1}>
            {tone.label}
          </Text>
        </View>
        <Text
          style={[
            styles.verdictNote,
            {
              color:
                !isResolving &&
                (trustStatus === 'PARTIAL' || trustStatus === 'UNTRUSTED')
                  ? veranaCardColors.bad
                  : veranaCardColors.sub,
            },
          ]}>
          {isResolving
            ? VERANA_STRINGS.checkingRegistry
            : describeVeranaVerdict(trustStatus, {
                resolved: trustStatus !== 'UNVERIFIED',
                hasServiceCredential,
                hasOrganizationCredential,
                structurallyValid:
                  serviceCredentialPresented || organizationCredentialPresented,
              })}
        </Text>
      </View>

      {ask && <AskBlock ask={ask} />}

      {hasConditions && (
        <View style={styles.conditions}>
          <SectionLabel>{VERANA_STRINGS.sectionConditions}</SectionLabel>
          <View style={styles.conditionRow}>
            {minimumAgeRequired > 0 ? (
              <>
                <View style={styles.ageBadge}>
                  <Text
                    style={
                      styles.ageBadgeText
                    }>{`${minimumAgeRequired}+`}</Text>
                </View>
                <Text style={styles.conditionText} numberOfLines={2}>
                  {ageRestriction(minimumAgeRequired)}
                </Text>
              </>
            ) : (
              <>
                <InfoIcon color={veranaCardColors.faint} size={13} />
                <Text style={styles.conditionText}>
                  {VERANA_STRINGS.noAgeRestriction}
                </Text>
              </>
            )}
          </View>
          <ConditionLink
            label={VERANA_STRINGS.termsAndConditions}
            uri={serviceInfo?.termsAndConditionsUrl}
            digest={serviceInfo?.termsAndConditionsDigestSri}
          />
          <ConditionLink
            label={VERANA_STRINGS.privacyPolicy}
            uri={serviceInfo?.dataPrivacyUrl}
            digest={serviceInfo?.dataPrivacyDigestSri}
          />
        </View>
      )}

      {isFetchingInfo && !isResolving && (
        <Text style={styles.loading}>{VERANA_STRINGS.resolving}</Text>
      )}

      <TouchableOpacity
        accessibilityRole="link"
        style={styles.explorerRow}
        onPress={() =>
          Linking.openURL(
            `${VERANA_EXPLORER_URL}/did/${encodeURIComponent(did)}`,
          )
        }>
        <Text style={styles.explorerText} numberOfLines={1}>
          {VERANA_STRINGS.openInVerana}
        </Text>
        <ArrowUpRightIcon color={veranaCardColors.brand} />
      </TouchableOpacity>

      {isVeranaTestnet && (
        <Text style={styles.footnote}>{VERANA_STRINGS.demoNetwork}</Text>
      )}
    </View>
  );
};

const AskBlock = ({ask}: {ask: VeranaTrustAsk}) => {
  const granted = ask.isChecking ? undefined : ask.accreditation?.granted;
  const background =
    granted === true
      ? veranaCardColors.okSoft
      : granted === false
      ? veranaCardColors.badSoft
      : veranaCardColors.neutralSoft;
  const border =
    granted === true
      ? veranaCardColors.okRail
      : granted === false
      ? veranaCardColors.badRail
      : veranaCardColors.line;

  const sentence =
    granted === undefined
      ? ask.isChecking
        ? VERANA_STRINGS.checkingRegistry
        : ask.accreditation?.reason ?? VERANA_STRINGS.permissionUncheckable
      : (granted ? authorizedFor : notAuthorizedFor)(
          ask.party,
          ask.kind === 'offer'
            ? VERANA_STRINGS.authorizedIssuer
            : VERANA_STRINGS.authorizedVerifier,
          ask.credential,
        );

  return (
    <View
      style={[
        styles.askBlock,
        {backgroundColor: background, borderColor: border},
      ]}>
      <SectionLabel>
        {ask.kind === 'offer'
          ? VERANA_STRINGS.sectionOffersYou
          : VERANA_STRINGS.sectionAsksYouFor}
      </SectionLabel>
      <Text style={styles.askCredential} numberOfLines={2}>
        {ask.credential}
      </Text>
      <View style={styles.askRow}>
        {granted === true ? (
          <CheckIcon color={veranaCardColors.ok} />
        ) : granted === false ? (
          <CrossIcon color={veranaCardColors.bad} />
        ) : (
          <InfoIcon color={veranaCardColors.faint} />
        )}
        <Text style={styles.askText}>{sentence}</Text>
      </View>
    </View>
  );
};

const ConditionLink = ({
  label,
  uri,
  digest,
}: {
  label: string;
  uri?: string;
  digest?: string;
}) => {
  if (!isHttpUri(uri)) return null;
  return (
    <TouchableOpacity
      accessibilityRole="link"
      style={styles.conditionRow}
      onPress={() => Linking.openURL(uri)}>
      <LockIcon color={veranaCardColors.brand} />
      <Text style={styles.conditionLink} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.conditionState}>
        {digest ? (
          <>
            <CheckIcon color={veranaCardColors.ok} size={11} />
            <Text style={styles.conditionIntact}>{VERANA_STRINGS.intact}</Text>
          </>
        ) : (
          <Text style={styles.conditionNoDigest}>
            {VERANA_STRINGS.noDigest}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default memo(VeranaTrustCard);

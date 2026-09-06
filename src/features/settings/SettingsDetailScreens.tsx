import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { RevenueCatPackage } from '../../services/revenueCatGateway';
import {
  catalogProductFor,
  planKeyForName,
  planKeys,
  type BillingPeriod,
  type CatalogProduct,
  type PlanKey,
  type SubscriptionCatalogProduct,
} from '../../config/purchaseCatalog';
import { useAppTheme } from '../../theme/AppTheme';
import { fonts } from '../../theme/fonts';
import { radii, type AppTheme } from '../../theme/tokens';
import { formatUsPhoneInput } from '../../utils/phone';

type DetailShellProps = Readonly<{
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  compact?: boolean;
}>;

function DetailShell({
  title,
  children,
  onBack,
  compact = false,
}: DetailShellProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.screen}>
      <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Back to Settings"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <Ionicons color={theme.bodyText} name="chevron-back" size={28} />
        </Pressable>
        <Text
          style={[
            styles.navigationTitle,
            compact && styles.compactNavigationTitle,
          ]}
        >
          {title}
        </Text>
        <View style={styles.navigationSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          compact && styles.compactContent,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

type FormFieldProps = Readonly<{
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  compact?: boolean;
}>;

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  editable = true,
  keyboardType = 'default',
  compact = false,
}: FormFieldProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Text style={[styles.fieldLabel, compact && styles.compactFieldLabel]}>
        {label}
      </Text>
      <TextInput
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedText}
        selectionColor={theme.accent}
        style={[
          styles.input,
          compact && styles.compactInput,
          multiline && styles.multilineInput,
          !editable && styles.inputDisabled,
        ]}
        value={value}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  compact = false,
}: Readonly<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.compactPrimaryButton,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.primaryButtonLabel,
          compact && styles.compactPrimaryButtonLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfileScreen({
  displayName,
  email,
  provider,
  isSaving,
  message,
  onBack,
  onSave,
}: Readonly<{
  displayName: string;
  email: string | null;
  provider: string;
  isSaving: boolean;
  message: string | null;
  onBack: () => void;
  onSave: (displayName: string) => void;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [value, setValue] = useState(displayName);

  return (
    <DetailShell compact onBack={onBack} title="Profile">
      <Text style={[styles.heading, styles.compactHeading]}>
        Your public profile
      </Text>
      <Text style={[styles.body, styles.compactBody]}>
        Your display name appears with future community corrections and reports.
        Your sign-in identity is never public.
      </Text>
      <View style={[styles.formCard, styles.compactFormCard]}>
        <FormField
          compact
          label="Display name"
          onChangeText={setValue}
          value={value}
        />
        <FormField
          compact
          editable={false}
          keyboardType="email-address"
          label="Email"
          onChangeText={() => undefined}
          value={email ?? 'Email not shared by your provider'}
        />
        <FormField
          compact
          editable={false}
          label="Sign-in method"
          onChangeText={() => undefined}
          value={provider}
        />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <PrimaryButton
        compact
        disabled={isSaving || !value.trim()}
        label={isSaving ? 'Saving…' : 'Save display name'}
        onPress={() => onSave(value)}
      />
    </DetailShell>
  );
}

export function PurchaseScreen({
  isLoading,
  packages,
  message,
  hasPaidSubscription,
  currentPlanName,
  onBack,
  onBuy,
  onRestore,
}: Readonly<{
  isLoading: boolean;
  packages: RevenueCatPackage[];
  message: string | null;
  hasPaidSubscription: boolean;
  currentPlanName: string;
  onBack: () => void;
  onBuy: (value: RevenueCatPackage) => void;
  onRestore: () => void;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
    () => planKeyForName(currentPlanName) ?? 'pro',
  );

  type StorefrontPackage = RevenueCatPackage & { catalog: CatalogProduct };
  type SubscriptionPackage = RevenueCatPackage & {
    catalog: SubscriptionCatalogProduct;
  };
  const storefrontPackages: StorefrontPackage[] = packages.flatMap(value => {
    const catalog = catalogProductFor(value.productIdentifier);
    return catalog ? [{ ...value, catalog }] : [];
  });
  const subscriptions = storefrontPackages.filter(
    (value): value is SubscriptionPackage =>
      value.catalog.kind === 'subscription',
  );
  const creditPacks = storefrontPackages.filter(
    (
      value,
    ): value is StorefrontPackage & {
      catalog: Extract<CatalogProduct, { kind: 'credit-pack' }>;
    } => value.catalog.kind === 'credit-pack',
  );
  const selectedProduct = subscriptions.find(
    value =>
      value.catalog.plan === selectedPlan &&
      value.catalog.billingPeriod === billingPeriod,
  );
  const hasAnnualPlans = subscriptions.some(
    value => value.catalog.billingPeriod === 'annual',
  );
  const proMonthly = subscriptions.find(
    value =>
      value.catalog.plan === 'pro' && value.catalog.billingPeriod === 'monthly',
  );
  const proAnnual = subscriptions.find(
    value =>
      value.catalog.plan === 'pro' && value.catalog.billingPeriod === 'annual',
  );
  const annualSavings =
    proMonthly && proAnnual
      ? Math.round(
          (1 - proAnnual.priceAmount / (proMonthly.priceAmount * 12)) * 100,
        )
      : null;

  useEffect(() => {
    const initialPlan = planKeyForName(currentPlanName) ?? 'pro';
    setSelectedPlan(initialPlan);
  }, [currentPlanName]);

  useEffect(() => {
    if (
      !subscriptions.some(
        value =>
          value.catalog.plan === selectedPlan &&
          value.catalog.billingPeriod === billingPeriod,
      )
    ) {
      const fallback = subscriptions.find(
        value => value.catalog.billingPeriod === billingPeriod,
      );
      if (fallback?.catalog.plan) {
        setSelectedPlan(fallback.catalog.plan);
      }
    }
  }, [billingPeriod, selectedPlan, subscriptions]);

  return (
    <View style={styles.purchaseScreen}>
      <ScrollView
        contentContainerStyle={styles.purchaseContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.purchaseNavigation}>
          <Pressable
            accessibilityLabel="Back to Settings"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onBack}
            style={({ pressed }) => [
              styles.purchaseClose,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons color={theme.mutedText} name="close" size={26} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            onPress={onRestore}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.purchaseRestore}>Restore</Text>
          </Pressable>
        </View>
        <Text style={styles.purchaseHeading}>
          More lookups,{`\n`}same evidence
        </Text>
        <Text style={styles.purchaseBody}>
          Every plan gets full sources and confidence. You&apos;re only buying
          lookups.
        </Text>
        {hasAnnualPlans ? (
          <View style={styles.billingToggle}>
            {(['monthly', 'annual'] as const).map(period => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: billingPeriod === period }}
                key={period}
                onPress={() => setBillingPeriod(period)}
                style={({ pressed }) => [
                  styles.billingOption,
                  billingPeriod === period && styles.billingOptionSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.billingOptionLabel,
                    billingPeriod === period &&
                      styles.billingOptionLabelSelected,
                  ]}
                >
                  {period === 'monthly'
                    ? 'Monthly'
                    : annualSavings && annualSavings > 0
                    ? `Annual · save ${annualSavings}%`
                    : 'Annual'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {isLoading ? (
          <ActivityIndicator color={theme.accent} style={styles.loading} />
        ) : null}
        {!isLoading && !subscriptions.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              Purchases are not available yet.
            </Text>
            <Text style={styles.emptyBody}>
              Check your connection or try again after the store catalog is
              configured.
            </Text>
          </View>
        ) : null}
        <View style={styles.planList}>
          <View style={styles.planCard}>
            <View>
              <Text style={styles.planTitle}>Free</Text>
              <Text style={styles.planAllowance}>3 lookups / month</Text>
            </View>
            <Text style={styles.currentPlanLabel}>
              {hasPaidSubscription ? 'Included' : 'Current'}
            </Text>
          </View>
          {planKeys.map(plan => {
            const value = subscriptions.find(
              product =>
                product.catalog.plan === plan &&
                product.catalog.billingPeriod === billingPeriod,
            );
            const isSelected = selectedPlan === plan;
            const title =
              plan === 'plus' ? 'Plus' : plan === 'pro' ? 'Pro' : 'Power';
            const allowance = plan === 'plus' ? 15 : plan === 'pro' ? 35 : 60;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: !value }}
                disabled={!value}
                key={plan}
                onPress={() => setSelectedPlan(plan)}
                style={({ pressed }) => [
                  styles.planCard,
                  isSelected && styles.planCardSelected,
                  !value && styles.planCardUnavailable,
                  pressed && styles.pressed,
                ]}
              >
                <View>
                  <View style={styles.planTitleRow}>
                    <Text style={styles.planTitle}>{title}</Text>
                    {plan === 'pro' ? (
                      <Text style={styles.popularBadge}>Popular</Text>
                    ) : null}
                  </View>
                  <Text style={styles.planAllowance}>
                    {allowance} lookups / month
                  </Text>
                </View>
                <Text
                  style={[
                    styles.planPrice,
                    isSelected && styles.planPriceSelected,
                  ]}
                >
                  {value?.price ?? 'Unavailable'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {hasPaidSubscription && creditPacks.length ? (
          <View style={styles.creditPackSection}>
            <Text style={styles.creditPackLabel}>Extra lookup packs</Text>
            <View style={styles.creditPackGrid}>
              {creditPacks.map(value => (
                <Pressable
                  accessibilityLabel={`Buy ${value.catalog.credits} extra lookups`}
                  accessibilityRole="button"
                  key={value.productIdentifier}
                  onPress={() => onBuy(value)}
                  style={({ pressed }) => [
                    styles.creditPackCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.creditPackCredits}>
                    {value.catalog.credits}
                  </Text>
                  <Text style={styles.creditPackPrice}>{value.price}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !selectedProduct || isLoading }}
          disabled={!selectedProduct || isLoading}
          onPress={() => selectedProduct && onBuy(selectedProduct)}
          style={({ pressed }) => [
            styles.purchaseCta,
            (!selectedProduct || isLoading) && styles.purchaseCtaDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.purchaseCtaLabel}>
            {selectedProduct
              ? `Get ${selectedProduct.catalog.title} · ${
                  selectedProduct.price
                }/${billingPeriod === 'monthly' ? 'mo' : 'yr'}`
              : 'Choose a plan'}
          </Text>
        </Pressable>
        <Text style={styles.purchaseDisclosure}>
          {billingPeriod === 'monthly'
            ? 'Renews monthly until cancelled.'
            : 'Renews annually until cancelled.'}{' '}
          Allowance resets each month; purchased packs don&apos;t expire.
        </Text>
      </ScrollView>
    </View>
  );
}

export function SupportScreen({
  isSubmitting,
  message,
  onBack,
  onSubmit,
}: Readonly<{
  isSubmitting: boolean;
  message: string | null;
  onBack: () => void;
  onSubmit: (subject: string, message: string) => void;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  return (
    <DetailShell onBack={onBack} title="Support">
      <Text style={styles.heading}>How can we help?</Text>
      <Text style={styles.body}>
        Send a secure support ticket from your signed-in account. We will use
        your account email only to follow up.
      </Text>
      <View style={styles.formCard}>
        <FormField label="Subject" onChangeText={setSubject} value={subject} />
        <FormField
          label="Message"
          multiline
          onChangeText={setBody}
          placeholder="Tell us what happened"
          value={body}
        />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <PrimaryButton
        disabled={isSubmitting || !subject.trim() || !body.trim()}
        label={isSubmitting ? 'Sending…' : 'Send support request'}
        onPress={() => onSubmit(subject, body)}
      />
    </DetailShell>
  );
}

export function DataRequestScreen({
  initialPhoneInput = '',
  isSubmitting,
  message,
  onBack,
  onSubmit,
}: Readonly<{
  initialPhoneInput?: string;
  isSubmitting: boolean;
  message: string | null;
  onBack: () => void;
  onSubmit: (
    requestType: 'remove' | 'correct',
    phoneInput: string,
    details: string,
  ) => void;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [requestType, setRequestType] = useState<'remove' | 'correct'>(
    'correct',
  );
  const [phoneInput, setPhoneInput] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    setPhoneInput(initialPhoneInput);
  }, [initialPhoneInput]);

  return (
    <DetailShell compact onBack={onBack} title="Your data">
      <Text style={[styles.heading, styles.compactHeading]}>
        Remove or correct data
      </Text>
      <Text style={[styles.body, styles.compactBody]}>
        Tell us which US number needs attention and give enough detail for our
        review team to handle the request.
      </Text>
      <View style={[styles.choiceRow, styles.compactChoiceRow]}>
        {(['correct', 'remove'] as const).map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: requestType === option }}
            key={option}
            onPress={() => setRequestType(option)}
            style={({ pressed }) => [
              styles.choice,
              styles.compactChoice,
              requestType === option && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.choiceLabel, styles.compactChoiceLabel]}>
              {option === 'correct' ? 'Correct data' : 'Remove data'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.formCard, styles.compactFormCard]}>
        <FormField
          compact
          keyboardType="phone-pad"
          label="US phone number"
          onChangeText={value => setPhoneInput(formatUsPhoneInput(value))}
          placeholder="(404) 555-1212"
          value={phoneInput}
        />
        <FormField
          compact
          label={
            requestType === 'correct'
              ? 'Correct information'
              : 'Request details'
          }
          multiline
          onChangeText={setDetails}
          placeholder={
            requestType === 'correct'
              ? 'What should this data say?'
              : 'Tell us what should be removed.'
          }
          value={details}
        />
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <PrimaryButton
        compact
        disabled={isSubmitting || !phoneInput || !details.trim()}
        label={isSubmitting ? 'Submitting…' : 'Submit request'}
        onPress={() => onSubmit(requestType, phoneInput, details)}
      />
    </DetailShell>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    screen: { backgroundColor: theme.background, flex: 1 },
    purchaseScreen: { backgroundColor: theme.purchaseBackground, flex: 1 },
    purchaseContent: {
      paddingBottom: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    purchaseNavigation: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    purchaseClose: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    purchaseRestore: {
      color: theme.accent,
      fontFamily: fonts.extraBold,
      fontSize: 16,
      letterSpacing: -0.5,
    },
    purchaseHeading: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 29,
      letterSpacing: -1.2,
      lineHeight: 33,
      marginTop: 22,
    },
    purchaseBody: {
      color: theme.purchaseMutedText,
      fontFamily: fonts.medium,
      fontSize: 16,
      letterSpacing: -0.5,
      lineHeight: 22,
      marginTop: 12,
    },
    billingToggle: {
      backgroundColor: theme.purchaseSurface,
      borderRadius: radii.pill,
      flexDirection: 'row',
      marginTop: 20,
      padding: 4,
    },
    billingOption: {
      alignItems: 'center',
      borderRadius: radii.pill,
      flex: 1,
      justifyContent: 'center',
      minHeight: 48,
      paddingHorizontal: 8,
    },
    billingOptionSelected: {
      backgroundColor: theme.purchaseToggleSelectedSurface,
    },
    billingOptionLabel: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 14,
      letterSpacing: -0.4,
    },
    billingOptionLabelSelected: { color: theme.text },
    planList: { gap: 10, marginTop: 20 },
    planCard: {
      alignItems: 'center',
      backgroundColor: theme.purchaseSurface,
      borderColor: theme.purchaseSurface,
      borderRadius: radii.card,
      borderWidth: 2,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 82,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    planCardSelected: {
      backgroundColor: theme.purchaseSelectedSurface,
      borderColor: theme.accent,
    },
    planCardUnavailable: { opacity: 0.54 },
    planTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
    planTitle: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 20,
      letterSpacing: -0.75,
    },
    popularBadge: {
      backgroundColor: theme.accent,
      borderRadius: radii.pill,
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 10,
      letterSpacing: 0.7,
      overflow: 'hidden',
      paddingHorizontal: 9,
      paddingVertical: 5,
      textTransform: 'uppercase',
    },
    planAllowance: {
      color: theme.purchaseMutedText,
      fontFamily: fonts.medium,
      fontSize: 15,
      letterSpacing: -0.45,
      marginTop: 3,
    },
    planPrice: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 20,
      letterSpacing: -0.7,
    },
    planPriceSelected: { color: theme.accent },
    currentPlanLabel: {
      color: theme.purchaseCurrentText,
      fontFamily: fonts.extraBold,
      fontSize: 14,
      letterSpacing: -0.4,
    },
    creditPackSection: { marginTop: 24 },
    creditPackLabel: {
      color: theme.purchaseMutedText,
      fontFamily: fonts.extraBold,
      fontSize: 11,
      letterSpacing: 1.3,
      marginBottom: 10,
      textTransform: 'uppercase',
    },
    creditPackGrid: { flexDirection: 'row', gap: 10 },
    creditPackCard: {
      alignItems: 'center',
      backgroundColor: theme.purchaseSurface,
      borderRadius: radii.control,
      flex: 1,
      minHeight: 78,
      justifyContent: 'center',
    },
    creditPackCredits: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 22,
      letterSpacing: -0.8,
    },
    creditPackPrice: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      letterSpacing: -0.4,
      marginTop: 3,
    },
    purchaseCta: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: radii.card,
      justifyContent: 'center',
      marginTop: 24,
      minHeight: 56,
      paddingHorizontal: 16,
    },
    purchaseCtaDisabled: { opacity: 0.5 },
    purchaseCtaLabel: {
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 18,
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    purchaseDisclosure: {
      color: theme.purchaseCurrentText,
      fontFamily: fonts.medium,
      fontSize: 13,
      letterSpacing: -0.3,
      lineHeight: 19,
      marginHorizontal: 10,
      marginTop: 14,
      textAlign: 'center',
    },
    navigation: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 66,
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    navigationSpacer: { width: 44 },
    backButton: {
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    navigationTitle: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 25,
      letterSpacing: -1,
    },
    compactNavigationTitle: { fontSize: 18, letterSpacing: -0.55 },
    content: { paddingBottom: 34, paddingHorizontal: 24, paddingTop: 14 },
    compactContent: { paddingBottom: 24, paddingTop: 8 },
    heading: {
      color: theme.text,
      fontFamily: fonts.extraBold,
      fontSize: 28,
      letterSpacing: -1.25,
      lineHeight: 34,
    },
    compactHeading: { fontSize: 24, letterSpacing: -0.8, lineHeight: 29 },
    body: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 16,
      letterSpacing: -0.5,
      lineHeight: 23,
      marginTop: 10,
    },
    compactBody: {
      fontSize: 15,
      letterSpacing: -0.45,
      lineHeight: 21,
      marginTop: 8,
    },
    formCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      marginTop: 28,
      overflow: 'hidden',
    },
    compactFormCard: { marginTop: 24 },
    field: {
      borderBottomColor: theme.divider,
      borderBottomWidth: 1,
      padding: 18,
    },
    compactField: { padding: 16 },
    fieldLabel: {
      color: theme.mutedText,
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 1.1,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    compactFieldLabel: { fontSize: 11, letterSpacing: 1, marginBottom: 6 },
    input: {
      color: theme.text,
      fontFamily: fonts.medium,
      fontSize: 17,
      letterSpacing: -0.55,
      minHeight: 24,
      padding: 0,
    },
    compactInput: { fontSize: 16, letterSpacing: -0.5, minHeight: 22 },
    multilineInput: { minHeight: 100, textAlignVertical: 'top' },
    inputDisabled: { color: theme.mutedText },
    primaryButton: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: radii.control,
      justifyContent: 'center',
      marginTop: 22,
      minHeight: 56,
      paddingHorizontal: 20,
    },
    compactPrimaryButton: {
      marginTop: 20,
      minHeight: 52,
      paddingHorizontal: 18,
    },
    primaryButtonLabel: {
      color: theme.accentText,
      fontFamily: fonts.extraBold,
      fontSize: 17,
      letterSpacing: -0.55,
    },
    compactPrimaryButtonLabel: { fontSize: 16, letterSpacing: -0.5 },
    pressed: { opacity: 0.72 },
    message: {
      color: theme.danger,
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 16,
      textAlign: 'center',
    },
    loading: { marginTop: 42 },
    emptyCard: {
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      marginTop: 24,
      padding: 20,
    },
    emptyTitle: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 18,
      letterSpacing: -0.65,
    },
    emptyBody: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 4,
    },
    productCard: {
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: radii.card,
      flexDirection: 'row',
      marginTop: 14,
      minHeight: 94,
      padding: 19,
    },
    compactProductCard: {
      marginTop: 10,
      minHeight: 80,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    productCopy: { flex: 1, paddingRight: 12 },
    compactProductCopy: { paddingRight: 10 },
    productTitle: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 18,
      letterSpacing: -0.65,
    },
    compactProductTitle: { fontSize: 17, letterSpacing: -0.6 },
    productDescription: {
      color: theme.mutedText,
      fontFamily: fonts.medium,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    compactProductDescription: { lineHeight: 17, marginTop: 3 },
    productPrice: {
      color: theme.accent,
      fontFamily: fonts.extraBold,
      fontSize: 17,
      letterSpacing: -0.6,
    },
    compactProductPrice: { fontSize: 16, letterSpacing: -0.5 },
    secondaryAction: {
      color: theme.bodyText,
      fontFamily: fonts.bold,
      fontSize: 16,
      marginTop: 28,
      textAlign: 'center',
    },
    compactSecondaryAction: { fontSize: 15, marginTop: 24 },
    choiceRow: { flexDirection: 'row', gap: 10, marginTop: 26 },
    compactChoiceRow: { gap: 8, marginTop: 20 },
    choice: {
      alignItems: 'center',
      borderColor: theme.surfaceBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      flex: 1,
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    choiceSelected: { borderColor: theme.accent, borderWidth: 2 },
    compactChoice: { minHeight: 44, paddingHorizontal: 8 },
    choiceLabel: {
      color: theme.text,
      fontFamily: fonts.bold,
      fontSize: 14,
      letterSpacing: -0.4,
    },
    compactChoiceLabel: { fontSize: 13, letterSpacing: -0.35 },
  });

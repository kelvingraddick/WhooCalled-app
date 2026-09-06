import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo } from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppTheme } from '../theme/AppTheme';
import { fonts } from '../theme/fonts';
import { radii, type AppTheme } from '../theme/tokens';
import type { EvidenceSource } from '../types/lookup';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type CarrierIdentity = Readonly<{
  label: string;
  mark: string;
  color: string;
  logo?: ImageSourcePropType;
}>;

const carrierAliases: Readonly<Record<string, CarrierIdentity>> = {
  verizon: {
    label: 'Verizon',
    mark: 'V',
    color: '#CD040B',
    logo: require('../../assets/identity/verizon.png'),
  },
  att: { label: 'AT&T', mark: 'AT&T', color: '#0074C8' },
  'at&t': { label: 'AT&T', mark: 'AT&T', color: '#0074C8' },
  tmobile: { label: 'T-Mobile', mark: 'T', color: '#E20074' },
  't-mobile': { label: 'T-Mobile', mark: 'T', color: '#E20074' },
  cricket: { label: 'Cricket Wireless', mark: 'cricket', color: '#5C9F38' },
  metro: { label: 'Metro by T-Mobile', mark: 'metro', color: '#5F259F' },
  boost: {
    label: 'Boost Mobile',
    mark: 'boost',
    color: '#F15A24',
    logo: require('../../assets/identity/boost.png'),
  },
  visible: { label: 'Visible', mark: 'visible', color: '#1C1C1C' },
  mint: { label: 'Mint Mobile', mark: 'mint', color: '#5CB8A8' },
  tracfone: { label: 'TracFone', mark: 'TF', color: '#005DAA' },
  straighttalk: { label: 'Straight Talk', mark: 'ST', color: '#E31B23' },
  uscellular: { label: 'UScellular', mark: 'US', color: '#E31837' },
  spectrum: {
    label: 'Spectrum Mobile',
    mark: 'S',
    color: '#0099D8',
    logo: require('../../assets/identity/spectrum.png'),
  },
  xfinity: { label: 'Xfinity Mobile', mark: 'xfinity', color: '#6138F5' },
  googlefi: { label: 'Google Fi', mark: 'Fi', color: '#4285F4' },
  consumercellular: {
    label: 'Consumer Cellular',
    mark: 'CC',
    color: '#E97500',
  },
};

const sourceDomains: Readonly<
  Record<
    string,
    Readonly<{
      label: string;
      mark: string;
      color: string;
      logo?: ImageSourcePropType;
    }>
  >
> = {
  yellowpages: { label: 'Yellow Pages', mark: 'YP', color: '#F7D400' },
  yelp: {
    label: 'Yelp',
    mark: 'Y',
    color: '#D32323',
    logo: require('../../assets/identity/yelp.png'),
  },
  bbb: { label: 'Better Business Bureau', mark: 'BBB', color: '#005A8B' },
  chamberofcommerce: {
    label: 'Chamber of Commerce',
    mark: 'CoC',
    color: '#004B87',
  },
  facebook: {
    label: 'Facebook',
    mark: 'f',
    color: '#1877F2',
    logo: require('../../assets/identity/facebook.png'),
  },
  linkedin: { label: 'LinkedIn', mark: 'in', color: '#0A66C2' },
  google: {
    label: 'Google',
    mark: 'G',
    color: '#4285F4',
    logo: require('../../assets/identity/google.png'),
  },
};

export function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9&]/g, '');
}

export function carrierIdentity(
  carrier: string | null | undefined,
): CarrierIdentity | null {
  const key = normalizeIdentity(carrier);
  return carrierAliases[key] ?? null;
}

function sourceDomainIdentity(domain: string | null) {
  const key = normalizeIdentity(domain?.replace(/^www\./, '').split('.')[0]);
  return sourceDomains[key] ?? null;
}

function sourceType(
  source: EvidenceSource,
): Readonly<{ icon: IconName; label: string }> {
  if (source.kind === 'CNAM')
    return { icon: 'call-outline', label: 'Caller ID record' };
  if (source.kind === 'IDENTITY')
    return { icon: 'finger-print-outline', label: 'Identity database' };
  if (source.kind === 'DIRECTORY')
    return { icon: 'business-outline', label: 'Business directory' };
  return { icon: 'globe-outline', label: 'Public website' };
}

function Tile({
  mark,
  color,
  icon,
  logo,
  size = 38,
}: Readonly<{
  mark?: string;
  color?: string;
  icon?: IconName;
  logo?: ImageSourcePropType;
  size?: number;
}>) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View
      accessible={false}
      style={[
        styles.tile,
        Boolean(logo) && styles.logoTile,
        { height: size, width: size },
        color && !logo && { backgroundColor: color },
      ]}
    >
      {logo ? (
        <Image
          source={logo}
          style={[
            styles.logo,
            { height: Math.round(size * 0.62), width: Math.round(size * 0.62) },
          ]}
        />
      ) : mark ? (
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[
            styles.mark,
            { fontSize: mark.length > 4 ? 8 : mark.length > 2 ? 10 : 16 },
          ]}
        >
          {mark}
        </Text>
      ) : icon ? (
        <Ionicons
          color={theme.accent}
          name={icon}
          size={Math.round(size * 0.52)}
        />
      ) : null}
    </View>
  );
}

export function CarrierMark({
  carrier,
  size,
}: Readonly<{ carrier: string | null | undefined; size?: number }>) {
  const theme = useAppTheme();
  const identity = carrierIdentity(carrier);
  return identity ? (
    <View accessibilityLabel={`${identity.label} carrier mark`} accessible>
      <Tile
        color={identity.color}
        logo={identity.logo}
        mark={identity.mark}
        size={size}
      />
    </View>
  ) : (
    <View accessibilityLabel="Network provider" accessible>
      <Ionicons
        color={theme.accent}
        name="cellular-outline"
        size={size ?? 18}
      />
    </View>
  );
}

export function SourceMark({
  source,
  size,
}: Readonly<{ source: EvidenceSource; size?: number }>) {
  const publisher = sourceDomainIdentity(source.domain);
  const type = sourceType(source);
  return (
    <View
      accessibilityLabel={publisher ? `${publisher.label} source` : type.label}
      accessible
    >
      <Tile
        color={publisher?.color}
        icon={publisher ? undefined : type.icon}
        logo={publisher?.logo}
        mark={publisher?.mark}
        size={size}
      />
    </View>
  );
}

export function ProviderMark({
  source,
  size,
}: Readonly<{ source: EvidenceSource; size?: number }>) {
  const provider =
    source.retrievalProvider === 'GOOGLE_GROUNDING'
      ? {
          label: 'Google Search',
          mark: 'G',
          color: '#4285F4',
          logo: require('../../assets/identity/google.png'),
        }
      : source.retrievalProvider === 'BRAVE'
      ? { label: 'Brave Search', mark: 'B', color: '#FB542B' }
      : source.id.startsWith('twilio-')
      ? { label: 'Twilio', mark: 'twilio', color: '#F22F46' }
      : source.id.startsWith('trestle-')
      ? { label: 'Trestle', mark: 'T', color: '#203E74' }
      : null;
  return provider ? (
    <View accessibilityLabel={`${provider.label} lookup provider`} accessible>
      <Tile
        color={provider.color}
        logo={'logo' in provider ? provider.logo : undefined}
        mark={provider.mark}
        size={size}
      />
    </View>
  ) : null;
}

export function UtilityIcon({
  color,
  name,
  size = 20,
}: Readonly<{ color?: string; name: IconName; size?: number }>) {
  const theme = useAppTheme();
  return (
    <Ionicons
      accessible={false}
      color={color ?? theme.accent}
      name={name}
      size={size}
    />
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    tile: {
      alignItems: 'center',
      backgroundColor: theme.accentMuted,
      borderRadius: radii.control,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoTile: { backgroundColor: theme.surface },
    logo: { resizeMode: 'contain' },
    mark: {
      color: '#FFFFFF',
      fontFamily: fonts.extraBold,
      letterSpacing: -0.6,
      paddingHorizontal: 3,
    },
  });

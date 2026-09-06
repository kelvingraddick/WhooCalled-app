import { Image, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../theme/AppTheme';

const owl = require('../../assets/branding/whoo-called-owl-master.png');
const transparentOwl = require('../../assets/branding/whoo-called-owl-transparent-1024.png');

type BrandOwlProps = Readonly<{
  size: number;
  framed?: boolean;
  transparent?: boolean;
}>;

export function BrandOwl({
  size,
  framed = true,
  transparent = true,
}: BrandOwlProps) {
  const theme = useAppTheme();
  const imageSize = Math.round(size * (framed ? 0.78 : 1));

  return (
    <View
      style={[
        styles.container,
        framed && [
          styles.framed,
          {
            backgroundColor: theme.background,
            borderColor: theme.surfaceBorder,
          },
        ],
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Image
        source={transparent ? transparentOwl : owl}
        resizeMode="contain"
        style={{
          borderRadius: framed ? imageSize / 2 : 0,
          height: imageSize,
          width: imageSize,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  framed: {
    borderWidth: 2,
    overflow: 'hidden',
  },
});

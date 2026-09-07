import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { colors } from '../theme';

type Props = {
  playing: boolean;
  progress: number;
  onPress: () => void;
  size?: number;
};

export function TickPlayButton({ playing, progress, onPress, size = 72 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 3;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const outer = radius - 1;
    const inner = i % 5 === 0 ? radius - 8 : radius - 5;
    const filled = i / 60 <= progress;
    return (
      <Line
        key={i}
        x1={cx + Math.cos(angle) * inner}
        y1={cy + Math.sin(angle) * inner}
        x2={cx + Math.cos(angle) * outer}
        y2={cy + Math.sin(angle) * outer}
        stroke={filled ? colors.second : colors.line}
        strokeWidth={i % 5 === 0 ? 2 : 1.4}
        strokeLinecap="round"
      />
    );
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? '暂停' : '播放'}
      hitSlop={6}
      style={({ pressed }) => [styles.wrap, { width: size, height: size, opacity: pressed ? 0.75 : 1 }]}
    >
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={radius} fill={colors.card} stroke={colors.ink} strokeWidth={1.2} />
        {ticks}
      </Svg>
      <View style={[styles.glyph, playing ? styles.pause : styles.play]} />
      {playing ? <View style={styles.pauseBar} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    position: 'absolute',
    backgroundColor: colors.second,
  },
  play: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.second,
    marginLeft: 3,
  },
  pause: {
    width: 5,
    height: 16,
    borderRadius: 1,
    left: '38%',
  },
  pauseBar: {
    position: 'absolute',
    width: 5,
    height: 16,
    borderRadius: 1,
    backgroundColor: colors.second,
    right: '38%',
  },
});

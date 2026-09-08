import { Animated, PanResponder } from 'react-native';

export const createMenuPanResponder = ({ panelBottom, overlayOpacity, panelHeight, isClosing, onClose }: {
  panelBottom: Animated.Value;
  overlayOpacity: Animated.Value;
  panelHeight: { current: number };
  isClosing: { current: boolean };
  onClose: () => void;
}) => {
  let startBottom = 0;

  const restore = () => {
    if (isClosing.current) return;
    Animated.parallel([
      Animated.timing(panelBottom, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  return PanResponder.create({
    onStartShouldSetPanResponder: () => !isClosing.current,
    onPanResponderGrant: () => {
      overlayOpacity.stopAnimation();
      // 열기·복귀 애니메이션 중 잡아도 현재 위치에서 이어서 움직입니다.
      panelBottom.stopAnimation(value => { startBottom = value; });
    },
    onPanResponderMove: (_, { dy }) => {
      if (isClosing.current) return;
      const distance = Math.min(panelHeight.current, Math.max(0, -startBottom + dy));
      panelBottom.setValue(-distance);
      overlayOpacity.setValue(1 - distance / panelHeight.current);
    },
    onPanResponderRelease: (_, { dy, vy }) => {
      if (isClosing.current) return;
      if (dy >= 60 || (dy > 12 && vy > 0.6)) {
        onClose();
      } else {
        restore();
      }
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: restore,
  });
};

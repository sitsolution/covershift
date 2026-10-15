import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The tab bar's style, sized to clear the phone's own navigation bar.
 *  Android draws edge-to-edge, so on phones with on-screen back/home buttons
 *  a fixed height put the tabs underneath them. Gesture-navigation phones have
 *  a near-zero inset, which is why the bug only showed on some devices.
 *  Shared with screens that hide the bar and restore it on leave. */
export function useTabBarStyle() {
  const insets = useSafeAreaInsets();
  return {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#DCE4EA',
    height: 56 + insets.bottom,
    paddingBottom: 6 + insets.bottom,
    paddingTop: 6,
  };
}

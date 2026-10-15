import React, { useContext } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Override which edges get safe-area padding. */
  edges?: Edge[];
};

const ALL_EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];
const NO_BOTTOM: Edge[] = ['top', 'right', 'left'];

export default function Screen({ children, style, edges }: Props) {
  // Inside the tab navigator the tab bar already clears the phone's navigation
  // bar; padding the bottom here as well left an empty band above the tabs on
  // phones with on-screen buttons. Outside the tabs (auth screens) it is needed.
  const insideTabs = useContext(BottomTabBarHeightContext) !== undefined;
  return (
    <SafeAreaView style={[styles.container, style]} edges={edges ?? (insideTabs ? NO_BOTTOM : ALL_EDGES)}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FA' },
  flex: { flex: 1 },
});

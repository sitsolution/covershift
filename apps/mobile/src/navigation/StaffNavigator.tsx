import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigatorScreenParams } from '@react-navigation/native';
import { useTabBarStyle } from './tabBarStyle';
import HomeStackNavigator, { HomeStackParamList } from './HomeStackNavigator';
import ShiftsStackNavigator, { ShiftsStackParamList } from './ShiftsStackNavigator';
import CalendarStackNavigator, { CalendarStackParamList } from './CalendarStackNavigator';
import DocsStackNavigator, { DocsStackParamList } from './DocsStackNavigator';
import ProfileStackNavigator, { ProfileStackParamList } from './ProfileStackNavigator';

export type StaffTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Shifts: NavigatorScreenParams<ShiftsStackParamList>;
  Calendar: NavigatorScreenParams<CalendarStackParamList>;
  Docs: NavigatorScreenParams<DocsStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

const Tab = createBottomTabNavigator<StaffTabParamList>();

const ACTIVE = '#0F3D5C';
const INACTIVE = '#8697A6';

const items: [string, string, keyof StaffTabParamList][] = [
  ['🏠', 'Home', 'Home'],
  ['🩺', 'Shifts', 'Shifts'],
  ['📅', 'Calendar', 'Calendar'],
  ['📁', 'Docs', 'Docs'],
  ['👤', 'Profile', 'Profile'],
];

const SCREEN_MAP = {
  Home: HomeStackNavigator,
  Shifts: ShiftsStackNavigator,
  Calendar: CalendarStackNavigator,
  Docs: DocsStackNavigator,
  Profile: ProfileStackNavigator,
};

export default function StaffNavigator() {
  const tabBarStyle = useTabBarStyle();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle,
      }}
    >
      {items.map(([ic, label, name]) => (
        <Tab.Screen
          key={name}
          name={name}
          component={SCREEN_MAP[name]}
          options={{
            tabBarIcon: ({ focused }) => (
              <View style={styles.tabItem}>
                <Text style={styles.ic}>{ic}</Text>
                <Text style={[styles.label, { color: focused ? ACTIVE : INACTIVE, fontWeight: focused ? '700' : '600' }]}>
                  {label}
                </Text>
              </View>
            ),
          }}
          listeners={({ navigation, route }) => ({
            tabPress: (e) => {
              if (navigation.isFocused()) {
                // Tab already active — prevent default and reset stack to root
                e.preventDefault();
                navigation.navigate(route.name);
              }
            },
          })}
        />
      ))}
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabItem: { alignItems: 'center', justifyContent: 'center' },
  ic: { fontSize: 16 },
  label: { fontSize: 9.5, marginTop: 2 },
});

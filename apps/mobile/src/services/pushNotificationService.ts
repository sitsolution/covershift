/**
 * Push notification service — Expo Push (handles FCM + APNs under the hood).
 *
 * Usage
 * -----
 * Call registerForPushNotifications() once after the user logs in.
 * Call unregisterPushNotifications() when the user logs out or disables push
 * in settings.
 *
 * TODO: Replace EXPO_PROJECT_ID_PLACEHOLDER with your real Expo project ID
 * once the client provides it.  Find it at expo.dev → project → Overview.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import userService from './userService';

// ── Notification display behaviour while the app is in the foreground ─────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// TODO: replace with the real Expo project ID from expo.dev once client provides it
const EXPO_PROJECT_ID = '7c1ce14e-fe45-4507-b2ab-444d3d800510';

export async function registerForPushNotifications(): Promise<void> {
  // Physical device required — simulators/emulators don't receive push
  const isDevice = !__DEV__ || Platform.OS !== 'web';
  if (!isDevice) return;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    // User denied — nothing to register; the in-app polling still works
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    const platform = Platform.OS as 'ios' | 'android';
    await userService.registerDeviceToken(token, platform);
  } catch (err) {
    // Non-fatal: push token unavailable (e.g., running in Expo Go without
    // projectId), fall back to in-app polling silently.
    console.warn('[Push] Failed to register push token:', err);
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });
    const platform = Platform.OS as 'ios' | 'android';
    await userService.unregisterDeviceToken(token, platform);
  } catch {
    // Token may never have been registered — ignore
  }
}

/**
 * Listen for notification taps while the app is open.
 * Returns a cleanup function — call it in useEffect cleanup.
 */
export function addNotificationResponseListener(
  onTap: (entityType?: string, entityId?: number) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    onTap(data?.entity_type as string | undefined, data?.entity_id as number | undefined);
  });
  return () => sub.remove();
}

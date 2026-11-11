import { createNavigationContainerRef } from '@react-navigation/native';
import type { StaffTabParamList } from './StaffNavigator';

/** Lets code outside a screen (e.g. a push notification tap) navigate. */
export const navigationRef = createNavigationContainerRef<StaffTabParamList>();

/** Open the screen a tapped push notification is about. */
export function openFromNotification(entityType?: string, entityId?: number): void {
  if (!navigationRef.isReady()) return;

  if (entityType === 'shift' && entityId) {
    navigationRef.navigate('Home', { screen: 'ShiftDetails', params: { shiftId: entityId } });
  } else if (entityType === 'payment') {
    navigationRef.navigate('Profile', { screen: 'Earnings' });
  } else if (entityType === 'document') {
    navigationRef.navigate('Docs', { screen: 'DocsList' });
  } else {
    // Applications, messages and anything else: the Notifications list
    // already knows how to open each of them.
    navigationRef.navigate('Home', { screen: 'Notifications' });
  }
}

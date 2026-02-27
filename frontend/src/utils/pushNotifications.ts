/**
 * Expo Push Notifications: register device and get token for backend.
 * On web or non-device (simulator) returns null.
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

export async function registerForPushTokenAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== "granted") return null;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData?.data ?? null;
  } catch {
    return null;
  }
}

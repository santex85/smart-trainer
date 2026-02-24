import React, { useEffect, useState } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getMe, setOnUnauthorized } from "./src/api/client";
import { getAccessToken, removeAccessToken } from "./src/storage/authStorage";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { CameraScreen } from "./src/screens/CameraScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { StravaLinkScreen } from "./src/screens/StravaLinkScreen";
import { StravaActivityScreen } from "./src/screens/StravaActivityScreen";
import { WellnessScreen } from "./src/screens/WellnessScreen";
import { AthleteProfileScreen } from "./src/screens/AthleteProfileScreen";
import type { AuthUser } from "./src/api/client";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [stravaModalVisible, setStravaModalVisible] = useState(false);
  const [refreshNutritionTrigger, setRefreshNutritionTrigger] = useState(0);
  const [refreshStravaTrigger, setRefreshStravaTrigger] = useState(0);
  const [refreshSleepTrigger, setRefreshSleepTrigger] = useState(0);

  useEffect(() => {
    setOnUnauthorized(() => {
      removeAccessToken();
      setUser(null);
    });
  }, []);

  useEffect(() => {
    getAccessToken()
      .then((token) => {
        if (token) return getMe().then(setUser).catch(() => setUser(null));
        setUser(null);
      })
      .finally(() => setIsReady(true));
  }, []);

  const closeCamera = () => {
    setCameraVisible(false);
    setRefreshNutritionTrigger((t) => t + 1);
  };

  const closeStrava = () => {
    setStravaModalVisible(false);
    setRefreshStravaTrigger((t) => t + 1);
  };

  const handleLogout = async () => {
    await removeAccessToken();
    setUser(null);
  };

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <View style={[styles.root, styles.centered]}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.root}>
          <NavigationContainer>
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#1a1a2e" },
              }}
            >
              <Stack.Screen name="Login">
                {({ navigation }) => (
                  <LoginScreen
                    onSuccess={setUser}
                    onGoToRegister={() => navigation.navigate("Register")}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Register">
                {({ navigation }) => (
                  <RegisterScreen
                    onSuccess={setUser}
                    onGoToLogin={() => navigation.goBack()}
                  />
                )}
              </Stack.Screen>
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
        <View style={styles.root}>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#1a1a2e" },
            }}
          >
            <Stack.Screen name="Dashboard">
              {({ navigation }) => (
                <DashboardScreen
                  user={user}
                  onLogout={handleLogout}
                  onOpenCamera={() => setCameraVisible(true)}
                  onOpenChat={() => setChatVisible(true)}
                  onOpenStrava={() => setStravaModalVisible(true)}
                  onOpenStravaActivity={() => navigation.navigate("StravaActivity")}
                  onOpenWellness={() => navigation.navigate("Wellness")}
                  onOpenAthleteProfile={() => navigation.navigate("AthleteProfile")}
                  refreshNutritionTrigger={refreshNutritionTrigger}
                  refreshStravaTrigger={refreshStravaTrigger}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="StravaActivity">
              {({ navigation }) => (
                <StravaActivityScreen onClose={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Wellness">
              {({ navigation }) => (
                <WellnessScreen onClose={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="AthleteProfile">
              {({ navigation }) => (
                <AthleteProfileScreen onClose={() => navigation.goBack()} />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>

        {cameraVisible && (
          <View style={styles.modal}>
            <CameraScreen
              onClose={closeCamera}
              onSaved={() => {
                setRefreshNutritionTrigger((t) => t + 1);
                setCameraVisible(false);
              }}
              onSleepSaved={() => {
                setRefreshSleepTrigger((t) => t + 1);
                setCameraVisible(false);
              }}
            />
          </View>
        )}

        {chatVisible && (
          <View style={styles.modal}>
            <ChatScreen onClose={() => setChatVisible(false)} />
          </View>
        )}

        {stravaModalVisible && (
          <View style={styles.modal}>
            <StravaLinkScreen
              onClose={closeStrava}
              onViewAllActivity={() => {
                setStravaModalVisible(false);
                setTimeout(() => (navigationRef as { current?: { navigate: (name: string) => void } }).current?.navigate("StravaActivity"), 0);
              }}
            />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14, color: "#94a3b8" },
  modal: { ...StyleSheet.absoluteFillObject, backgroundColor: "#1a1a2e", zIndex: 10 },
});

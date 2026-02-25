import React, { useEffect, useState } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { getMe, setOnUnauthorized } from "./src/api/client";
import { getAccessToken, removeAccessToken } from "./src/storage/authStorage";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { CameraScreen } from "./src/screens/CameraScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { AthleteProfileScreen } from "./src/screens/AthleteProfileScreen";
import { IntervalsLinkScreen } from "./src/screens/IntervalsLinkScreen";
import type { AuthUser } from "./src/api/client";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [intervalsVisible, setIntervalsVisible] = useState(false);
  const [refreshNutritionTrigger, setRefreshNutritionTrigger] = useState(0);
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

  const handleLogout = async () => {
    await removeAccessToken();
    setUser(null);
  };

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <View style={[styles.root, styles.centered]}>
          <ActivityIndicator size="large" color="#38bdf8" />
          <Text style={styles.loadingText}>Загрузка…</Text>
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
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: { backgroundColor: "#16213e", borderTopColor: "#334155" },
              tabBarActiveTintColor: "#38bdf8",
              tabBarInactiveTintColor: "#64748b",
            }}
          >
            <Tab.Screen
              name="Home"
              options={{ tabBarLabel: "Главная" }}
            >
              {({ navigation }) => (
                <DashboardScreen
                  user={user}
                  onLogout={handleLogout}
                  onOpenCamera={() => setCameraVisible(true)}
                  onOpenChat={() => navigation.navigate("Chat")}
                  onOpenAthleteProfile={() => navigation.navigate("Profile")}
                  onOpenIntervals={() => setIntervalsVisible(true)}
                  refreshNutritionTrigger={refreshNutritionTrigger}
                  refreshSleepTrigger={refreshSleepTrigger}
                />
              )}
            </Tab.Screen>
            <Tab.Screen
              name="Chat"
              options={{ tabBarLabel: "Чат" }}
            >
              {({ navigation }) => (
                <ChatScreen onClose={() => navigation.navigate("Home")} />
              )}
            </Tab.Screen>
            <Tab.Screen
              name="Profile"
              options={{ tabBarLabel: "Профиль" }}
            >
              {({ navigation }) => (
                <AthleteProfileScreen onClose={() => navigation.navigate("Home")} />
              )}
            </Tab.Screen>
          </Tab.Navigator>
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

        {intervalsVisible && (
          <View style={styles.modal}>
            <IntervalsLinkScreen onClose={() => setIntervalsVisible(false)} />
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

import React, { forwardRef } from "react";
import { View, Text, StyleSheet, Image, ImageSourcePropType } from "react-native";
import { darkColors } from "../theme/colors";

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1080;

export type InsightShareCardProps = {
  avatarUri?: string | null;
  displayName?: string;
  metricLabel: string;
  metricValue: string;
  quote: string;
  logoSource?: ImageSourcePropType;
};

function getInitials(displayName?: string): string {
  if (!displayName || !displayName.trim()) return "?";
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return (first + last).toUpperCase().slice(0, 2);
  }
  return displayName.slice(0, 2).toUpperCase();
}

export const InsightShareCard = forwardRef<View, InsightShareCardProps>(function InsightShareCard(
  { avatarUri, displayName, metricLabel, metricValue, quote, logoSource },
  ref
) {
  const initials = getInitials(displayName);
  const logo = logoSource ?? require("../../assets/logo-source.png");

  return (
    <View ref={ref} style={styles.root} collapsable={false}>
      <View style={styles.inner}>
        <View style={styles.header}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <Image source={logo} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={styles.metricBlock}>
          <Text style={styles.metricValue}>{metricValue}</Text>
          <Text style={styles.metricLabel}>{metricLabel}</Text>
        </View>
        <View style={styles.quoteBlock}>
          <Text style={styles.quoteText}>«{quote}»</Text>
          <Text style={styles.brand}>tssAI</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    backgroundColor: darkColors.background,
    borderRadius: 24,
    overflow: "hidden",
  },
  inner: {
    flex: 1,
    padding: 72,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: darkColors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 48,
    fontWeight: "700",
    color: darkColors.primary,
  },
  logo: {
    width: 140,
    height: 44,
  },
  metricBlock: {
    alignItems: "center",
  },
  metricValue: {
    fontSize: 96,
    fontWeight: "800",
    color: darkColors.text,
    letterSpacing: -2,
  },
  metricLabel: {
    fontSize: 32,
    color: darkColors.textMuted,
    marginTop: 8,
  },
  quoteBlock: {
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: darkColors.surfaceBorder,
  },
  quoteText: {
    fontSize: 36,
    lineHeight: 48,
    color: darkColors.textSecondary,
    fontStyle: "italic",
  },
  brand: {
    fontSize: 28,
    color: darkColors.primary,
    fontWeight: "600",
    marginTop: 16,
  },
});

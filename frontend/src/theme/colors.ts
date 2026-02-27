/** Theme color tokens. Use via useTheme(). */

export const darkColors = {
  background: "#1a1a2e",
  surface: "#16213e",
  surfaceBorder: "#334155",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textSecondary: "#b8c5d6",
  primary: "#38bdf8",
  primaryText: "#0f172a",
  danger: "#dc2626",
  success: "#22c55e",
  warning: "#f59e0b",
  accent: "#8b5cf6",
  inputBg: "#1a1a2e",
  inputBorder: "#334155",
  tabBarBg: "#16213e",
  tabBarBorder: "#334155",
  tabActive: "#38bdf8",
  tabInactive: "#64748b",
  modalBackdrop: "rgba(0,0,0,0.5)",
  skeleton: "#334155",
} as const;

export const lightColors = {
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceBorder: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  textSecondary: "#475569",
  primary: "#0ea5e9",
  primaryText: "#ffffff",
  danger: "#dc2626",
  success: "#16a34a",
  warning: "#d97706",
  accent: "#7c3aed",
  inputBg: "#f1f5f9",
  inputBorder: "#cbd5e1",
  tabBarBg: "#ffffff",
  tabBarBorder: "#e2e8f0",
  tabActive: "#0ea5e9",
  tabInactive: "#64748b",
  modalBackdrop: "rgba(0,0,0,0.4)",
  skeleton: "#e2e8f0",
} as const;

export type ThemeColors = typeof darkColors;
export type ThemeMode = "dark" | "light";

export const themes: Record<ThemeMode, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};

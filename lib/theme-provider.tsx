import { createContext, useContext, useEffect, useMemo } from "react";
import { View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

type ThemeContextValue = {
  colorScheme: ColorScheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // HY3N mirrors iOS/Android appearance directly. There is no stored override.
  const colorScheme: ColorScheme = useSystemColorScheme() === "dark" ? "dark" : "light";

  useEffect(() => {
    nativewindColorScheme.set(colorScheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = colorScheme;
      root.classList.toggle("dark", colorScheme === "dark");
      const palette = SchemeColors[colorScheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, value);
      });
    }
  }, [colorScheme]);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": SchemeColors[colorScheme].primary,
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme],
  );

  const value = useMemo(
    () => ({ colorScheme }),
    [colorScheme],
  );
  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1, backgroundColor: SchemeColors[colorScheme].background }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}

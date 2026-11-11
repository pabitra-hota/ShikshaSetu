import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);
const STORAGE_KEY = "shikshasetu-theme";

export function ThemeProvider({ children, initialTheme = "dark" }) {
  const [theme, setThemeState] = useState(initialTheme === "light" ? "light" : "dark");

  useEffect(() => {
    const cookieTheme = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${STORAGE_KEY}=`))
      ?.slice(`${STORAGE_KEY}=`.length);
    let savedTheme = cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : null;
    try {
      // Migrate the theme choice saved by older versions into a server-readable cookie.
      if (!savedTheme) savedTheme = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // The in-memory theme still works when browser storage is unavailable.
    }
    const nextTheme = savedTheme === "light" ? "light" : "dark";
    setThemeState(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    if (!cookieTheme) {
      document.cookie = `${STORAGE_KEY}=${nextTheme}; path=/; max-age=31536000; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
    }
  }, []);

  const setTheme = useCallback((nextTheme) => {
    const safeTheme = nextTheme === "light" ? "light" : "dark";
    setThemeState(safeTheme);
    document.documentElement.dataset.theme = safeTheme;
    document.documentElement.style.colorScheme = safeTheme;
    try {
      window.localStorage.setItem(STORAGE_KEY, safeTheme);
    } catch {
      // Keep the selected theme for this page even if persistence is blocked.
    }
    document.cookie = `${STORAGE_KEY}=${safeTheme}; path=/; max-age=31536000; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", safeTheme === "dark" ? "#101916" : "#f6f5ef");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [setTheme, theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

"use client";

import * as React from "react";
import {
    ThemeProvider as NextThemesProvider,
    useTheme,
} from "next-themes";

type ThemeName = "light" | "dark" | "system";

const NEXT_DEVTOOLS_THEME_KEY = "__nextjs-dev-tools-theme";

function normalizeTheme(value: unknown): ThemeName | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "light" || normalized === "dark" || normalized === "system") {
        return normalized;
    }
    return null;
}

function getPortalTheme(): ThemeName | null {
    const portal = document.querySelector("nextjs-portal");
    if (!portal) return null;
    if (portal.classList.contains("dark")) return "dark";
    if (portal.classList.contains("light")) return "light";
    return null;
}

function getExternalTheme(): ThemeName {
    try {
        const storageTheme = normalizeTheme(
            window.localStorage.getItem(NEXT_DEVTOOLS_THEME_KEY),
        );
        if (storageTheme) return storageTheme;
    } catch {
        return getPortalTheme() ?? "system";
    }

    const portalTheme = getPortalTheme();
    if (portalTheme) {
        return portalTheme;
    }

    return "system";
}

function ThemeBridge() {
    const { theme, resolvedTheme, setTheme } = useTheme();

    React.useEffect(() => {
        if (resolvedTheme === "light" || resolvedTheme === "dark") {
            document.documentElement.setAttribute("data-theme", resolvedTheme);
        }
    }, [resolvedTheme]);

    React.useEffect(() => {
        const syncExternalTheme = () => {
            const nextTheme = getExternalTheme();
            if (nextTheme && nextTheme !== theme) {
                setTheme(nextTheme);
            }
        };

        syncExternalTheme();

        let portalObserver: MutationObserver | null = null;

        const observePortal = () => {
            const portal = document.querySelector("nextjs-portal");
            if (!portal) return;

            portalObserver?.disconnect();
            portalObserver = new MutationObserver(syncExternalTheme);
            portalObserver.observe(portal, {
                attributes: true,
                attributeFilter: ["class"],
            });
        };

        observePortal();

        const rootObserver = new MutationObserver(() => {
            observePortal();
            syncExternalTheme();
        });
        rootObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        const onStorage = (event: StorageEvent) => {
            if (event.key === NEXT_DEVTOOLS_THEME_KEY) {
                syncExternalTheme();
            }
        };

        window.addEventListener("storage", onStorage);

        return () => {
            portalObserver?.disconnect();
            rootObserver.disconnect();
            window.removeEventListener("storage", onStorage);
        };
    }, [setTheme, theme]);

    return null;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    return (
        <NextThemesProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <ThemeBridge />
            {children}
        </NextThemesProvider>
    );
}

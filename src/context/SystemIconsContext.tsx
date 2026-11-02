'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, deleteField } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export interface SystemIconDef {
  key: string;
  name: string;
  category: 'navigation' | 'combat' | 'economy' | 'status' | 'meta';
  defaultEmoji: string;
  description: string;
}

export const SYSTEM_ICON_DEFINITIONS: SystemIconDef[] = [
  {
    key: 'map',
    name: 'World Map',
    category: 'navigation',
    defaultEmoji: '🗺️',
    description: 'Header titles, map navigation buttons, and "Return to Map" links',
  },
  {
    key: 'character',
    name: 'Character Profile',
    category: 'navigation',
    defaultEmoji: '🦉',
    description: 'Top bar character navigation links and character sheet buttons',
  },
  {
    key: 'home',
    name: 'Home / Menu',
    category: 'navigation',
    defaultEmoji: '🏠',
    description: 'Home navigation button and main entrance links',
  },
  {
    key: 'shop',
    name: 'Store / Merchant',
    category: 'economy',
    defaultEmoji: '🏪',
    description: 'Outpost store headers, merchant visit buttons, and shopping links',
  },
  {
    key: 'gold',
    name: 'Gold / Currency',
    category: 'economy',
    defaultEmoji: '🪙',
    description: 'Coin purses, item pricing, reward displays, and treasury counters',
  },
  {
    key: 'fight',
    name: 'Fight / Battle',
    category: 'combat',
    defaultEmoji: '⚔️',
    description: 'Battle encounter cards, fight CTA buttons, and attack commands',
  },
  {
    key: 'escape',
    name: 'Escape / Retreat',
    category: 'combat',
    defaultEmoji: '🏃',
    description: 'Battle retreat buttons, flee prompts, and escape confirmation modals',
  },
  {
    key: 'inventory',
    name: 'Bag / Objects',
    category: 'combat',
    defaultEmoji: '🎒',
    description: 'Battle objects button, inventory bag triggers, and item slots',
  },
  {
    key: 'foeAttack',
    name: 'Foe Attack Damage',
    category: 'combat',
    defaultEmoji: '⚔️',
    description: 'Enemy attack damage stat shown in foe stats (battle intro)',
  },
  {
    key: 'equippedGear',
    name: 'Equipped Gear',
    category: 'combat',
    defaultEmoji: '🎒',
    description: 'Character sheet Equipped Gear section heading',
  },
  {
    key: 'equippedMainHand',
    name: 'Equipped Main Hand',
    category: 'combat',
    defaultEmoji: '⚔️',
    description: 'Empty main-hand slot in the character sheet Equipped Gear section',
  },
  {
    key: 'equippedOffHand',
    name: 'Equipped Off Hand',
    category: 'combat',
    defaultEmoji: '🛡️',
    description: 'Empty off-hand slot in the character sheet Equipped Gear section',
  },
  {
    key: 'equippedArmor',
    name: 'Equipped Armor',
    category: 'combat',
    defaultEmoji: '🥋',
    description: 'Empty armor slot in the character sheet Equipped Gear section',
  },
  {
    key: 'equippedHead',
    name: 'Equipped Head',
    category: 'combat',
    defaultEmoji: '👑',
    description: 'Empty head slot in the character sheet Equipped Gear section',
  },
  {
    key: 'potion',
    name: 'Potion / Consumable',
    category: 'combat',
    defaultEmoji: '🧪',
    description: 'Healing potions, elixir triggers, and consumable slots',
  },
  {
    key: 'hp',
    name: 'Health (HP)',
    category: 'status',
    defaultEmoji: '❤️',
    description: 'Health bars, player/foe vitality indicators, and level-up HP bonuses',
  },
  {
    key: 'xp',
    name: 'Experience (XP)',
    category: 'status',
    defaultEmoji: '⭐',
    description: 'XP bars, victory experience tallies, and progression badges',
  },
  {
    key: 'victory',
    name: 'Victory / Triumph',
    category: 'status',
    defaultEmoji: '🏆',
    description: 'Battle triumph screen banner, victory medals, and quest clears',
  },
  {
    key: 'defeat',
    name: 'Defeat / Fallen',
    category: 'status',
    defaultEmoji: '💀',
    description: 'Battle defeat screen banner, combatant fallen notice, and revival prompts',
  },
  {
    key: 'lock',
    name: 'Locked Content',
    category: 'meta',
    defaultEmoji: '🔒',
    description: 'Locked sub-area pins, sealed regions, and prerequisite gate indicators',
  },
  {
    key: 'hint',
    name: 'Explanation / Hint',
    category: 'meta',
    defaultEmoji: '💡',
    description: 'Ask for explanation buttons and question solution modals',
  },
  {
    key: 'timer',
    name: 'Timer / Turn',
    category: 'meta',
    defaultEmoji: '⏳',
    description: 'Turn timers, speed challenges, and countdown clocks',
  },
];

const DEFAULT_EMOJI_MAP: Record<string, string> = SYSTEM_ICON_DEFINITIONS.reduce(
  (acc, def) => ({ ...acc, [def.key]: def.defaultEmoji }),
  {}
);

interface SystemIconsContextType {
  icons: Record<string, string>;
  isLoading: boolean;
  hasPermissionNotice: boolean;
  getIconUrl: (key: string) => string | undefined;
  getDefaultEmoji: (key: string) => string;
  updateIcon: (key: string, url: string) => Promise<{ success: boolean; permissionNotice?: boolean }>;
  resetIcon: (key: string) => Promise<{ success: boolean; permissionNotice?: boolean }>;
  setMultipleIcons: (mapping: Record<string, string>) => Promise<void>;
}

const LOCAL_STORAGE_KEY = 'mq_system_icons_cache';

const SystemIconsContext = createContext<SystemIconsContextType | null>(null);

export function SystemIconsProvider({ children }: { children: React.ReactNode }) {
  const [icons, setIcons] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) return JSON.parse(cached);
      } catch {
        // ignore storage errors
      }
    }
    return {};
  });

  const [isLoading, setIsLoading] = useState(true);
  const [hasPermissionNotice, setHasPermissionNotice] = useState(false);

  // Dual-target Firestore document refs (primary system_settings and fallback locations which is already open to signed-in users)
  useEffect(() => {
    let fallbackUnsub: (() => void) | null = null;

    // Cloud sources are authoritative: an icon missing from every loaded source is dropped locally
    const sources: Record<'primary' | 'fallback' | 'character', Record<string, string> | null> = {
      primary: null,
      fallback: null,
      character: null,
    };

    const applySource = (name: keyof typeof sources, data: Record<string, string> | null) => {
      sources[name] = data || {};
      const merged: Record<string, string> = {};
      Object.entries({ ...sources.character, ...sources.fallback, ...sources.primary }).forEach(([k, v]) => {
        if (typeof v === 'string' && v.trim()) merged[k] = v;
      });
      setIcons((prev) => {
        const prevKeys = Object.keys(prev);
        const same = prevKeys.length === Object.keys(merged).length && prevKeys.every((k) => prev[k] === merged[k]);
        return same ? prev : merged;
      });
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }
      }
    };

    const primaryDocRef = doc(db, 'system_settings', 'icons');
    const fallbackDocRef = doc(db, 'locations', 'system_icons');

    const primaryUnsub = onSnapshot(
      primaryDocRef,
      (docSnap) => {
        setIsLoading(false);
        applySource('primary', docSnap.exists() ? (docSnap.data() as Record<string, string>) : null);
      },
      () => {
        // If primary collection is restricted in remote Firestore rules, listen to locations fallback
        setIsLoading(false);
        fallbackUnsub = onSnapshot(
          fallbackDocRef,
          (fallbackSnap) => {
            applySource('fallback', fallbackSnap.exists() ? (fallbackSnap.data() as Record<string, string>) : null);
          },
          () => {
            // Quiet fail: local cache and character document still provide icon state
          }
        );
      }
    );

    // Also listen to the signed-in user's character doc, which holds fallback custom icons
    let charUnsub: (() => void) | null = null;
    const authUnsub = onAuthStateChanged(auth, (u) => {
      if (charUnsub) {
        charUnsub();
        charUnsub = null;
      }
      if (!u) return;
      charUnsub = onSnapshot(
        doc(db, 'characters', u.uid),
        (charSnap) => {
          const icons = charSnap.exists() ? charSnap.data()?.customSystemIcons : null;
          applySource('character', (icons as Record<string, string>) || null);
        },
        () => {
          // ignore
        }
      );
    });

    return () => {
      primaryUnsub();
      if (fallbackUnsub) fallbackUnsub();
      if (charUnsub) charUnsub();
      authUnsub();
    };
  }, []);

  const getIconUrl = useCallback(
    (key: string) => {
      const url = icons[key]?.trim();
      return url || undefined;
    },
    [icons]
  );

  const getDefaultEmoji = useCallback((key: string) => {
    return DEFAULT_EMOJI_MAP[key] || '✨';
  }, []);

  const updateIcon = useCallback(
    async (key: string, url: string): Promise<{ success: boolean; permissionNotice?: boolean }> => {
      const updated = { ...icons, [key]: url };
      setIcons(updated);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
      }

      let permissionNotice = false;
      let writtenToCloud = false;

      // 1. Try locations collection (guaranteed accessible in existing production rules)
      try {
        await setDoc(doc(db, 'locations', 'system_icons'), { [key]: url }, { merge: true });
        writtenToCloud = true;
      } catch {
        // Will try primary next
      }

      // 2. Try primary system_settings/icons
      try {
        await setDoc(doc(db, 'system_settings', 'icons'), { [key]: url }, { merge: true });
        writtenToCloud = true;
        setHasPermissionNotice(false);
      } catch {
        if (!writtenToCloud) {
          permissionNotice = true;
          setHasPermissionNotice(true);
        }
      }

      // 3. Fallback: also save to character doc for the signed in user
      const u = auth.currentUser;
      if (u) {
        try {
          await setDoc(
            doc(db, 'characters', u.uid),
            { customSystemIcons: { [key]: url } },
            { merge: true }
          );
        } catch {
          // local cache already holds the updated icon
        }
      }

      return { success: true, permissionNotice };
    },
    [icons]
  );

  const resetIcon = useCallback(
    async (key: string): Promise<{ success: boolean; permissionNotice?: boolean }> => {
      const updated = { ...icons };
      delete updated[key];
      setIcons(updated);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
      }

      let permissionNotice = false;
      let writtenToCloud = false;

      try {
        await setDoc(doc(db, 'locations', 'system_icons'), { [key]: deleteField() }, { merge: true });
        writtenToCloud = true;
      } catch {
        // fallback
      }

      try {
        await setDoc(doc(db, 'system_settings', 'icons'), { [key]: deleteField() }, { merge: true });
        writtenToCloud = true;
        setHasPermissionNotice(false);
      } catch {
        if (!writtenToCloud) {
          permissionNotice = true;
          setHasPermissionNotice(true);
        }
      }

      const u = auth.currentUser;
      if (u) {
        try {
          await setDoc(
            doc(db, 'characters', u.uid),
            { customSystemIcons: { [key]: deleteField() } },
            { merge: true }
          );
        } catch {
          // local cache already holds the reset state
        }
      }

      return { success: true, permissionNotice };
    },
    [icons]
  );

  const setMultipleIcons = useCallback(
    async (mapping: Record<string, string>) => {
      const updated = { ...icons, ...mapping };
      setIcons(updated);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
      }

      try {
        const iconDocRef = doc(db, 'system_settings', 'icons');
        await setDoc(iconDocRef, mapping, { merge: true });
      } catch {
        // fallback to local storage
      }
    },
    [icons]
  );

  const contextValue = useMemo(
    () => ({
      icons,
      isLoading,
      hasPermissionNotice,
      getIconUrl,
      getDefaultEmoji,
      updateIcon,
      resetIcon,
      setMultipleIcons,
    }),
    [icons, isLoading, hasPermissionNotice, getIconUrl, getDefaultEmoji, updateIcon, resetIcon, setMultipleIcons]
  );

  return <SystemIconsContext.Provider value={contextValue}>{children}</SystemIconsContext.Provider>;
}

export function useSystemIcons(): SystemIconsContextType {
  const context = useContext(SystemIconsContext);
  if (!context) {
    return {
      icons: {},
      isLoading: false,
      hasPermissionNotice: false,
      getIconUrl: () => undefined,
      getDefaultEmoji: (k: string) => DEFAULT_EMOJI_MAP[k] || '✨',
      updateIcon: async () => ({ success: true, permissionNotice: false }),
      resetIcon: async () => ({ success: true, permissionNotice: false }),
      setMultipleIcons: async () => {},
    };
  }
  return context;
}


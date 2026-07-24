import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateSettings } from "@/backend/accounts/settings";
import { SortableListWithToggles, ToggleableItem } from "@/components/form/SortableListWithToggles";
import { Icon, Icons } from "@/components/Icon";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { usePreferencesStore } from "@/stores/preferences";

export function HomeSectionCustomizer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setHomeSectionOrder = usePreferencesStore((s) => s.setHomeSectionOrder);
  const account = useAuthStore((s) => s.account);
  const backendUrl = useBackendUrl();

  const [items, setItems] = useState<ToggleableItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const ALL_SECTIONS = [
      { id: "watching", name: t("home.continueWatching.sectionTitle") || "Continue Watching" },
      { id: "bookmarks", name: t("home.bookmarks.sectionTitle") || "Bookmarks" }
    ];

    const currentOrder = usePreferencesStore.getState().homeSectionOrder;

    const enabledItems = currentOrder.map(id => {
      const section = ALL_SECTIONS.find(s => s.id === id);
      return section ? { ...section, enabled: true } : null;
    }).filter(Boolean) as ToggleableItem[];

    const disabledItems = ALL_SECTIONS.filter(
      s => !currentOrder.includes(s.id)
    ).map(s => ({ ...s, enabled: false }));

    setItems([...enabledItems, ...disabledItems]);
  }, [isOpen, t]);

  const persistOrder = (newOrder: string[]) => {
    setHomeSectionOrder(newOrder);
    if (account && backendUrl) {
      updateSettings(backendUrl, account, { homeSectionOrder: newOrder }).catch(
        (e) => console.error("Failed to save home section order:", e),
      );
    }
  };

  const handleItemsChange = (newItems: ToggleableItem[]) => {
    setItems(newItems);
    const newOrder = newItems.filter(item => item.enabled).map(item => item.id);
    persistOrder(newOrder);
  };

  const handleToggle = (id: string) => {
    const newItems = items.map(item => 
      item.id === id ? { ...item, enabled: !item.enabled } : item
    );
    setItems(newItems);
    const newOrder = newItems.filter(item => item.enabled).map(item => item.id);
    persistOrder(newOrder);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-14 z-50 w-[20rem] rounded-xl bg-dropdown-background p-4 shadow-lg ring-1 ring-white/10">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Edit Layout</h3>
        <button type="button" onClick={onClose} className="text-type-secondary hover:text-white transition-colors">
          <Icon icon={Icons.X} />
        </button>
      </div>
      <SortableListWithToggles
        items={items}
        setItems={handleItemsChange}
        onToggle={handleToggle}
      />
    </div>
  );
}

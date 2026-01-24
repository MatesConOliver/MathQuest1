
"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

import { QuestionsPanel } from "./panels/QuestionsPanel";
import { ItemsPanel } from "./panels/ItemsPanel";
import { FoesPanel } from "./panels/FoesPanel";
import { LocationsPanel } from "./panels/LocationsPanel";
import SubAreasPanel from "./panels/SubAreasPanel"; // Import the new panel
import { EncountersPanel } from "./panels/EncountersPanel";
import { StoriesPanel } from "./panels/StoriesPanel";
import { TabButton } from "./components/TabButton";

const GM_EMAIL = "oliveru1996@gmail.com";

// Add "subareas" to the type definition for the active tab
 type ActiveTab = "questions" | "foes" | "locations" | "subareas" | "encounters" | "items" | "stories";

export default function GMPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<ActiveTab>("locations");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!user || user.email !== GM_EMAIL) return <div className="p-8 text-red-600 font-bold">Access Denied</div>;

  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto space-y-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold">🛠️ GM Dashboard</h1>
          <p className="text-sm text-gray-400">Master Control Panel</p>
        </div>

        <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl transition-colors">
          <TabButton label="Questions" active={activeTab === "questions"} onClick={() => setActiveTab("questions")} />
          <TabButton label="Stories" active={activeTab === "stories"} onClick={() => setActiveTab("stories")} />
          <TabButton label="Item Factory" active={activeTab === "items"} onClick={() => setActiveTab("items")} />
          <TabButton label="Foes" active={activeTab === "foes"} onClick={() => setActiveTab("foes")} />
          <TabButton label="Locations" active={activeTab === "locations"} onClick={() => setActiveTab("locations")} />
          {/* Add the new Sub-Areas tab button */}
          <TabButton label="Sub-Areas" active={activeTab === "subareas"} onClick={() => setActiveTab("subareas")} />
          <TabButton label="Encounters" active={activeTab === "encounters"} onClick={() => setActiveTab("encounters")} />
        </div>
      </header>

      <div className="bg-gray-50 dark:bg-gray-800/50 p-1 rounded-2xl min-h-[600px] border dark:border-gray-700">
        {activeTab === "questions" && <QuestionsPanel />}
        {activeTab === "foes" && <FoesPanel />}
        {activeTab === "locations" && <LocationsPanel />}
        {/* Render the new SubAreasPanel when the tab is active */}
        {activeTab === "subareas" && <SubAreasPanel />}
        {activeTab === "encounters" && <EncountersPanel />}
        {activeTab === "items" && <ItemsPanel />}
        {activeTab === "stories" && <StoriesPanel />}
      </div>
    </main>
  );
}


"use client";

import { useEffect, useState, ChangeEvent, MouseEvent } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  deleteField,
  query,
  orderBy,
  onSnapshot,
  where,
} from "firebase/firestore";
import { EncounterDoc, GameLocation, SubArea, FoeDoc, GameItem } from "@/types/game";
import { compareStoreItems } from "@/lib/itemSorting";
import { Input } from "@/app/gm/components/Input";
import { SPECIAL_FIGHTS_LIST } from "@/app/play/components/specialFights/registry";
import SpecialFightModal from "@/app/play/components/specialFights/SpecialFightModal";
import { Swords, Sparkles, Store, ShoppingBag, MapPin, Filter } from "lucide-react";

export function EncountersPanel() {
    const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
    const [locations, setLocations] = useState<GameLocation[]>([]);
    const [allSubAreas, setAllSubAreas] = useState<SubArea[]>([]);
    const [foes, setFoes] = useState<FoeDoc[]>([]);
    const [availableItems, setAvailableItems] = useState<GameItem[]>([]);
    const [msg, setMsg] = useState("");
    const [editingId, setEditingId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [filterLocationId, setFilterLocationId] = useState<string>("all");
    const [isTestModalOpen, setIsTestModalOpen] = useState(false);

    // Helper: Resolve encounter location ID directly or via its subArea
    const getEncounterLocationId = (enc: EncounterDoc) => {
      if (enc.locationId) return enc.locationId;
      return allSubAreas.find(sa => sa.id === enc.subAreaId)?.locationId || "";
    };

    const unassignedCount = encounters.filter(e => !getEncounterLocationId(e)).length;

    const visibleEncounters = encounters.filter(e => {
      // 1. Location dropdown filter
      if (filterLocationId !== "all") {
        const encLocId = getEncounterLocationId(e);
        if (filterLocationId === "unassigned") {
          if (encLocId) return false;
        } else {
          if (encLocId !== filterLocationId) return false;
        }
      }

      // 2. Search keyword filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        e.title.toLowerCase().includes(term) ||
        (e.id && e.id.toLowerCase().includes(term))
      );
    });
  
    // --- FORM STATE ---
    const [encounterType, setEncounterType] = useState<'battle' | 'shop'>('battle');
    const [shopItemIds, setShopItemIds] = useState<string[]>([]);
    const [shopGreeting, setShopGreeting] = useState("");

    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [questionTag, setQuestionTag] = useState("level1");
    const [foesText, setFoesText] = useState("");
    const [xp, setXp] = useState(100);
    const [gold, setGold] = useState(50);
    const [timeMult, setTimeMult] = useState(1.0);
    const [order, setOrder] = useState(0);
    const [imageUrl, setImageUrl] = useState("");
    const [emoji, setEmoji] = useState("👹");
    const [shuffle, setShuffle] = useState(false);
    const [winRewardStoryFlag, setWinRewardStoryFlag] = useState("");
    const [specialFightId, setSpecialFightId] = useState("");
    const [phase2Speed, setPhase2Speed] = useState(25);
    const [pkmActivityId, setPkmActivityId] = useState("");

    const [selectedLocationId, setSelectedLocationId] = useState("");
    const [selectedSubAreaId, setSelectedSubAreaId] = useState("");

    // SubAreas available for the form based on selected location
    const formSubAreas = selectedLocationId
      ? allSubAreas.filter(sa => sa.locationId === selectedLocationId)
      : [];

    // Skill Rewards
    const [rewardAlgebra, setRewardAlgebra] = useState(0);
    const [rewardFunctions, setRewardFunctions] = useState(0);
    const [rewardGeometry, setRewardGeometry] = useState(0);
    const [rewardStats, setRewardStats] = useState(0);
    const [rewardCalculus, setRewardCalculus] = useState(0);

    useEffect(() => {
        const unsub = onSnapshot(query(collection(db, "encounters"), orderBy("title")), (snap) => {
            setEncounters(snap.docs.map(d => ({ ...d.data(), id: d.id } as EncounterDoc)));
        });
        const unsubLocs = onSnapshot(query(collection(db, "locations"), orderBy("order")), (snap) => {
            setLocations(snap.docs.map(d => ({ ...d.data(), id: d.id } as GameLocation)));
        });
        const unsubSubAreas = onSnapshot(query(collection(db, "subAreas"), orderBy("order")), (snap) => {
            setAllSubAreas(snap.docs.map(d => ({ ...d.data(), id: d.id } as SubArea)));
        });
        const unsubFoes = onSnapshot(collection(db, "foes"), (snap) => {
            setFoes(snap.docs.map(d => ({ ...d.data(), id: d.id } as FoeDoc)));
        });
        const unsubItems = onSnapshot(collection(db, "items"), (snap) => {
            const loaded = snap.docs.map(d => ({ ...d.data(), id: d.id } as GameItem));
            loaded.sort(compareStoreItems);
            setAvailableItems(loaded);
        });
        return () => { unsub(); unsubLocs(); unsubSubAreas(); unsubFoes(); unsubItems(); };
    }, []);
  
    function resetForm() {
      setEditingId(""); setTitle(""); setDesc("");
      setEncounterType('battle');
      setShopItemIds([]);
      setShopGreeting("");
      setQuestionTag(""); setFoesText(""); 
      setXp(0); setGold(0); setTimeMult(1.0); setOrder(0);
      setSelectedLocationId(""); setSelectedSubAreaId("");
      setRewardAlgebra(0); setRewardFunctions(0); setRewardGeometry(0); setRewardStats(0); setRewardCalculus(0);
      setImageUrl(""); setEmoji("👹"); setShuffle(false);
      setWinRewardStoryFlag("");
      setSpecialFightId("");
      setPhase2Speed(25);
      setPkmActivityId("");
      setMsg("");
    }
  
    async function loadEncounterToEdit(enc: EncounterDoc) {
      if (!enc.id) return;
      setEditingId(enc.id);
      setEncounterType(enc.encounterType === 'shop' ? 'shop' : 'battle');
      setShopItemIds(enc.shopItemIds || []);
      setShopGreeting(enc.shopGreeting || "");

      setTitle(enc.title || "");
      setDesc(enc.description || "");
      setQuestionTag(enc.questionTags?.join(", ") || enc.questionTag || "level1");
      setFoesText(enc.foes?.join(", ") || enc.foeId || "");
  
      setXp(enc.winRewardXp || 0);
      setGold(enc.winRewardGold || 0);          
      setTimeMult(enc.timeMultiplier !== undefined ? enc.timeMultiplier : 1.0);
      setOrder(enc.order || 0);
      
      const subAreaLocationId = allSubAreas.find(sa => sa.id === enc.subAreaId)?.locationId;
      setSelectedLocationId(enc.locationId || subAreaLocationId || ""); 

      setTimeout(() => {
        setSelectedSubAreaId(enc.subAreaId || "");
      }, 0);

      setImageUrl(enc.imageUrl || "");
      setEmoji(enc.emoji || (enc.encounterType === 'shop' ? '🏪' : '👹'));
      setShuffle(enc.shuffleQuestions || false);
      setWinRewardStoryFlag(enc.winRewardStoryFlag || "");
      setSpecialFightId(enc.specialFightId || "");
      setPhase2Speed(enc.phase2TimeSpeedPercent !== undefined ? enc.phase2TimeSpeedPercent : 25);
      setPkmActivityId(enc.pkmActivityId || "");

      setRewardAlgebra(enc.winRewardSkills?.algebra || 0);
      setRewardFunctions(enc.winRewardSkills?.functions || 0);
      setRewardGeometry(enc.winRewardSkills?.geometry || 0);
      setRewardStats(enc.winRewardSkills?.probabilityAndStatistics || 0);
      setRewardCalculus(enc.winRewardSkills?.calculus || 0);
      
      setMsg(`✏️ Editing: ${enc.title} (${enc.encounterType === 'shop' ? 'Store' : 'Battle'})`);
    }

    async function saveEncounter() {
      if (!title || !selectedSubAreaId) { setMsg("❌ Title and a Sub-Area selection are required"); return; }
      setMsg("Saving...");
  
      const foeIds = foesText.split(",").map(s => s.trim()).filter(Boolean);
      const skillsReward = {
        algebra: Number(rewardAlgebra), functions: Number(rewardFunctions), geometry: Number(rewardGeometry),
        probabilityAndStatistics: Number(rewardStats), calculus: Number(rewardCalculus),
      };
      const finalSkillsReward = Object.fromEntries(Object.entries(skillsReward).filter(([, value]) => value > 0));
      
      const docData: EncounterDoc = {
        title, description: desc,
        order: Number(order),
        encounterType,
        ...(encounterType === 'shop' ? {
          shopItemIds,
          shopGreeting: shopGreeting || '',
        } : {
          shopItemIds: [],
          shopGreeting: '',
        }),
        questionTags: questionTag.split(",").map(s => s.trim()).filter(Boolean),
        winRewardXp: Number(xp), winRewardGold: Number(gold), timeMultiplier: Number(timeMult) || 1.0,
        winRewardSkills: finalSkillsReward,
        ...(winRewardStoryFlag && { winRewardStoryFlag }),
        subAreaId: selectedSubAreaId,
        locationId: selectedLocationId, // For backward compatibility
        foes: foeIds, foeId: foesText.split(",")[0]?.trim() || "",
        imageUrl: imageUrl || "", emoji: emoji || (encounterType === 'shop' ? "🏪" : "👹"), shuffleQuestions: shuffle,
        questionTag: questionTag, //legacy
        ...(specialFightId && { specialFightId }),
        phase2TimeSpeedPercent: Number(phase2Speed) || 25,
        ...(pkmActivityId.trim() && { pkmActivityId: pkmActivityId.trim() }),
      };
  
      try {
        const docRef = editingId ? doc(db, "encounters", editingId) : await addDoc(collection(db, "encounters"), {});
        // Firestore rejects undefined; explicitly remove fields when cleared
        const payload: any = { ...docData };
        if (!specialFightId) payload.specialFightId = deleteField();
        if (!pkmActivityId.trim()) payload.pkmActivityId = deleteField();

        await setDoc(docRef, payload, { merge: true });
        
        setMsg(editingId ? "✅ Updated Encounter!" : "✅ Created New Encounter!");
        if (!editingId) resetForm();
        else setEditingId(docRef.id);

      } catch (e: any) { setMsg("Error: " + e.message); }
    }
  
    async function deleteEnc(id: string) {
      if (!confirm("Delete this encounter forever?")) return;
      await deleteDoc(doc(db, "encounters", id));
      if(editingId === id) resetForm();
    }

    const toggleShopItem = (itemId: string) => {
      setShopItemIds(prev => 
        prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
      );
    };

    const selectAllShopItems = () => {
      setShopItemIds(availableItems.map(i => i.id));
    };

    const clearAllShopItems = () => {
      setShopItemIds([]);
    };
  
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
        {/* FORM SIDE */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{editingId ? "✏️ Edit Encounter" : "⚔️ New Encounter"}</h2>
            <button
              type="button"
              onClick={() => setIsTestModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5 text-amber-300" />
              🧪 Test Special Fights
            </button>
          </div>
          {msg && <div className="text-center bg-blue-50 dark:bg-blue-900/30 p-2 rounded text-blue-800 dark:text-blue-200 font-bold text-sm">{msg}</div>}

          {/* ENCOUNTER TYPE TOGGLE */}
          <div className="p-3 bg-gray-50 dark:bg-gray-750 rounded-xl border border-gray-200 dark:border-gray-650 space-y-2">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
              Encounter Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEncounterType('battle');
                  if (emoji === '🏪') setEmoji('👹');
                }}
                className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                  encounterType === 'battle'
                    ? 'bg-amber-500 text-gray-950 border-amber-400 shadow-md ring-2 ring-amber-400/50'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>⚔️</span> Battle Encounter
              </button>
              <button
                type="button"
                onClick={() => {
                  setEncounterType('shop');
                  if (emoji === '👹') setEmoji('🏪');
                }}
                className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
                  encounterType === 'shop'
                    ? 'bg-emerald-500 text-gray-950 border-emerald-400 shadow-md ring-2 ring-emerald-400/50'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                }`}
              >
                <span>🏪</span> Store Encounter
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {encounterType === 'battle'
                ? 'Standard math battle encounter with foes and rewards.'
                : 'Interactive merchant post allowing the GM to choose specifically which items to sell.'}
            </p>
          </div>
  
          <Input label="Title" value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} />
          <Input label="Description" value={desc} onChange={(e: ChangeEvent<HTMLInputElement>) => setDesc(e.target.value)} />
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Location</label>
              <select value={selectedLocationId} onChange={(e: ChangeEvent<HTMLSelectElement>) => {setSelectedLocationId(e.target.value); setSelectedSubAreaId("");}} className="input">
                <option value="">Select Location...</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sub-Area</label>
              <select value={selectedSubAreaId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedSubAreaId(e.target.value)} className="input" disabled={!selectedLocationId}>
                <option value="">Select Sub-Area...</option>
                {formSubAreas.map(sa => <option key={sa.id} value={sa.id}>{sa.name}</option>)}
              </select>
            </div>
          </div>

          {/* STORE ENCOUNTER SETTINGS */}
          {encounterType === 'shop' ? (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="label-sm text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-emerald-500" /> Merchant Stock & Inventory
                </h3>
                <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                  {shopItemIds.length} of {availableItems.length} items for sale
                </span>
              </div>

              <Input 
                label="Merchant Welcome Greeting" 
                value={shopGreeting} 
                onChange={(e: ChangeEvent<HTMLInputElement>) => setShopGreeting(e.target.value)} 
                placeholder="Welcome traveler! What supplies do you seek for your journey?" 
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Select Items to Sell at This Shop:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllShopItems}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                    >
                      Select All
                    </button>
                    <span className="text-gray-400">•</span>
                    <button
                      type="button"
                      onClick={clearAllShopItems}
                      className="text-[11px] text-gray-500 hover:text-red-500 font-bold"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 p-2 bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                  {availableItems.map((item) => {
                    const isSelected = shopItemIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-100/70 dark:bg-emerald-900/40 border-emerald-400 text-gray-900 dark:text-white font-medium'
                            : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleShopItem(item.id)}
                            className="w-4 h-4 text-emerald-600 rounded"
                          />
                          <span className="text-base">{(item as any).icon || (item.imageUrl ? '🖼️' : '📦')}</span>
                          <span className="text-xs truncate font-bold">{item.name}</span>
                          <span className="text-[10px] text-gray-500 uppercase px-1 rounded bg-gray-200 dark:bg-gray-700">
                            {item.type || item.slot || 'item'}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 shrink-0">
                          💰 {item.price} G
                        </span>
                      </label>
                    );
                  })}
                  {availableItems.length === 0 && (
                    <div className="text-center text-xs text-gray-400 py-3">No items found in database items collection.</div>
                  )}
                </div>
              </div>

              {/* Store Background Image */}
              <div className="space-y-2 bg-emerald-100/40 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40">
                <Input 
                  label="Store Background Image URL" 
                  value={imageUrl} 
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setImageUrl(e.target.value)} 
                  placeholder="https://... (Atmospheric shop background art)" 
                />
                {imageUrl && (
                  <div className="flex items-center gap-3 pt-1">
                    <div className="w-16 h-10 rounded-lg overflow-hidden border border-emerald-300 dark:border-emerald-700 shrink-0 bg-black/40 shadow-xs">
                      <img src={imageUrl} alt="Store Background Preview" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium truncate">
                      Store background preview active
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input type="number" label="Order" value={order} onChange={(e: ChangeEvent<HTMLInputElement>) => setOrder(Number(e.target.value))} />
                <Input label="Emoji" value={emoji} onChange={(e: ChangeEvent<HTMLInputElement>) => setEmoji(e.target.value)} placeholder="🏪" />
              </div>
            </div>
          ) : (
            /* BATTLE ENCOUNTER SETTINGS */
            <>
              <Input label="Question Tags (comma sep)" value={questionTag} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuestionTag(e.target.value)} placeholder="level1, algebra" />
              <Input label="Foe IDs (comma sep)" value={foesText} onChange={(e: ChangeEvent<HTMLInputElement>) => setFoesText(e.target.value)} placeholder="goblin, dragon" />
      
              <div className="grid grid-cols-4 gap-4 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-600">
                 <Input type="number" label="XP" value={xp} onChange={(e: ChangeEvent<HTMLInputElement>) => setXp(Number(e.target.value))} />
                 <Input type="number" label="Gold" value={gold} onChange={(e: ChangeEvent<HTMLInputElement>) => setGold(Number(e.target.value))} />
                 <Input type="number" step="0.1" min="0.1" label="Time x" value={timeMult} onChange={(e: ChangeEvent<HTMLInputElement>) => setTimeMult(Number(e.target.value))} />
                 <Input type="number" label="Order" value={order} onChange={(e: ChangeEvent<HTMLInputElement>) => setOrder(Number(e.target.value))} />
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border dark:border-gray-600">
                <h3 className="label-sm">Skill Rewards</h3>
                <div className="grid grid-cols-3 gap-2">
                    <Input type="number" label="Algebra" value={rewardAlgebra} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardAlgebra(Number(e.target.value))} />
                    <Input type="number" label="Functions" value={rewardFunctions} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardFunctions(Number(e.target.value))} />
                    <Input type="number" label="Geometry" value={rewardGeometry} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardGeometry(Number(e.target.value))} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input type="number" label="Stats/Prob" value={rewardStats} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardStats(Number(e.target.value))} />
                    <Input type="number" label="Calculus" value={rewardCalculus} onChange={(e: ChangeEvent<HTMLInputElement>) => setRewardCalculus(Number(e.target.value))} />
                </div>
              </div>

              <Input label="Win Reward Story Flag" value={winRewardStoryFlag} onChange={(e: ChangeEvent<HTMLInputElement>) => setWinRewardStoryFlag(e.target.value)} placeholder="e.g., DEFEATED_GOBLIN_KING" />

              {/* POKEMÁTICOS (PKM) ACHIEVEMENT REWARD SECTION */}
              <div className="bg-purple-50 dark:bg-purple-950/40 p-4 rounded-xl border border-purple-200 dark:border-purple-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="label-sm text-purple-800 dark:text-purple-300 font-bold flex items-center gap-1.5">
                    <span>🏆</span> Pokemáticos (PKM) Reward Activity
                  </h3>
                  {pkmActivityId.trim() && (
                    <span className="text-[10px] bg-purple-200 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 font-mono px-2 py-0.5 rounded font-bold">
                      Code Key: {pkmActivityId.trim().slice(0, 6)}
                    </span>
                  )}
                </div>
                <Input 
                  label="Activity Identifier (e.g. library_guardian, algebra_trial_01)" 
                  value={pkmActivityId} 
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPkmActivityId(e.target.value)} 
                  placeholder="e.g. library_guardian, algebra_trial_01" 
                />
                <p className="text-[11px] text-purple-700/90 dark:text-purple-300/80">
                  When a student defeats this encounter, MathQuest will generate their deterministic 28-character Pokemáticos reward code (Source ID: <code className="font-mono bg-purple-100 dark:bg-purple-900 px-1 py-0.2 rounded font-bold">DP4DP</code>) if they have entered their Pokemáticos Public ID in settings.
                </p>
              </div>
      
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border dark:border-gray-600 space-y-3">
                  <h3 className="label-sm">Visuals & Logic</h3>
                  <Input label="Image URL" value={imageUrl} onChange={(e: ChangeEvent<HTMLInputElement>) => setImageUrl(e.target.value)} placeholder="https://..." />
                  <div className="flex gap-4 items-end">
                    <Input label="Emoji" value={emoji} onChange={(e: ChangeEvent<HTMLInputElement>) => setEmoji(e.target.value)} placeholder="👹" />
                    <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-gray-600 dark:border-gray-500 border px-3 py-3 rounded-lg h-[42px] mb-[2px]">
                      <input type="checkbox" checked={shuffle} onChange={(e: ChangeEvent<HTMLInputElement>) => setShuffle(e.target.checked)} className="w-4 h-4" />
                      <span className="text-sm font-bold">Shuffle Qs?</span>
                    </label>
                  </div>
              </div>

              {/* SPECIAL FIGHT PHASE SHIFT SECTION */}
              <div className="bg-indigo-50 dark:bg-indigo-950/40 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="label-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Special Fight Mechanic (50% HP Phase Shift)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsTestModalOpen(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                  >
                    🧪 Test Lab
                  </button>
                </div>

                <div>
                  <label className="label text-xs font-bold text-gray-700 dark:text-gray-300">Choose Special Fight</label>
                  <select
                    value={specialFightId}
                    onChange={(e) => setSpecialFightId(e.target.value)}
                    className="input text-sm"
                  >
                    <option value="">-- None (Standard Battle Only) --</option>
                    {SPECIAL_FIGHTS_LIST.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.locationName.split(':')[0]})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Triggers the first time the foe drops below 50% HP (or 0% from a 1-hit KO).
                  </p>
                </div>

                {specialFightId && (
                  <div className="pt-2 border-t border-indigo-200 dark:border-indigo-800/40 grid grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="label text-xs font-bold text-gray-700 dark:text-gray-300">Phase 2 Speed +%</label>
                      <Input
                        type="number"
                        min="10"
                        max="100"
                        value={phase2Speed}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPhase2Speed(Number(e.target.value))}
                        placeholder="25"
                      />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      After passing, the foe recovers 100% HP and question timers tick <strong className="text-indigo-600 dark:text-indigo-300">+{phase2Speed}% faster</strong>.
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
  
          <div className="flex gap-2 pt-2">
              <button onClick={saveEncounter} className="btn-primary flex-1 py-2 rounded-lg font-bold">
                  {editingId ? "Update Encounter" : (encounterType === 'shop' ? "Create Store Encounter" : "Create Encounter")}
              </button>
              {editingId && (
                  <button onClick={resetForm} className="btn-secondary">
                      Cancel
                  </button>
              )}
          </div>
        </div>
  
        <div className="space-y-3.5 border-l dark:border-gray-700 pl-4">
          {/* LOCATION FILTER DROPDOWN */}
          <div className="space-y-1.5 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                <span>Filter Encounters by Location:</span>
              </label>
              {filterLocationId !== "all" && (
                <button
                  type="button"
                  onClick={() => setFilterLocationId("all")}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
                >
                  Show All ({encounters.length})
                </button>
              )}
            </div>

            <select
              value={filterLocationId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterLocationId(e.target.value)}
              className="input w-full text-xs font-semibold bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            >
              <option value="all">🗺️ All Locations ({encounters.length})</option>
              {locations.map((loc) => {
                const count = encounters.filter(
                  (e) => getEncounterLocationId(e) === loc.id
                ).length;
                return (
                  <option key={loc.id} value={loc.id}>
                    📍 {loc.name} ({count})
                  </option>
                );
              })}
              {unassignedCount > 0 && (
                <option value="unassigned">⚠️ Unassigned / Legacy ({unassignedCount})</option>
              )}
            </select>
          </div>

          {/* SEARCH INPUT */}
          <Input 
              className="w-full text-sm" 
              placeholder="🔍 Search encounters by title/ID..." 
              value={searchTerm} 
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)} 
          />

          {/* LIST HEADER WITH COUNTER */}
          <div className="flex items-center justify-between pt-1">
            <h3 className="label-sm flex items-center gap-1.5">
              <span>Existing Encounters</span>
              <span className="text-xs font-mono text-gray-400 font-normal">
                ({visibleEncounters.length}{filterLocationId !== 'all' || searchTerm ? ` of ${encounters.length}` : ''})
              </span>
            </h3>
            {filterLocationId !== 'all' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 truncate max-w-[140px]">
                {filterLocationId === 'unassigned' ? 'Unassigned' : locations.find((l) => l.id === filterLocationId)?.name || 'Filtered'}
              </span>
            )}
          </div>

          {/* ENCOUNTERS LIST */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-2 custom-scrollbar">
              {visibleEncounters.length > 0 ? (
                visibleEncounters.map(enc => {
                  const subArea = allSubAreas.find(sa => sa.id === enc.subAreaId);
                  const location = locations.find(l => l.id === (enc.locationId || subArea?.locationId));
                  return (
                      <div 
                          key={enc.id} 
                          onClick={() => loadEncounterToEdit(enc)} 
                          className={`p-3 border rounded-lg flex justify-between items-center cursor-pointer transition-colors 
                              ${editingId === enc.id 
                                  ? 'border-green-500 bg-green-50 ring-1 ring-green-500 dark:bg-green-900/30 dark:border-green-400' 
                                  : 'dark:border-gray-600 hover:bg-gray-700/50'}`}
                      >
                          <div className="min-w-0">
                              <div className="font-bold text-sm flex items-center gap-2 dark:text-gray-100 flex-wrap">
                                <span>{enc.emoji || (enc.encounterType === 'shop' ? "🏪" : "👹")}</span>
                                <span className="truncate">{enc.title}</span>
                                {enc.encounterType === 'shop' && (
                                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.2 rounded font-bold shrink-0">
                                    🏪 Store ({enc.shopItemIds?.length || 0} items)
                                  </span>
                                )}
                                {enc.pkmActivityId && (
                                  <span className="text-[10px] bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-400/40 px-1.5 py-0.2 rounded font-bold shrink-0">
                                    🏆 PKM
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400 font-mono">
                                {location?.name || "No Location"} &gt; {subArea?.name || `(${enc.subAreaId || 'Legacy'})`}
                              </div>
                          </div>
                          <button onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); if (enc.id) deleteEnc(enc.id); }} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs font-bold px-2 ml-2">
                              DEL
                          </button>
                      </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-gray-400 italic bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-200 dark:border-gray-700">
                  {filterLocationId !== 'all' 
                    ? `No encounters found in ${locations.find(l => l.id === filterLocationId)?.name || 'this location'}.` 
                    : 'No encounters found matching your filter.'}
                </div>
              )}
          </div>
        </div>

        {/* SPECIAL FIGHT GM TEST MODAL */}
        <SpecialFightModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          initialFightId={specialFightId || 'loc2_vieta_scales'}
          foes={foes}
        />
      </div>
    );
  }


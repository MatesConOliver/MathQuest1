"use client";

import { useEffect, useState, useMemo, ChangeEvent, MouseEvent } from "react";
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
} from "firebase/firestore";
import {
  EncounterDoc,
  EncounterWave,
  GameLocation,
  SubArea,
  FoeDoc,
  GameItem,
} from "@/types/game";
import { compareStoreItems } from "@/lib/itemSorting";
import {
  getEncounterWaveConfigs,
  resolveEncounterDisplay,
  sanitizeFoeId,
  generateUniqueFoeId,
} from "@/lib/encounterDisplay";
import { Input } from "@/app/gm/components/Input";
import { AssetPickerModal } from "@/app/gm/components/AssetPickerModal";
import { SPECIAL_FIGHTS_LIST } from "@/app/play/components/specialFights/registry";
import SpecialFightModal from "@/app/play/components/specialFights/SpecialFightModal";
import {
  Swords,
  Sparkles,
  Store,
  MapPin,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Image as ImageIcon,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";

interface WaveDraft {
  localKey: string;
  foeId: string;
  originalFoeId: string;
  isNewFoe: boolean;
  idManuallyEdited: boolean;
  name: string;
  description: string;
  emoji: string;
  maxHp: number | "";
  attackDamage: number | "";
  imageUrl: string;
  questionTagsText: string;
  expanded: boolean;
  showIdField: boolean;
}

function createEmptyWaveDraft(index: number, expanded = true): WaveDraft {
  return {
    localKey: `wave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${index}`,
    foeId: "",
    originalFoeId: "",
    isNewFoe: true,
    idManuallyEdited: false,
    name: "",
    description: "",
    emoji: "👾",
    maxHp: 30,
    attackDamage: 5,
    imageUrl: "",
    questionTagsText: "",
    expanded,
    showIdField: false,
  };
}

function waveDraftFromFoe(
  foe: FoeDoc | undefined,
  fallbackId: string,
  questionTags?: string[],
  expanded = false
): WaveDraft {
  return {
    localKey: `wave-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    foeId: foe?.id || fallbackId,
    originalFoeId: foe?.id || fallbackId,
    isNewFoe: !foe,
    idManuallyEdited: Boolean(foe?.id || fallbackId),
    name: foe?.name || (fallbackId ? fallbackId : ""),
    description: foe?.description || "",
    emoji: foe?.emoji || "👾",
    maxHp: foe?.maxHp ?? 20,
    attackDamage: foe?.attackDamage ?? 5,
    imageUrl: foe?.imageUrl || "",
    questionTagsText: questionTags?.join(", ") || "",
    expanded,
    showIdField: false,
  };
}

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

  // Right-side browser mode: Encounters list OR Foe Library management
  const [browserMode, setBrowserMode] = useState<"encounters" | "foes">("encounters");
  const [foeLibrarySearch, setFoeLibrarySearch] = useState("");
  const [standaloneFoeEditingId, setStandaloneFoeEditingId] = useState("");
  const [standaloneFoeDraft, setStandaloneFoeDraft] = useState<WaveDraft | null>(null);

  // Asset Picker modal target (either encounter override image, wave index, or standalone foe)
  const [assetPickerTarget, setAssetPickerTarget] = useState<
    | { type: "encounter" }
    | { type: "wave"; localKey: string }
    | { type: "standaloneFoe" }
    | null
  >(null);

  // --- ENCOUNTER FORM STATE ---
  const [encounterType, setEncounterType] = useState<"battle" | "shop">("battle");
  const [shopItemIds, setShopItemIds] = useState<string[]>([]);
  const [shopGreeting, setShopGreeting] = useState("");

  // Display fields (required for shops; optional overrides for battles)
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [emoji, setEmoji] = useState("");

  const [questionTag, setQuestionTag] = useState("level1");
  const [waveDrafts, setWaveDrafts] = useState<WaveDraft[]>([
    createEmptyWaveDraft(0, true),
  ]);
  const [pickingWaveKey, setPickingWaveKey] = useState<string | null>(null);
  const [wavePickerSearch, setWavePickerSearch] = useState("");

  const [xp, setXp] = useState(100);
  const [gold, setGold] = useState(50);
  const [timeMult, setTimeMult] = useState(1.0);
  const [order, setOrder] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [winRewardStoryFlag, setWinRewardStoryFlag] = useState("");
  const [specialFightId, setSpecialFightId] = useState("");
  const [phase2Speed, setPhase2Speed] = useState(25);
  const [pkmActivityId, setPkmActivityId] = useState("");
  const [showOverrides, setShowOverrides] = useState(false);

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedSubAreaId, setSelectedSubAreaId] = useState("");

  // Skill Rewards
  const [rewardAlgebra, setRewardAlgebra] = useState(0);
  const [rewardFunctions, setRewardFunctions] = useState(0);
  const [rewardGeometry, setRewardGeometry] = useState(0);
  const [rewardStats, setRewardStats] = useState(0);
  const [rewardCalculus, setRewardCalculus] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "encounters"), orderBy("title")), (snap) => {
      setEncounters(snap.docs.map((d) => ({ ...d.data(), id: d.id } as EncounterDoc)));
    });
    const unsubLocs = onSnapshot(query(collection(db, "locations"), orderBy("order")), (snap) => {
      setLocations(snap.docs.map((d) => ({ ...d.data(), id: d.id } as GameLocation)));
    });
    const unsubSubAreas = onSnapshot(query(collection(db, "subAreas"), orderBy("order")), (snap) => {
      setAllSubAreas(snap.docs.map((d) => ({ ...d.data(), id: d.id } as SubArea)));
    });
    const unsubFoes = onSnapshot(collection(db, "foes"), (snap) => {
      setFoes(snap.docs.map((d) => ({ ...d.data(), id: d.id } as FoeDoc)));
    });
    const unsubItems = onSnapshot(collection(db, "items"), (snap) => {
      const loaded = snap.docs.map((d) => ({ ...d.data(), id: d.id } as GameItem));
      loaded.sort(compareStoreItems);
      setAvailableItems(loaded);
    });
    return () => {
      unsub();
      unsubLocs();
      unsubSubAreas();
      unsubFoes();
      unsubItems();
    };
  }, []);

  const foesById = useMemo(() => {
    const map: Record<string, FoeDoc> = {};
    for (const f of foes) {
      if (f.id) map[f.id] = f;
    }
    return map;
  }, [foes]);

  const allExistingFoeIds = useMemo(() => {
    return new Set(foes.map((f) => f.id).filter(Boolean) as string[]);
  }, [foes]);

  // Map foeId -> list of encounters that reference it
  const foeUsageMap = useMemo(() => {
    const usage: Record<string, EncounterDoc[]> = {};
    for (const enc of encounters) {
      const waveConfigs = getEncounterWaveConfigs(enc);
      const uniqueIds = new Set(waveConfigs.map((w) => w.foeId));
      uniqueIds.forEach((fId) => {
        if (!usage[fId]) usage[fId] = [];
        usage[fId].push(enc);
      });
    }
    return usage;
  }, [encounters]);

  const getEncounterLocationId = (enc: EncounterDoc) => {
    if (enc.locationId) return enc.locationId;
    return allSubAreas.find((sa) => sa.id === enc.subAreaId)?.locationId || "";
  };

  const unassignedCount = encounters.filter((e) => !getEncounterLocationId(e)).length;

  const visibleEncounters = useMemo(() => {
    return encounters.filter((e) => {
      if (filterLocationId !== "all") {
        const encLocId = getEncounterLocationId(e);
        if (filterLocationId === "unassigned") {
          if (encLocId) return false;
        } else if (encLocId !== filterLocationId) {
          return false;
        }
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const waveConfigs = getEncounterWaveConfigs(e);
      const primaryFoe = waveConfigs[0] ? foesById[waveConfigs[0].foeId] : undefined;
      const resolved = resolveEncounterDisplay(e, primaryFoe);
      const matchesWaveFoe = waveConfigs.some((w) => {
        const wf = foesById[w.foeId];
        return (
          w.foeId.toLowerCase().includes(term) ||
          (wf?.name && wf.name.toLowerCase().includes(term))
        );
      });

      return (
        resolved.title.toLowerCase().includes(term) ||
        (e.title && e.title.toLowerCase().includes(term)) ||
        (e.id && e.id.toLowerCase().includes(term)) ||
        matchesWaveFoe
      );
    });
  }, [encounters, filterLocationId, searchTerm, foesById, allSubAreas]);

  const visibleLibraryFoes = useMemo(() => {
    const term = foeLibrarySearch.trim().toLowerCase();
    return foes
      .filter((f) => {
        if (!term) return true;
        return (
          f.name.toLowerCase().includes(term) ||
          (f.id && f.id.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [foes, foeLibrarySearch]);

  const formSubAreas = selectedLocationId
    ? allSubAreas.filter((sa) => sa.locationId === selectedLocationId)
    : [];

  const primaryWave = waveDrafts[0];
  const primaryWaveDefaults = {
    title: primaryWave?.name?.trim() || "Wave 1 Foe",
    description: primaryWave?.description?.trim() || "Inherits Wave 1 foe description",
    imageUrl: primaryWave?.imageUrl?.trim() || "",
    emoji: primaryWave?.emoji?.trim() || "👹",
  };

  function resetForm() {
    setEditingId("");
    setTitle("");
    setDesc("");
    setEncounterType("battle");
    setShopItemIds([]);
    setShopGreeting("");
    setQuestionTag("level1");
    setWaveDrafts([createEmptyWaveDraft(0, true)]);
    setPickingWaveKey(null);
    setXp(100);
    setGold(50);
    setTimeMult(1.0);
    setOrder(0);
    setSelectedLocationId("");
    setSelectedSubAreaId("");
    setRewardAlgebra(0);
    setRewardFunctions(0);
    setRewardGeometry(0);
    setRewardStats(0);
    setRewardCalculus(0);
    setImageUrl("");
    setEmoji("");
    setShuffle(false);
    setWinRewardStoryFlag("");
    setSpecialFightId("");
    setPhase2Speed(25);
    setPkmActivityId("");
    setShowOverrides(false);
    setMsg("");
  }

  function loadEncounterToEdit(enc: EncounterDoc) {
    if (!enc.id) return;
    setEditingId(enc.id);
    const type = enc.encounterType === "shop" ? "shop" : "battle";
    setEncounterType(type);
    setShopItemIds(enc.shopItemIds || []);
    setShopGreeting(enc.shopGreeting || "");

    setTitle(enc.title || "");
    setDesc(enc.description || "");
    setImageUrl(enc.imageUrl || "");
    setEmoji(enc.emoji || "");
    setShowOverrides(
      Boolean(enc.title?.trim() || enc.description?.trim() || enc.imageUrl?.trim() || enc.emoji?.trim())
    );

    setQuestionTag(enc.questionTags?.join(", ") || enc.questionTag || "level1");

    const waveConfigs = getEncounterWaveConfigs(enc);
    if (waveConfigs.length > 0) {
      setWaveDrafts(
        waveConfigs.map((w, idx) =>
          waveDraftFromFoe(foesById[w.foeId], w.foeId, w.questionTags, idx === 0)
        )
      );
    } else {
      setWaveDrafts([createEmptyWaveDraft(0, true)]);
    }
    setPickingWaveKey(null);

    setXp(enc.winRewardXp || 0);
    setGold(enc.winRewardGold || 0);
    setTimeMult(enc.timeMultiplier !== undefined ? enc.timeMultiplier : 1.0);
    setOrder(enc.order || 0);

    const subAreaLocationId = allSubAreas.find((sa) => sa.id === enc.subAreaId)?.locationId;
    setSelectedLocationId(enc.locationId || subAreaLocationId || "");

    setTimeout(() => {
      setSelectedSubAreaId(enc.subAreaId || "");
    }, 0);

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

    const primaryFoe = waveConfigs[0] ? foesById[waveConfigs[0].foeId] : undefined;
    const resolved = resolveEncounterDisplay(enc, primaryFoe);
    setMsg(`Editing: ${resolved.title} (${type === "shop" ? "Store" : `${waveConfigs.length || 1} wave${waveConfigs.length > 1 ? "s" : ""}`})`);
  }

  // --- WAVE BUILDER HANDLERS ---
  function updateWave(localKey: string, patch: Partial<WaveDraft>) {
    setWaveDrafts((prev) =>
      prev.map((w) => (w.localKey === localKey ? { ...w, ...patch } : w))
    );
  }

  function handleWaveNameChange(localKey: string, newName: string) {
    setWaveDrafts((prev) => {
      const taken = new Set(allExistingFoeIds);
      prev.forEach((item) => {
        if (item.localKey !== localKey && item.foeId) taken.add(item.foeId);
      });
      return prev.map((w) => {
        if (w.localKey !== localKey) return w;
        const nextAutoId =
          w.isNewFoe && !w.idManuallyEdited
            ? newName.trim()
              ? generateUniqueFoeId(newName, taken, w.originalFoeId || undefined)
              : ""
            : w.foeId;
        return { ...w, name: newName, foeId: nextAutoId };
      });
    });
  }

  function addNewWave(asExistingPicker = false) {
    const draft = createEmptyWaveDraft(waveDrafts.length, true);
    setWaveDrafts((prev) => [...prev.map((w) => ({ ...w, expanded: false })), draft]);
    if (asExistingPicker) {
      setPickingWaveKey(draft.localKey);
      setWavePickerSearch("");
    }
  }

  function assignExistingFoeToWave(localKey: string, existingFoe: FoeDoc) {
    updateWave(localKey, {
      foeId: existingFoe.id || "",
      originalFoeId: existingFoe.id || "",
      isNewFoe: false,
      idManuallyEdited: true,
      name: existingFoe.name,
      description: existingFoe.description || "",
      emoji: existingFoe.emoji || "👾",
      maxHp: existingFoe.maxHp ?? 20,
      attackDamage: existingFoe.attackDamage ?? 5,
      imageUrl: existingFoe.imageUrl || "",
      expanded: true,
    });
    setPickingWaveKey(null);
  }

  function duplicateWaveAsNewFoe(localKey: string) {
    const wave = waveDrafts.find((w) => w.localKey === localKey);
    if (!wave) return;
    const taken = new Set(allExistingFoeIds);
    waveDrafts.forEach((item) => {
      if (item.localKey !== localKey && item.foeId) taken.add(item.foeId);
    });
    const newName = wave.name.endsWith("(Variant)") ? wave.name : `${wave.name} Variant`;
    const newId = generateUniqueFoeId(newName, taken);
    updateWave(localKey, {
      foeId: newId,
      originalFoeId: "",
      isNewFoe: true,
      idManuallyEdited: false,
      name: newName,
      showIdField: true,
    });
  }

  function moveWave(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= waveDrafts.length) return;
    setWaveDrafts((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function removeWave(localKey: string) {
    if (waveDrafts.length <= 1) return;
    setWaveDrafts((prev) => prev.filter((w) => w.localKey !== localKey));
    if (pickingWaveKey === localKey) setPickingWaveKey(null);
  }

  // --- SAVE ENCOUNTER + INLINE FOES ---
  async function saveEncounter() {
    if (!selectedSubAreaId) {
      setMsg("Select a Location and Sub-Area first.");
      return;
    }

    if (encounterType === "shop" && !title.trim()) {
      setMsg("Store title is required.");
      return;
    }

    if (encounterType === "battle") {
      if (waveDrafts.length === 0) {
        setMsg("Add at least 1 foe wave for a battle encounter.");
        return;
      }
      const missingNameIdx = waveDrafts.findIndex((w) => !w.name.trim());
      if (missingNameIdx !== -1) {
        setMsg(`Wave ${missingNameIdx + 1} needs a foe name.`);
        return;
      }
    }

    setMsg("Saving...");

    try {
      const wavesPayload: EncounterWave[] = [];
      const takenIds = new Set(allExistingFoeIds);

      if (encounterType === "battle") {
        for (let i = 0; i < waveDrafts.length; i++) {
          const w = waveDrafts[i];
          const cleanedId = sanitizeFoeId(w.foeId);
          const targetFoeId =
            cleanedId ||
            generateUniqueFoeId(w.name, takenIds, w.originalFoeId || undefined);
          takenIds.add(targetFoeId);

          const foeDocPayload: Partial<FoeDoc> = {
            name: w.name.trim(),
            description: w.description.trim(),
            emoji: w.emoji.trim() || "👾",
            maxHp: Math.max(1, Number(w.maxHp) || 20),
            attackDamage: Math.max(0, Number(w.attackDamage) || 0),
            imageUrl: w.imageUrl.trim(),
          };

          await setDoc(doc(db, "foes", targetFoeId), foeDocPayload, { merge: true });

          // Clean up renamed old foe doc ONLY if no other encounter still references it
          if (w.originalFoeId && w.originalFoeId !== targetFoeId) {
            const otherRefs = (foeUsageMap[w.originalFoeId] || []).filter(
              (e) => e.id !== editingId
            );
            if (otherRefs.length === 0) {
              await deleteDoc(doc(db, "foes", w.originalFoeId));
            }
          }

          const waveTags = w.questionTagsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          wavesPayload.push({
            foeId: targetFoeId,
            ...(waveTags.length > 0 ? { questionTags: waveTags } : {}),
          });

          // Sync draft state with resolved saved ID
          updateWave(w.localKey, {
            foeId: targetFoeId,
            originalFoeId: targetFoeId,
            isNewFoe: false,
          });
        }
      }

      const foeIds = wavesPayload.map((w) => w.foeId);
      const skillsReward = {
        algebra: Number(rewardAlgebra),
        functions: Number(rewardFunctions),
        geometry: Number(rewardGeometry),
        probabilityAndStatistics: Number(rewardStats),
        calculus: Number(rewardCalculus),
      };
      const finalSkillsReward = Object.fromEntries(
        Object.entries(skillsReward).filter(([, value]) => value > 0)
      );

      const parsedDefaultTags = questionTag
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const docData: EncounterDoc = {
        title: title.trim(),
        description: desc.trim(),
        order: Number(order),
        encounterType,
        ...(encounterType === "shop"
          ? {
              shopItemIds,
              shopGreeting: shopGreeting || "",
            }
          : {
              shopItemIds: [],
              shopGreeting: "",
            }),
        questionTags: parsedDefaultTags,
        winRewardXp: Number(xp),
        winRewardGold: Number(gold),
        timeMultiplier: Number(timeMult) || 1.0,
        winRewardSkills: finalSkillsReward,
        ...(winRewardStoryFlag.trim() && { winRewardStoryFlag: winRewardStoryFlag.trim() }),
        subAreaId: selectedSubAreaId,
        locationId: selectedLocationId,
        waves: encounterType === "battle" ? wavesPayload : [],
        foes: encounterType === "battle" ? foeIds : [],
        foeId: encounterType === "battle" ? foeIds[0] || "" : "",
        imageUrl: imageUrl.trim(),
        emoji: emoji.trim(),
        shuffleQuestions: shuffle,
        questionTag: questionTag,
        ...(specialFightId && { specialFightId }),
        phase2TimeSpeedPercent: Number(phase2Speed) || 25,
        ...(pkmActivityId.trim() && { pkmActivityId: pkmActivityId.trim() }),
      };

      const docRef = editingId
        ? doc(db, "encounters", editingId)
        : await addDoc(collection(db, "encounters"), {});

      const payload: Record<string, unknown> = { ...docData };
      if (!specialFightId) payload.specialFightId = deleteField();
      if (!pkmActivityId.trim()) payload.pkmActivityId = deleteField();
      if (!winRewardStoryFlag.trim()) payload.winRewardStoryFlag = deleteField();

      await setDoc(docRef, payload, { merge: true });

      setMsg(
        editingId
          ? "Updated encounter and synced foe data."
          : "Created new encounter and synced foe data."
      );
      if (!editingId) resetForm();
      else setEditingId(docRef.id);
    } catch (e: any) {
      setMsg("Error: " + e.message);
    }
  }

  async function deleteEnc(id: string) {
    if (!confirm("Delete this encounter forever?")) return;
    await deleteDoc(doc(db, "encounters", id));
    if (editingId === id) resetForm();
  }

  // --- STANDALONE FOE LIBRARY EDITOR ---
  function openStandaloneFoeEditor(f: FoeDoc) {
    setStandaloneFoeEditingId(f.id || "");
    setStandaloneFoeDraft(waveDraftFromFoe(f, f.id || "", undefined, true));
  }

  async function saveStandaloneFoe() {
    if (!standaloneFoeDraft || !standaloneFoeDraft.name.trim()) {
      setMsg("Foe name is required.");
      return;
    }
    const targetId =
      sanitizeFoeId(standaloneFoeDraft.foeId) ||
      generateUniqueFoeId(
        standaloneFoeDraft.name,
        allExistingFoeIds,
        standaloneFoeDraft.originalFoeId || undefined
      );

    try {
      await setDoc(
        doc(db, "foes", targetId),
        {
          name: standaloneFoeDraft.name.trim(),
          description: standaloneFoeDraft.description.trim(),
          emoji: standaloneFoeDraft.emoji.trim() || "👾",
          maxHp: Math.max(1, Number(standaloneFoeDraft.maxHp) || 20),
          attackDamage: Math.max(0, Number(standaloneFoeDraft.attackDamage) || 0),
          imageUrl: standaloneFoeDraft.imageUrl.trim(),
        },
        { merge: true }
      );

      if (
        standaloneFoeDraft.originalFoeId &&
        standaloneFoeDraft.originalFoeId !== targetId
      ) {
        const refs = foeUsageMap[standaloneFoeDraft.originalFoeId] || [];
        if (refs.length === 0) {
          await deleteDoc(doc(db, "foes", standaloneFoeDraft.originalFoeId));
        }
      }

      setStandaloneFoeDraft(null);
      setStandaloneFoeEditingId("");
      setMsg(`Saved foe '${targetId}'.`);
    } catch (e: any) {
      setMsg("Error saving foe: " + e.message);
    }
  }

  async function deleteStandaloneFoe(f: FoeDoc) {
    if (!f.id) return;
    const refs = foeUsageMap[f.id] || [];
    const warning =
      refs.length > 0
        ? `Foe '${f.name}' (${f.id}) is still used by ${refs.length} encounter(s). Delete anyway?`
        : `Delete unused foe '${f.name}' (${f.id})?`;
    if (!confirm(warning)) return;
    await deleteDoc(doc(db, "foes", f.id));
    if (standaloneFoeEditingId === f.id) {
      setStandaloneFoeEditingId("");
      setStandaloneFoeDraft(null);
    }
  }

  const toggleShopItem = (itemId: string) => {
    setShopItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const selectAllShopItems = () => setShopItemIds(availableItems.map((i) => i.id));
  const clearAllShopItems = () => setShopItemIds([]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors">
      {/* LEFT COLUMN: UNIFIED ENCOUNTER & WAVE BUILDER */}
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">
              {editingId ? "Edit Encounter" : "New Encounter"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                + New Encounter
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsTestModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Swords className="w-3.5 h-3.5 text-amber-300" />
            <span>Test Special Fights</span>
          </button>
        </div>

        {msg && (
          <div className="bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-semibold text-xs text-center">
            {msg}
          </div>
        )}

        {/* ENCOUNTER TYPE TOGGLE */}
        <div className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
            Encounter Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setEncounterType("battle");
                if (emoji === "🏪") setEmoji("");
              }}
              className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border transition-all whitespace-nowrap ${
                encounterType === "battle"
                  ? "bg-amber-500 text-gray-950 border-amber-400 shadow-sm"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Battle Encounter</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEncounterType("shop");
                if (!emoji) setEmoji("🏪");
              }}
              className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border transition-all whitespace-nowrap ${
                encounterType === "shop"
                  ? "bg-emerald-500 text-gray-950 border-emerald-400 shadow-sm"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Store Encounter</span>
            </button>
          </div>
        </div>

        {/* LOCATION & SUB-AREA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Location</label>
            <select
              value={selectedLocationId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                setSelectedLocationId(e.target.value);
                setSelectedSubAreaId("");
              }}
              className="input"
            >
              <option value="">Select Location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sub-Area</label>
            <select
              value={selectedSubAreaId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setSelectedSubAreaId(e.target.value)
              }
              className="input"
              disabled={!selectedLocationId}
            >
              <option value="">Select Sub-Area...</option>
              {formSubAreas.map((sa) => (
                <option key={sa.id} value={sa.id}>
                  {sa.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* STORE ENCOUNTER SETTINGS */}
        {encounterType === "shop" ? (
          <div className="space-y-4">
            <Input
              label="Store Title"
              value={title}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="e.g. Arcane Outfitter"
            />
            <Input
              label="Description"
              value={desc}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setDesc(e.target.value)}
            />

            <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="label-sm text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-emerald-500" /> Merchant Stock & Inventory
                </h3>
                <span className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-bold">
                  {shopItemIds.length} of {availableItems.length} items
                </span>
              </div>

              <Input
                label="Merchant Welcome Greeting"
                value={shopGreeting}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setShopGreeting(e.target.value)
                }
                placeholder="Welcome traveler! What supplies do you seek?"
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Select Items to Sell:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllShopItems}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                    >
                      Select All
                    </button>
                    <span className="text-gray-400">·</span>
                    <button
                      type="button"
                      onClick={clearAllShopItems}
                      className="text-[11px] text-gray-500 hover:text-red-500 font-bold"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1 p-2 bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                  {availableItems.map((item) => {
                    const isSelected = shopItemIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-emerald-100/70 dark:bg-emerald-900/40 border-emerald-400 text-gray-900 dark:text-white font-medium"
                            : "bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleShopItem(item.id)}
                            className="w-4 h-4 text-emerald-600 rounded"
                          />
                          <span className="text-base">
                            {(item as any).icon || (item.imageUrl ? "🖼️" : "📦")}
                          </span>
                          <span className="text-xs truncate font-bold">{item.name}</span>
                          <span className="text-[11px] text-gray-500">
                            · {item.type || item.slot || "item"}
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400 shrink-0">
                          {item.price} G
                        </span>
                      </label>
                    );
                  })}
                  {availableItems.length === 0 && (
                    <div className="text-center text-xs text-gray-400 py-3">
                      No items found in database.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Store Background Image URL
                  </label>
                  <button
                    type="button"
                    onClick={() => setAssetPickerTarget({ type: "encounter" })}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Pick Asset
                  </button>
                </div>
                <Input
                  value={imageUrl}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setImageUrl(e.target.value)
                  }
                  placeholder="https://... or /Assets/..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="Order"
                  value={order}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setOrder(Number(e.target.value))
                  }
                />
                <Input
                  label="Emoji"
                  value={emoji}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmoji(e.target.value)}
                  placeholder="🏪"
                />
              </div>
            </div>
          </div>
        ) : (
          /* BATTLE ENCOUNTER SETTINGS + UNIFIED WAVES */
          <div className="space-y-4">
            {/* DEFAULT QUESTION TAGS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <Input
                  label="Default Question Tags (comma sep)"
                  value={questionTag}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setQuestionTag(e.target.value)
                  }
                  placeholder="level1, algebra"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-3 py-2.5 rounded-lg h-[42px]">
                <input
                  type="checkbox"
                  checked={shuffle}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setShuffle(e.target.checked)
                  }
                  className="w-4 h-4"
                />
                <span className="text-xs font-bold whitespace-nowrap">Shuffle Qs</span>
              </label>
            </div>

            {/* WAVES & FOES BUILDER */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Foes & Battle Waves ({waveDrafts.length})
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Sequential waves in one battle. Questions never repeat across waves.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addNewWave(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold flex items-center gap-1 hover:opacity-90 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Wave
                  </button>
                  <button
                    type="button"
                    onClick={() => addNewWave(true)}
                    className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-bold flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-700 whitespace-nowrap"
                  >
                    <Search className="w-3.5 h-3.5" /> Pick Existing
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {waveDrafts.map((w, idx) => {
                  const sharedCount = w.originalFoeId
                    ? (foeUsageMap[w.originalFoeId] || []).filter(
                        (e) => e.id !== editingId
                      ).length
                    : 0;
                  const isPickingThisWave = pickingWaveKey === w.localKey;
                  const filteredPickerFoes = foes.filter((f) => {
                    const q = wavePickerSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      f.name.toLowerCase().includes(q) ||
                      (f.id && f.id.toLowerCase().includes(q))
                    );
                  });

                  return (
                    <div
                      key={w.localKey}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 overflow-hidden"
                    >
                      {/* Wave Row Header */}
                      <div
                        onClick={() =>
                          updateWave(w.localKey, { expanded: !w.expanded })
                        }
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-100/70 dark:hover:bg-gray-800/60 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono tabular-nums text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
                            {String(idx + 1).padStart(2, "0")}.
                          </span>
                          {w.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={w.imageUrl}
                              alt={w.name || "Foe"}
                              className="w-7 h-7 rounded object-cover border border-gray-300 dark:border-gray-600 shrink-0"
                            />
                          ) : (
                            <span className="text-lg shrink-0">{w.emoji || "👾"}</span>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate">
                              {w.name.trim() || `New Wave ${idx + 1} Foe`}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono tabular-nums truncate">
                              HP {w.maxHp || 20} · ATK {w.attackDamage || 0}
                              {w.foeId ? ` · id: ${w.foeId}` : " · auto-id"}
                              {w.questionTagsText.trim()
                                ? ` · tags: ${w.questionTagsText.trim()}`
                                : ""}
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            title="Move wave up"
                            disabled={idx === 0}
                            onClick={() => moveWave(idx, -1)}
                            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Move wave down"
                            disabled={idx === waveDrafts.length - 1}
                            onClick={() => moveWave(idx, 1)}
                            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {waveDrafts.length > 1 && (
                            <button
                              type="button"
                              title="Remove wave"
                              onClick={() => removeWave(w.localKey)}
                              className="p-1.5 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              updateWave(w.localKey, { expanded: !w.expanded })
                            }
                            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                          >
                            {w.expanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Inline Foe & Wave Editor */}
                      {w.expanded && (
                        <div className="p-3.5 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-3 bg-white dark:bg-gray-800/80">
                          {/* Reuse / Picker Bar */}
                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                            <div className="text-gray-600 dark:text-gray-300">
                              {w.isNewFoe ? (
                                <span>Creating new foe template</span>
                              ) : sharedCount > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                  Shared foe · also used in {sharedCount} other encounter
                                  {sharedCount > 1 ? "s" : ""}
                                </span>
                              ) : (
                                <span>Editing foe · {w.foeId}</span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {!w.isNewFoe && (
                                <button
                                  type="button"
                                  onClick={() => duplicateWaveAsNewFoe(w.localKey)}
                                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Copy className="w-3 h-3" /> Fork as New Foe
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setPickingWaveKey(
                                    isPickingThisWave ? null : w.localKey
                                  );
                                  setWavePickerSearch("");
                                }}
                                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                              >
                                {isPickingThisWave ? "Close Picker" : "Swap / Pick Existing"}
                              </button>
                            </div>
                          </div>

                          {/* Existing Foe Picker Dropdown */}
                          {isPickingThisWave && (
                            <div className="p-2.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 space-y-2">
                              <input
                                className="input w-full text-xs"
                                placeholder="Search existing foes by name or ID..."
                                value={wavePickerSearch}
                                onChange={(e) => setWavePickerSearch(e.target.value)}
                              />
                              <div className="max-h-36 overflow-y-auto space-y-1">
                                {filteredPickerFoes.map((ef) => (
                                  <button
                                    key={ef.id}
                                    type="button"
                                    onClick={() =>
                                      assignExistingFoeToWave(w.localKey, ef)
                                    }
                                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-white dark:hover:bg-gray-800 flex items-center justify-between text-xs border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                                  >
                                    <span className="font-semibold truncate flex items-center gap-2">
                                      <span>{ef.emoji || "👾"}</span>
                                      <span>{ef.name}</span>
                                      <span className="font-mono text-[11px] text-gray-500">
                                        {ef.id}
                                      </span>
                                    </span>
                                    <span className="font-mono tabular-nums text-[11px] text-gray-500 shrink-0">
                                      HP {ef.maxHp} · ATK {ef.attackDamage}
                                    </span>
                                  </button>
                                ))}
                                {filteredPickerFoes.length === 0 && (
                                  <div className="text-center text-xs text-gray-400 py-2">
                                    No matching foes found.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Core Foe Fields */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <Input
                                label="Foe Name"
                                value={w.name}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  handleWaveNameChange(w.localKey, e.target.value)
                                }
                                placeholder="e.g. Slime King"
                              />
                            </div>
                            <Input
                              label="Emoji"
                              value={w.emoji}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                updateWave(w.localKey, { emoji: e.target.value })
                              }
                              placeholder="👾"
                            />
                          </div>

                          <Input
                            label="Foe Description"
                            value={w.description}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              updateWave(w.localKey, { description: e.target.value })
                            }
                            placeholder="Short lore or visual cue shown to players..."
                          />

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                Foe Image URL
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  setAssetPickerTarget({
                                    type: "wave",
                                    localKey: w.localKey,
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5"
                              >
                                <ImageIcon className="w-3.5 h-3.5" /> Pick from Asset Hub
                              </button>
                            </div>
                            <div className="flex gap-2 items-center">
                              <input
                                className="input flex-1"
                                placeholder="e.g. /Assets/Location specific/location 2/boss.png"
                                value={w.imageUrl}
                                onChange={(e) =>
                                  updateWave(w.localKey, { imageUrl: e.target.value })
                                }
                              />
                              {w.imageUrl && (
                                <div className="w-10 h-10 rounded-lg bg-black/30 border border-gray-300 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={w.imageUrl}
                                    alt="Foe Preview"
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              type="number"
                              label="Max HP"
                              value={w.maxHp}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                updateWave(w.localKey, {
                                  maxHp:
                                    e.target.value === "" ? "" : Number(e.target.value),
                                })
                              }
                            />
                            <Input
                              type="number"
                              label="Attack Dmg"
                              value={w.attackDamage}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                updateWave(w.localKey, {
                                  attackDamage:
                                    e.target.value === "" ? "" : Number(e.target.value),
                                })
                              }
                            />
                          </div>

                          {/* Per-Wave Question Tags Override */}
                          <Input
                            label="Wave Question Tags (optional override)"
                            value={w.questionTagsText}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              updateWave(w.localKey, {
                                questionTagsText: e.target.value,
                              })
                            }
                            placeholder={`Inherits encounter tags (${questionTag || "none"})`}
                          />

                          {/* Auto-Generated / Editable Foe ID */}
                          <div className="pt-1 border-t border-gray-100 dark:border-gray-700/60">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono text-gray-500 dark:text-gray-400">
                                Foe ID: {w.foeId || "(auto-generated on save)"}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateWave(w.localKey, {
                                    showIdField: !w.showIdField,
                                  })
                                }
                                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                              >
                                {w.showIdField ? "Hide ID" : "Edit Foe ID"}
                              </button>
                            </div>
                            {w.showIdField && (
                              <div className="mt-2">
                                <Input
                                  label="Foe ID (editable for reuse)"
                                  value={w.foeId}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    updateWave(w.localKey, {
                                      foeId: e.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9_-]/g, "-"),
                                      idManuallyEdited: true,
                                    })
                                  }
                                  placeholder="e.g. slime-king"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OPTIONAL ENCOUNTER DISPLAY OVERRIDES */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/30 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    Encounter Display Overrides (Optional)
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Leave blank to automatically use Wave 1 foe&apos;s name, description, image, and emoji.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOverrides(!showOverrides)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                >
                  {showOverrides ? "Hide" : "Customize"}
                </button>
              </div>

              {showOverrides && (
                <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input
                        label="Title Override"
                        value={title}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setTitle(e.target.value)
                        }
                        placeholder={`Auto: ${primaryWaveDefaults.title}`}
                      />
                    </div>
                    {title && (
                      <button
                        type="button"
                        onClick={() => setTitle("")}
                        title="Use Wave 1 foe name"
                        className="mb-1 p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input
                        label="Description Override"
                        value={desc}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setDesc(e.target.value)
                        }
                        placeholder={`Auto: ${primaryWaveDefaults.description}`}
                      />
                    </div>
                    {desc && (
                      <button
                        type="button"
                        onClick={() => setDesc("")}
                        title="Use Wave 1 foe description"
                        className="mb-1 p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                          Image URL Override
                        </label>
                        <button
                          type="button"
                          onClick={() => setAssetPickerTarget({ type: "encounter" })}
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          <ImageIcon className="w-3 h-3" /> Pick Asset
                        </button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          className="input flex-1"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          placeholder={
                            primaryWaveDefaults.imageUrl
                              ? `Auto: ${primaryWaveDefaults.imageUrl}`
                              : "Auto: Wave 1 foe image"
                          }
                        />
                        {imageUrl && (
                          <button
                            type="button"
                            onClick={() => setImageUrl("")}
                            title="Use Wave 1 foe image"
                            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1.5 items-end">
                      <div className="flex-1">
                        <Input
                          label="Emoji Override"
                          value={emoji}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setEmoji(e.target.value)
                          }
                          placeholder={`Auto: ${primaryWaveDefaults.emoji}`}
                        />
                      </div>
                      {emoji && (
                        <button
                          type="button"
                          onClick={() => setEmoji("")}
                          title="Use Wave 1 foe emoji"
                          className="mb-1 p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* REWARDS & PROGRESSION */}
            <div className="grid grid-cols-4 gap-3 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <Input
                type="number"
                label="XP"
                value={xp}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setXp(Number(e.target.value))
                }
              />
              <Input
                type="number"
                label="Gold"
                value={gold}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setGold(Number(e.target.value))
                }
              />
              <Input
                type="number"
                step="0.1"
                min="0.1"
                label="Time x"
                value={timeMult}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTimeMult(Number(e.target.value))
                }
              />
              <Input
                type="number"
                label="Order"
                value={order}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOrder(Number(e.target.value))
                }
              />
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <h3 className="label-sm">Skill Rewards</h3>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  label="Algebra"
                  value={rewardAlgebra}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setRewardAlgebra(Number(e.target.value))
                  }
                />
                <Input
                  type="number"
                  label="Functions"
                  value={rewardFunctions}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setRewardFunctions(Number(e.target.value))
                  }
                />
                <Input
                  type="number"
                  label="Geometry"
                  value={rewardGeometry}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setRewardGeometry(Number(e.target.value))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input
                  type="number"
                  label="Stats/Prob"
                  value={rewardStats}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setRewardStats(Number(e.target.value))
                  }
                />
                <Input
                  type="number"
                  label="Calculus"
                  value={rewardCalculus}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setRewardCalculus(Number(e.target.value))
                  }
                />
              </div>
            </div>

            <Input
              label="Win Reward Story Flag"
              value={winRewardStoryFlag}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setWinRewardStoryFlag(e.target.value)
              }
              placeholder="e.g., DEFEATED_GOBLIN_KING"
            />

            {/* POKEMÁTICOS (PKM) ACHIEVEMENT REWARD SECTION */}
            <div className="bg-purple-50 dark:bg-purple-950/30 p-3.5 rounded-xl border border-purple-200 dark:border-purple-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="label-sm text-purple-800 dark:text-purple-300 font-bold">
                  Pokemáticos (PKM) Reward Activity
                </h3>
                {pkmActivityId.trim() && (
                  <span className="text-[11px] font-mono text-purple-700 dark:text-purple-300">
                    Code Key: {pkmActivityId.trim().slice(0, 6)}
                  </span>
                )}
              </div>
              <Input
                label="Activity Identifier (e.g. library_guardian)"
                value={pkmActivityId}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setPkmActivityId(e.target.value)
                }
                placeholder="e.g. library_guardian, algebra_trial_01"
              />
            </div>

            {/* SPECIAL FIGHT PHASE SHIFT SECTION */}
            <div className="bg-indigo-50 dark:bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="label-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Special Fight (50% HP Phase Shift)
                </h3>
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(true)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                >
                  Test Lab
                </button>
              </div>

              <div>
                <select
                  value={specialFightId}
                  onChange={(e) => setSpecialFightId(e.target.value)}
                  className="input text-sm"
                >
                  <option value="">-- None (Standard Battle Only) --</option>
                  {SPECIAL_FIGHTS_LIST.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.locationName.split(":")[0]})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Triggers when the final wave&apos;s foe drops below 50% HP.
                </p>
              </div>

              {specialFightId && (
                <div className="pt-2 border-t border-indigo-200 dark:border-indigo-800/40 grid grid-cols-2 gap-3 items-center">
                  <Input
                    type="number"
                    min="10"
                    max="100"
                    label="Phase 2 Speed +%"
                    value={phase2Speed}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setPhase2Speed(Number(e.target.value))
                    }
                    placeholder="25"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Foe restores 100% HP and timer runs{" "}
                    <strong className="text-indigo-600 dark:text-indigo-300">
                      +{phase2Speed}% faster
                    </strong>
                    .
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={saveEncounter}
            className="btn-primary flex-1 py-2.5 rounded-lg font-bold"
          >
            {editingId
              ? "Update Encounter & Foes"
              : encounterType === "shop"
              ? "Create Store Encounter"
              : "Create Encounter"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: ENCOUNTERS BROWSER & FOE LIBRARY */}
      <div className="space-y-3.5 border-l border-gray-200 dark:border-gray-700 pl-0 md:pl-5">
        {/* Segmented Switch: Encounters vs Foe Library */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setBrowserMode("encounters")}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
              browserMode === "encounters"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Encounters ({encounters.length})
          </button>
          <button
            type="button"
            onClick={() => setBrowserMode("foes")}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
              browserMode === "foes"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Foe Library ({foes.length})
          </button>
        </div>

        {browserMode === "encounters" ? (
          <>
            {/* LOCATION FILTER DROPDOWN */}
            <div className="space-y-1.5 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-500" />
                  <span>Filter by Location</span>
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
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setFilterLocationId(e.target.value)
                }
                className="input w-full text-xs font-semibold bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              >
                <option value="all">All Locations ({encounters.length})</option>
                {locations.map((loc) => {
                  const count = encounters.filter(
                    (e) => getEncounterLocationId(e) === loc.id
                  ).length;
                  return (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({count})
                    </option>
                  );
                })}
                {unassignedCount > 0 && (
                  <option value="unassigned">
                    Unassigned / Legacy ({unassignedCount})
                  </option>
                )}
              </select>
            </div>

            {/* SEARCH INPUT */}
            <Input
              className="w-full text-sm"
              placeholder="Search encounters, foe names, or IDs..."
              value={searchTerm}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setSearchTerm(e.target.value)
              }
            />

            <div className="flex items-center justify-between pt-1">
              <h3 className="label-sm">
                Existing Encounters ({visibleEncounters.length}
                {filterLocationId !== "all" || searchTerm
                  ? ` of ${encounters.length}`
                  : ""}
                )
              </h3>
            </div>

            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1 custom-scrollbar">
              {visibleEncounters.length > 0 ? (
                visibleEncounters.map((enc) => {
                  const subArea = allSubAreas.find((sa) => sa.id === enc.subAreaId);
                  const location = locations.find(
                    (l) => l.id === (enc.locationId || subArea?.locationId)
                  );
                  const waveConfigs = getEncounterWaveConfigs(enc);
                  const primaryFoe = waveConfigs[0]
                    ? foesById[waveConfigs[0].foeId]
                    : undefined;
                  const resolved = resolveEncounterDisplay(enc, primaryFoe);
                  const waveNames = waveConfigs
                    .map((w) => foesById[w.foeId]?.name || w.foeId)
                    .join(" → ");

                  return (
                    <div
                      key={enc.id}
                      onClick={() => loadEncounterToEdit(enc)}
                      className={`p-3 border rounded-xl flex justify-between items-center cursor-pointer transition-colors ${
                        editingId === enc.id
                          ? "border-green-500 bg-green-50 ring-1 ring-green-500 dark:bg-green-900/30 dark:border-green-400"
                          : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        {resolved.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolved.imageUrl}
                            alt={resolved.title}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600 shrink-0"
                          />
                        ) : (
                          <span className="text-2xl shrink-0">{resolved.emoji}</span>
                        )}

                        <div className="min-w-0">
                          <div className="font-bold text-sm dark:text-gray-100 truncate">
                            {resolved.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {location?.name || "No Location"} /{" "}
                            {subArea?.name || enc.subAreaId || "Legacy"}
                            {enc.encounterType === "shop"
                              ? ` · Store (${enc.shopItemIds?.length || 0} items)`
                              : waveConfigs.length > 0
                              ? ` · ${waveConfigs.length} wave${
                                  waveConfigs.length > 1 ? "s" : ""
                                }: ${waveNames}`
                              : ""}
                            {enc.pkmActivityId ? " · PKM" : ""}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          if (enc.id) deleteEnc(enc.id);
                        }}
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-xs font-bold px-2 ml-2 shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-gray-400 italic bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-700">
                  No encounters match your current filters.
                </div>
              )}
            </div>
          </>
        ) : (
          /* FOE LIBRARY VIEW */
          <div className="space-y-3">
            <Input
              className="w-full text-sm"
              placeholder="Search Foe Library by name or ID..."
              value={foeLibrarySearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFoeLibrarySearch(e.target.value)
              }
            />

            {/* Standalone Foe Inline Editor */}
            {standaloneFoeDraft && (
              <div className="p-3.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-800 dark:text-purple-300">
                    Editing Library Foe: {standaloneFoeDraft.originalFoeId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setStandaloneFoeDraft(null);
                      setStandaloneFoeEditingId("");
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Input
                      label="Name"
                      value={standaloneFoeDraft.name}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setStandaloneFoeDraft((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev
                        )
                      }
                    />
                  </div>
                  <Input
                    label="Emoji"
                    value={standaloneFoeDraft.emoji}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setStandaloneFoeDraft((prev) =>
                        prev ? { ...prev, emoji: e.target.value } : prev
                      )
                    }
                  />
                </div>

                <Input
                  label="Description"
                  value={standaloneFoeDraft.description}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setStandaloneFoeDraft((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev
                    )
                  }
                />

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                      Image URL
                    </label>
                    <button
                      type="button"
                      onClick={() => setAssetPickerTarget({ type: "standaloneFoe" })}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <ImageIcon className="w-3 h-3" /> Pick Asset
                    </button>
                  </div>
                  <Input
                    value={standaloneFoeDraft.imageUrl}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setStandaloneFoeDraft((prev) =>
                        prev ? { ...prev, imageUrl: e.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="Foe ID"
                    value={standaloneFoeDraft.foeId}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setStandaloneFoeDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              foeId: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9_-]/g, "-"),
                            }
                          : prev
                      )
                    }
                  />
                  <Input
                    type="number"
                    label="Max HP"
                    value={standaloneFoeDraft.maxHp}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setStandaloneFoeDraft((prev) =>
                        prev ? { ...prev, maxHp: Number(e.target.value) } : prev
                      )
                    }
                  />
                  <Input
                    type="number"
                    label="Attack"
                    value={standaloneFoeDraft.attackDamage}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setStandaloneFoeDraft((prev) =>
                        prev
                          ? { ...prev, attackDamage: Number(e.target.value) }
                          : prev
                      )
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={saveStandaloneFoe}
                  className="btn-primary w-full py-2 rounded-lg text-xs font-bold"
                >
                  Save Foe Changes
                </button>
              </div>
            )}

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
              {visibleLibraryFoes.map((f) => {
                const usedIn = (f.id && foeUsageMap[f.id]) || [];
                return (
                  <div
                    key={f.id}
                    onClick={() => openStandaloneFoeEditor(f)}
                    className={`p-3 border rounded-xl flex justify-between items-center cursor-pointer transition-colors ${
                      standaloneFoeEditingId === f.id
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 dark:border-purple-400"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      {f.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.imageUrl}
                          alt={f.name}
                          className="w-10 h-10 rounded-md object-cover shrink-0"
                        />
                      ) : (
                        <span className="text-2xl shrink-0">{f.emoji || "👾"}</span>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-sm dark:text-gray-100 truncate">
                          {f.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono tabular-nums truncate">
                          {f.id} · HP {f.maxHp} · ATK {f.attackDamage ?? 0} ·{" "}
                          {usedIn.length > 0
                            ? `${usedIn.length} encounter${usedIn.length > 1 ? "s" : ""}`
                            : "Unused"}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteStandaloneFoe(f);
                      }}
                      className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-xs font-bold px-2 ml-2 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ASSET PICKER MODAL */}
      <AssetPickerModal
        isOpen={assetPickerTarget !== null}
        onClose={() => setAssetPickerTarget(null)}
        onSelectAsset={(path) => {
          if (!assetPickerTarget) return;
          if (assetPickerTarget.type === "encounter") {
            setImageUrl(path);
          } else if (assetPickerTarget.type === "wave") {
            updateWave(assetPickerTarget.localKey, { imageUrl: path });
          } else if (assetPickerTarget.type === "standaloneFoe") {
            setStandaloneFoeDraft((prev) =>
              prev ? { ...prev, imageUrl: path } : prev
            );
          }
        }}
        initialFolder="Assets/Location specific/location 2"
      />

      {/* SPECIAL FIGHT GM TEST MODAL */}
      <SpecialFightModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        initialFightId={specialFightId || "loc2_vieta_scales"}
        foes={foes}
      />
    </div>
  );
}

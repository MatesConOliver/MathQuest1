"use client";
import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { GameLocation, CharacterSkills } from '@/types/game';
import { Input } from '@/app/gm/components/Input';
import { IB_MATH_AA_HL_SYLLABUS } from '@/lib/syllabus';

export function LocationsPanel() {
    const [locs, setLocs] = useState<GameLocation[]>([]);
    const [editingLocation, setEditingLocation] = useState<Partial<GameLocation> | null>(null);
    const [storyFlagsInput, setStoryFlagsInput] = useState('');
    const [isCreating, setIsCreating] = useState(true);
    const [msg, setMsg] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    // TAG MANAGEMENT STATE - Strictly driven by existing questions
    const [allKnownTags, setAllKnownTags] = useState<string[]>([]);
    const [tagCounts, setTagCounts] = useState<Map<string, number>>(new Map());
    const [hasLoadedQuestions, setHasLoadedQuestions] = useState(false);
    const [tagInput, setTagInput] = useState("");
    const [tagError, setTagError] = useState("");
    const [unassignedSearch, setUnassignedSearch] = useState("");
    const [showTagMatrix, setShowTagMatrix] = useState(false);

    // 1. Fetch Locations with live snapshot
    useEffect(() => {
        const q = query(collection(db, 'locations'), orderBy('order'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameLocation));
            setLocs(fetchedLocations);
        });
        return () => unsubscribe();
    }, []);

    // 2. Real-time scan of tags strictly from Questions database (no phantom/default tags)
    useEffect(() => {
        const unsubscribe = onSnapshot(
            collection(db, 'questions'),
            (snapshot) => {
                const counts = new Map<string, number>();
                snapshot.docs.forEach((d) => {
                    const data = d.data();
                    if (Array.isArray(data.tags)) {
                        data.tags.forEach((t: string) => {
                            if (t && typeof t === 'string') {
                                const clean = t.trim();
                                if (clean) {
                                    counts.set(clean, (counts.get(clean) || 0) + 1);
                                }
                            }
                        });
                    }
                });

                setTagCounts(counts);
                const validTags = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
                setAllKnownTags(validTags);
                setHasLoadedQuestions(true);
            },
            (err) => {
                console.error("Error subscribing to questions tags:", err);
            }
        );
        return () => unsubscribe();
    }, []);

    // 3. Auto-prune orphaned tags from Locations in Firestore if their question count dropped to 0
    useEffect(() => {
        if (!hasLoadedQuestions || locs.length === 0) return;
        const validLowerTags = new Set(allKnownTags.map((t) => t.toLowerCase()));

        locs.forEach(async (loc) => {
            const assigned = loc.assignedTags || [];
            const orphaned = assigned.filter((t) => !validLowerTags.has(t.trim().toLowerCase()));
            if (orphaned.length > 0) {
                const cleaned = assigned.filter((t) => validLowerTags.has(t.trim().toLowerCase()));
                try {
                    await updateDoc(doc(db, 'locations', loc.id), {
                        assignedTags: cleaned,
                    });
                    console.log(`[LocationsPanel] Automatically pruned ${orphaned.length} dead tag(s) from Location ${loc.order}:`, orphaned);
                } catch (e) {
                    console.warn(`[LocationsPanel] Error auto-cleaning orphaned tags on Loc ${loc.order}:`, e);
                }
            }
        });
    }, [hasLoadedQuestions, allKnownTags, locs]);

    // Keep editingLocation assignedTags in sync if an assigned tag is pruned
    useEffect(() => {
        if (!editingLocation || !editingLocation.assignedTags) return;
        const validLowerTags = new Set(allKnownTags.map((t) => t.toLowerCase()));
        const filtered = editingLocation.assignedTags.filter((t) => validLowerTags.has(t.trim().toLowerCase()));
        if (filtered.length !== editingLocation.assignedTags.length) {
            setEditingLocation((prev) => (prev ? { ...prev, assignedTags: filtered } : null));
        }
    }, [allKnownTags, editingLocation]);

    // Global Mapping: Tag -> Location (Normalized to lowercase)
    const tagToLocationMap = useMemo(() => {
        const map = new Map<string, { id: string; name: string; order: number }>();
        locs.forEach(l => {
            (l.assignedTags || []).forEach(t => {
                const norm = t.trim().toLowerCase();
                if (norm) {
                    map.set(norm, { id: l.id, name: l.name, order: l.order });
                }
            });
        });
        return map;
    }, [locs]);

    // Unassigned Tags: Known tags not assigned to ANY location
    const unassignedTags = useMemo(() => {
        return allKnownTags.filter(t => !tagToLocationMap.has(t.trim().toLowerCase()));
    }, [allKnownTags, tagToLocationMap]);

    // Filtered unassigned tags for the search box
    const filteredUnassignedTags = useMemo(() => {
        if (!unassignedSearch.trim()) return unassignedTags;
        const q = unassignedSearch.toLowerCase();
        return unassignedTags.filter(t => t.toLowerCase().includes(q));
    }, [unassignedTags, unassignedSearch]);

    const visibleLocs = locs.filter(l => 
      l.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectLocationToEdit = (loc: GameLocation) => {
        setIsCreating(false);
        setEditingLocation({
            ...JSON.parse(JSON.stringify(loc)),
            assignedTags: loc.assignedTags ? [...loc.assignedTags] : []
        });
        setStoryFlagsInput(loc.unlockRequirements?.storyFlags?.join(', ') ?? '');
        setTagError("");
        setTagInput("");
        setMsg(`✏️ Editing: ${loc.name}`);
    };

    const startNewLocation = () => {
        setIsCreating(true);
        setEditingLocation({
            id: '', name: '', description: '', order: locs.length + 1,
            unlockRequirements: { skills: {} },
            assignedTags: []
        });
        setStoryFlagsInput('');
        setTagError("");
        setTagInput("");
        setMsg("Creating a new location");
    };
    
    // Initialize form on mount
    useEffect(() => {
      startNewLocation();
    }, []);

    const handleFormChange = (field: keyof GameLocation, value: any) => {
        setEditingLocation(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleSkillChange = (skill: keyof CharacterSkills, value: string) => {
        if (!editingLocation) return;
        const level = Number(value);
        const currentSkills = editingLocation.unlockRequirements?.skills || {};
        const updatedSkills = { ...currentSkills };

        if (!isNaN(level) && level > 0) {
            updatedSkills[skill] = level;
        } else {
            delete updatedSkills[skill];
        }
        setEditingLocation(prev => prev ? {
            ...prev,
            unlockRequirements: {
                ...(prev.unlockRequirements || {}),
                skills: updatedSkills,
            },
        } : null);
    };

    // TAG ASSIGNMENT WITH STRICT UNIQUENESS ENFORCEMENT & QUESTION EXISTENCE
    const handleAddTag = (rawTag: string) => {
        const tag = rawTag.trim();
        if (!tag) return;
        if (!editingLocation) return;

        const normalized = tag.toLowerCase();

        // 1. Tag must exist on at least one question in the database
        const matchingKnownTag = allKnownTags.find(t => t.toLowerCase() === normalized);
        if (!matchingKnownTag) {
            setTagError(
                `⛔ Denied: Tag '${tag}' does not belong to any existing question. Only tags that have at least one question in the database can be assigned.`
            );
            return;
        }

        // 2. Check if already claimed by ANOTHER location
        const existingClaim = tagToLocationMap.get(normalized);
        if (existingClaim && existingClaim.id !== editingLocation.id) {
            setTagError(
                `⛔ Denied: Tag '${tag}' is already assigned to Location ${existingClaim.order} (${existingClaim.name}). A tag can only belong to one location.`
            );
            return;
        }

        // 3. Check if already in current location
        const currentTags = editingLocation.assignedTags || [];
        if (currentTags.some(t => t.toLowerCase() === normalized)) {
            setTagError(`Tag '${matchingKnownTag}' is already added to this location.`);
            return;
        }

        // Add canonical question tag
        setTagError("");
        setEditingLocation(prev => prev ? {
            ...prev,
            assignedTags: [...currentTags, matchingKnownTag]
        } : null);
        setTagInput("");
    };

    const handleRemoveTag = (tagToRemove: string) => {
        if (!editingLocation) return;
        const currentTags = editingLocation.assignedTags || [];
        setTagError("");
        setEditingLocation(prev => prev ? {
            ...prev,
            assignedTags: currentTags.filter(t => t.toLowerCase() !== tagToRemove.toLowerCase())
        } : null);
    };

    const handleSave = async () => {
        if (!editingLocation || !editingLocation.id || !editingLocation.name) {
            alert("Location ID and Name are required.");
            return;
        }

        const locToSave: Partial<GameLocation> = JSON.parse(JSON.stringify(editingLocation));

        const flags = storyFlagsInput.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (flags.length > 0) {
            locToSave.unlockRequirements = {
                ...(locToSave.unlockRequirements || {}),
                storyFlags: flags
            };
        } else if (locToSave.unlockRequirements) {
            delete locToSave.unlockRequirements.storyFlags;
        }

        if (locToSave.unlockRequirements?.skills && Object.keys(locToSave.unlockRequirements.skills).length === 0) {
            delete locToSave.unlockRequirements.skills;
        }

        if (locToSave.unlockRequirements && Object.keys(locToSave.unlockRequirements).length === 0) {
            delete locToSave.unlockRequirements;
        }

        // Ensure assignedTags is saved as a clean array of strings
        locToSave.assignedTags = (locToSave.assignedTags || []).map(t => t.trim()).filter(Boolean);

        const { id, ...data } = locToSave;
        await setDoc(doc(db, 'locations', id!), data);
        
        setMsg(isCreating ? "✅ Created New Location" : "✅ Updated Location");
        startNewLocation();
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
            await deleteDoc(doc(db, 'locations', id));
            startNewLocation();
        }
    };

    const allPossibleSkills: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];

    return (
        <div className="space-y-6">
            {/* TOP BAR / STATS OVERVIEW */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 shadow-sm">
                <div>
                    <h2 className="font-extrabold text-xl text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <span>🗺️</span>
                        <span>Locations & Curriculum Tags</span>
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Map unique tags to locations (Units 1–16). AI solvers strictly observe the curriculum up to each question&apos;s unit.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-3 py-1 rounded-full font-bold">
                        🏷️ {unassignedTags.length} Unassigned Tags
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowTagMatrix(!showTagMatrix)}
                        className="text-xs font-bold px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-800 dark:text-gray-200 transition-colors"
                    >
                        {showTagMatrix ? "Hide Curriculum Matrix" : "📊 View Curriculum Matrix"}
                    </button>
                </div>
            </div>

            {/* CURRICULUM MATRIX COLLAPSIBLE VIEW */}
            {showTagMatrix && (
                <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-gray-900 dark:to-indigo-950/30 p-5 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                            <span>📊</span>
                            <span>All 16 Locations Curriculum Tag Distribution</span>
                        </h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Strict 1:1 Tag Mapping • No Tag Cross-Pollution
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        {locs.map(l => (
                            <div
                                key={l.id}
                                onClick={() => selectLocationToEdit(l)}
                                className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 cursor-pointer shadow-xs transition-all space-y-1.5"
                            >
                                <div className="flex items-center justify-between font-bold">
                                    <span className="text-indigo-700 dark:text-indigo-300">
                                        Loc {l.order}: {l.name}
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                        {(l.assignedTags || []).length} tags
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1 min-h-[32px]">
                                    {(l.assignedTags || []).length > 0 ? (
                                        (l.assignedTags || []).map(t => (
                                            <span
                                                key={t}
                                                className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
                                            >
                                                {t}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-400 italic text-[11px]">No tags assigned yet</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid md:grid-cols-12 gap-6">
                {/* LEFT COLUMN: EDIT / CREATE LOCATION FORM (7 COLS) */}
                <div className="md:col-span-7 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors space-y-4">
                    <div className="flex justify-between items-start border-b dark:border-gray-700 pb-3">
                        <div>
                            <h2 className="font-bold text-lg">{isCreating ? "Create Map Location" : `Edit Location: ${editingLocation?.name || ""}`}</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Set location details and assign its exclusive curriculum unit tags.
                            </p>
                        </div>
                        <button onClick={startNewLocation} className="text-xs font-bold px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50">
                            + New Location
                        </button>
                    </div>

                    {msg && <div className="text-green-600 dark:text-green-400 text-xs font-bold p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">{msg}</div>}

                    {editingLocation && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="ID" value={editingLocation.id ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('id', e.target.value)} placeholder="unique-location-id" disabled={!isCreating}/>
                                <Input type="number" label="Order / Unit (1–16)" value={editingLocation.order ?? 1} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('order', Number(e.target.value))} />
                            </div>

                            <Input label="Location Name" value={editingLocation.name ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('name', e.target.value)} placeholder="e.g. Whispering Woods" />
                            <Input label="Description" value={editingLocation.description ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('description', e.target.value)} placeholder="Short lore / description..." />

                            <Input label="Image URL" value={editingLocation.imageUrl ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('imageUrl', e.target.value)} />

                            <div className="flex items-center gap-3">
                                <div className="flex-1">
                                    <Input label="Path Color (hex)" value={editingLocation.pathColor ?? '#fbbf24'} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('pathColor', e.target.value)} placeholder="#fbbf24" />
                                </div>
                                <div className="pt-4">
                                    <input
                                        type="color"
                                        value={editingLocation.pathColor || '#fbbf24'}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('pathColor', e.target.value)}
                                        className="w-10 h-10 rounded border border-gray-400 cursor-pointer bg-transparent"
                                        title="Choose path color"
                                    />
                                </div>
                            </div>

                            {/* ======================================================== */}
                            {/* 🏷️ CURRICULUM TAGS ASSIGNMENT SECTION                     */}
                            {/* ======================================================== */}
                            <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                                            <span>🏷️</span>
                                            <span>Exclusive Location Tags</span>
                                            <span className="text-[10px] bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded-full font-bold">
                                                {(editingLocation.assignedTags || []).length}
                                            </span>
                                        </h4>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                            Questions with these tags automatically inherit this location and its curriculum unit topics.
                                        </p>
                                    </div>
                                </div>

                                {/* Current Assigned Tags Chips */}
                                <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-white dark:bg-gray-900 rounded-lg border border-indigo-100 dark:border-indigo-900/60">
                                    {(editingLocation.assignedTags || []).length > 0 ? (
                                        (editingLocation.assignedTags || []).map(t => (
                                            <span
                                                key={t}
                                                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-full font-mono shadow-xs"
                                            >
                                                <span>{t}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveTag(t)}
                                                    className="text-indigo-200 hover:text-white font-bold ml-0.5"
                                                    title="Remove tag"
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-gray-400 italic py-1">
                                            No tags assigned yet. Type a tag below or click any unassigned tag from the right pool.
                                        </span>
                                    )}
                                </div>

                                {/* Tag Error Banner */}
                                {tagError && (
                                    <div className="p-2.5 bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 text-xs rounded-lg font-bold flex items-start gap-2">
                                        <span className="shrink-0 text-base">⚠️</span>
                                        <span className="leading-tight">{tagError}</span>
                                    </div>
                                )}

                                {/* Add Tag Input */}
                                <div className="flex gap-2">
                                    <input
                                        className="input flex-1 text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                                        placeholder="Add tag (e.g. quadratics, functions)..."
                                        value={tagInput}
                                        list="unassigned-datalist"
                                        onChange={(e) => {
                                            setTagInput(e.target.value);
                                            if (tagError) setTagError("");
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddTag(tagInput);
                                            }
                                        }}
                                    />
                                    <datalist id="unassigned-datalist">
                                        {unassignedTags.map(t => (
                                            <option key={t} value={t} />
                                        ))}
                                    </datalist>
                                    <button
                                        type="button"
                                        onClick={() => handleAddTag(tagInput)}
                                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                    >
                                        + Assign Tag
                                    </button>
                                </div>
                            </div>

                            {/* Unlock Requirements */}
                            <div className="border-t dark:border-gray-700 pt-3 space-y-3">
                                <h4 className="font-bold text-xs uppercase text-gray-500">Unlock Requirements (Optional)</h4>

                                <Input
                                    label="Story Flags (comma-separated)"
                                    value={storyFlagsInput}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setStoryFlagsInput(e.target.value)}
                                    placeholder="FLAG_A, FLAG_B"
                                />

                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                    {allPossibleSkills.map(skillName => (
                                        <Input
                                            key={skillName}
                                            label={`Min ${skillName}`}
                                            type="number"
                                            value={editingLocation.unlockRequirements?.skills?.[skillName] || ''}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => handleSkillChange(skillName, e.target.value)}
                                            placeholder="Level"
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-2 border-t dark:border-gray-700">
                                <button onClick={handleSave} className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-2.5 rounded-lg font-bold text-sm shadow">
                                    {isCreating ? "💾 Save Location" : "💾 Update Location"}
                                </button>
                                {!isCreating && (
                                    <button onClick={() => handleDelete(editingLocation.id!)} className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 text-sm font-bold">
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT COLUMN: UNASSIGNED TAGS POOL & LOCATION LIBRARY (5 COLS) */}
                <div className="md:col-span-5 space-y-5">
                    {/* 1. UNASSIGNED TAGS POOL CARD */}
                    <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-4 rounded-xl shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-xs uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                <span>🏷️</span>
                                <span>Unassigned Tags Pool ({unassignedTags.length})</span>
                            </h3>
                            <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                                No Location Assigned
                            </span>
                        </div>

                        <p className="text-[11px] text-gray-600 dark:text-gray-400">
                            {editingLocation?.name ? (
                                <>Click any tag to instantly assign it to <b>{editingLocation.name}</b> (Loc {editingLocation.order}):</>
                            ) : (
                                <>Select a location on the left to assign these unallocated tags:</>
                            )}
                        </p>

                        <input
                            className="input w-full text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                            placeholder="🔍 Filter unassigned tags..."
                            value={unassignedSearch}
                            onChange={(e) => setUnassignedSearch(e.target.value)}
                        />

                        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-white dark:bg-gray-900 rounded-lg border border-amber-100 dark:border-amber-900/40 custom-scrollbar">
                            {filteredUnassignedTags.length > 0 ? (
                                filteredUnassignedTags.map(tag => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => handleAddTag(tag)}
                                        disabled={!editingLocation}
                                        title={editingLocation ? `Assign '${tag}' (${tagCounts.get(tag) || 0} questions) to ${editingLocation.name}` : "Select a location first"}
                                        className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-colors disabled:opacity-50"
                                    >
                                        <span className="text-amber-500 group-hover:text-white font-bold">+</span>
                                        <span>{tag}</span>
                                        <span className="text-[10px] opacity-75 group-hover:text-indigo-100">
                                            ({tagCounts.get(tag) || 0})
                                        </span>
                                    </button>
                                ))
                            ) : allKnownTags.length === 0 ? (
                                <div className="text-xs text-gray-500 dark:text-gray-400 italic py-3 text-center w-full">
                                    No questions with tags found in the database. When questions are added with tags, they will automatically appear here.
                                </div>
                            ) : (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium py-3 text-center w-full">
                                    🎉 All active question tags ({allKnownTags.length}) are assigned to locations!
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. LOCATIONS LIBRARY */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700 shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Locations Library ({visibleLocs.length})
                            </h3>
                        </div>

                        <input
                            className="input w-full text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="🔍 Search locations..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />

                        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                            {visibleLocs.map(l => {
                                const isSelected = !isCreating && editingLocation?.id === l.id;
                                const tagCount = (l.assignedTags || []).length;

                                return (
                                    <div
                                        key={l.id}
                                        onClick={() => selectLocationToEdit(l)}
                                        className={`p-3 border rounded-xl flex justify-between cursor-pointer transition-all 
                                            ${isSelected
                                                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/50 dark:bg-blue-900/30 dark:border-blue-400'
                                                : 'bg-white dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'}`
                                        }
                                    >
                                        <div className="min-w-0 flex-1 pr-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm dark:text-gray-100">
                                                    {l.order}. {l.name}
                                                </span>
                                                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.2 rounded-full font-mono font-bold">
                                                    {tagCount} {tagCount === 1 ? 'tag' : 'tags'}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                {l.description || "No description"}
                                            </div>
                                            {(l.assignedTags || []).length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {(l.assignedTags || []).slice(0, 4).map(t => (
                                                        <span key={t} className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1 py-0.2 rounded font-mono">
                                                            {t}
                                                        </span>
                                                    ))}
                                                    {(l.assignedTags || []).length > 4 && (
                                                        <span className="text-[9px] text-gray-400 font-mono">
                                                            +{l.assignedTags!.length - 4} more
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(l.id!); }}
                                            className="text-xs text-red-400 font-bold hover:text-red-600 dark:hover:text-red-300 shrink-0 self-center px-1"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
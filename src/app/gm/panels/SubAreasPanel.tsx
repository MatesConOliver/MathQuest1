'use client';
import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, orderBy, addDoc, updateDoc } from 'firebase/firestore';
import { GameLocation, SubArea, CharacterSkills, SubAreaNodeType, FlagLogic, FlagLogicGroup } from '@/types/game';
import { Input } from '@/app/gm/components/Input';
import { TabButton } from '@/app/gm/components/TabButton';
import { buildMapPath } from '@/lib/mapPath';
import { formatFlagLogic, parseFlagExpression } from '@/lib/flagLogic';

export default function SubAreasPanel() {
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const [editingSubArea, setEditingSubArea] = useState<Partial<SubArea> | null>(null);
  const [isCreating, setIsCreating] = useState(true);

  // Boolean Flag Logic State
  const [flagLogicState, setFlagLogicState] = useState<FlagLogic>({
    rootOperator: 'AND',
    groups: [],
  });
  const [flagExpressionInput, setFlagExpressionInput] = useState('');
  const [newFlagInputs, setNewFlagInputs] = useState<Record<string, string>>({});

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const colorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [colorDraft, setColorDraft] = useState<string | null>(null);

  // Remember what the GM was editing so the panel can restore it if it ever remounts
  const pendingSubAreaId = useRef<string | null>(
    typeof window !== 'undefined' ? sessionStorage.getItem('gm.subareas.subAreaId') : null
  );

  useEffect(() => {
    if (selectedLocationId) sessionStorage.setItem('gm.subareas.locationId', selectedLocationId);
  }, [selectedLocationId]);

  useEffect(() => {
    if (editingSubArea?.id) sessionStorage.setItem('gm.subareas.subAreaId', editingSubArea.id);
  }, [editingSubArea?.id]);

  useEffect(() => {
    const q = query(collection(db, 'locations'), orderBy('order'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameLocation));
      setLocations(fetchedLocations);
      // Functional update: this effect runs once, so a closed-over selectedLocationId is always stale (null)
      if (fetchedLocations.length > 0) {
        const stored = sessionStorage.getItem('gm.subareas.locationId');
        const restored = fetchedLocations.find(l => l.id === stored)?.id;
        setSelectedLocationId(prev => prev ?? restored ?? fetchedLocations[0].id);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedLocationId) {
      setSubAreas([]);
      return;
    }

    const q = query(collection(db, 'subAreas'), where('locationId', '==', selectedLocationId), orderBy('order'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedSubAreas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubArea));
      setSubAreas(fetchedSubAreas);
      if (pendingSubAreaId.current) {
        const match = fetchedSubAreas.find(s => s.id === pendingSubAreaId.current);
        pendingSubAreaId.current = null;
        if (match) selectSubAreaToEdit(match);
      }
    }, (error) => {
      console.error(`Error fetching sub-areas for location ${selectedLocationId}:`, error);
      setSubAreas([]);
    });

    return () => unsubscribe();
  }, [selectedLocationId]);

  const selectSubAreaToEdit = (sa: SubArea) => {
    setIsCreating(false);
    setEditingSubArea(JSON.parse(JSON.stringify(sa)));

    const existingLogic = sa.unlockRequirements?.flagLogic;
    const existingExpr = sa.unlockRequirements?.flagExpression;
    const existingFlags = sa.unlockRequirements?.storyFlags || [];

    if (existingLogic && Array.isArray(existingLogic.groups) && existingLogic.groups.length > 0) {
      setFlagLogicState(existingLogic);
      setFlagExpressionInput(existingExpr || formatFlagLogic(existingLogic));
    } else if (existingExpr && existingExpr.trim()) {
      const parsed = parseFlagExpression(existingExpr);
      setFlagLogicState(parsed);
      setFlagExpressionInput(existingExpr);
    } else if (existingFlags.length > 0) {
      const defaultLogic: FlagLogic = {
        rootOperator: 'AND',
        groups: [{ id: 'g1', operator: 'AND', flags: [...existingFlags] }],
      };
      setFlagLogicState(defaultLogic);
      setFlagExpressionInput(existingFlags.join(' AND '));
    } else {
      setFlagLogicState({ rootOperator: 'AND', groups: [] });
      setFlagExpressionInput('');
    }
  };

  const startNewSubArea = () => {
    setIsCreating(true);
    setEditingSubArea({
      id: '',
      name: '',
      description: '',
      order: subAreas.length + 1,
      imageUrl: '',
      x: 50,
      y: 50,
      nodeType: 'encounter',
      previousSubAreaIds: [],
      unlockRequirements: { skills: {} }
    });
    setFlagLogicState({ rootOperator: 'AND', groups: [] });
    setFlagExpressionInput('');
  };

  const handleFormChange = (field: keyof SubArea, value: any) => {
    setEditingSubArea(prev => prev ? { ...prev, [field]: value } : null);
  };

  const togglePreviousSubAreaLink = (targetId: string) => {
    if (!editingSubArea) return;
    const current = editingSubArea.previousSubAreaIds || [];
    const updated = current.includes(targetId)
      ? current.filter(id => id !== targetId)
      : [...current, targetId];
    handleFormChange('previousSubAreaIds', updated);
  };

  // Flag Logic Builder Helpers
  const handleAddFlagGroup = () => {
    const newGroup: FlagLogicGroup = {
      id: `group_${Date.now()}`,
      operator: 'OR',
      flags: [],
    };
    const nextLogic: FlagLogic = {
      ...flagLogicState,
      groups: [...flagLogicState.groups, newGroup],
    };
    setFlagLogicState(nextLogic);
    setFlagExpressionInput(formatFlagLogic(nextLogic));
  };

  const handleRemoveFlagGroup = (groupId: string) => {
    const nextLogic: FlagLogic = {
      ...flagLogicState,
      groups: flagLogicState.groups.filter(g => g.id !== groupId),
    };
    setFlagLogicState(nextLogic);
    setFlagExpressionInput(formatFlagLogic(nextLogic));
  };

  const handleGroupOperatorChange = (groupId: string, op: 'AND' | 'OR') => {
    const nextLogic: FlagLogic = {
      ...flagLogicState,
      groups: flagLogicState.groups.map(g => g.id === groupId ? { ...g, operator: op } : g),
    };
    setFlagLogicState(nextLogic);
    setFlagExpressionInput(formatFlagLogic(nextLogic));
  };

  const handleAddFlagToGroup = (groupId: string) => {
    const flagVal = (newFlagInputs[groupId] || '').trim().toUpperCase();
    if (!flagVal) return;
    const nextLogic: FlagLogic = {
      ...flagLogicState,
      groups: flagLogicState.groups.map(g => {
        if (g.id !== groupId) return g;
        if (g.flags.includes(flagVal)) return g;
        return { ...g, flags: [...g.flags, flagVal] };
      }),
    };
    setFlagLogicState(nextLogic);
    setFlagExpressionInput(formatFlagLogic(nextLogic));
    setNewFlagInputs(prev => ({ ...prev, [groupId]: '' }));
  };

  const handleRemoveFlagFromGroup = (groupId: string, flagIndex: number) => {
    const nextLogic: FlagLogic = {
      ...flagLogicState,
      groups: flagLogicState.groups.map(g => {
        if (g.id !== groupId) return g;
        return { ...g, flags: g.flags.filter((_, idx) => idx !== flagIndex) };
      }),
    };
    setFlagLogicState(nextLogic);
    setFlagExpressionInput(formatFlagLogic(nextLogic));
  };

  const handleRootOperatorChange = (op: 'AND' | 'OR') => {
    const nextLogic: FlagLogic = {
      ...flagLogicState,
      rootOperator: op,
    };
    setFlagLogicState(nextLogic);
    setFlagExpressionInput(formatFlagLogic(nextLogic));
  };

  const handleExpressionInputBlur = () => {
    if (!flagExpressionInput.trim()) {
      setFlagLogicState({ rootOperator: 'AND', groups: [] });
      return;
    }
    const parsed = parseFlagExpression(flagExpressionInput);
    setFlagLogicState(parsed);
  };
  
  const handleSkillChange = (skill: keyof CharacterSkills, value: string) => {
      if (!editingSubArea) return;
      const level = Number(value);
      const currentSkills = editingSubArea.unlockRequirements?.skills || {};
      const updatedSkills = { ...currentSkills };

      if (!isNaN(level) && level > 0) {
          updatedSkills[skill] = level;
      } else {
          delete updatedSkills[skill];
      }
      setEditingSubArea(prev => prev ? {
          ...prev,
          unlockRequirements: {
              ...(prev.unlockRequirements || {}),
              skills: updatedSkills,
          },
      } : null);
  };

  const handleSave = async () => {
    if (!editingSubArea || !editingSubArea.name || !selectedLocationId) {
      alert("Sub-Area Name and a parent Location are required.");
      return;
    }

    const subAreaToSave: Partial<SubArea> = JSON.parse(JSON.stringify(editingSubArea));

    // Resolve Boolean Flag Logic
    let finalLogic = flagLogicState;
    if (flagExpressionInput.trim()) {
      try {
        finalLogic = parseFlagExpression(flagExpressionInput.trim());
      } catch {
        finalLogic = flagLogicState;
      }
    }

    const allDistinctFlags = Array.from(
      new Set(finalLogic.groups.flatMap(g => g.flags.map(f => f.trim().toUpperCase())).filter(Boolean))
    );

    if (finalLogic.groups.length > 0 && allDistinctFlags.length > 0) {
      const expr = formatFlagLogic(finalLogic);
      subAreaToSave.unlockRequirements = {
        ...(subAreaToSave.unlockRequirements || {}),
        flagLogic: finalLogic,
        flagExpression: expr,
        storyFlags: allDistinctFlags, // Backward compatibility
      };
    } else if (subAreaToSave.unlockRequirements) {
      delete subAreaToSave.unlockRequirements.flagLogic;
      delete subAreaToSave.unlockRequirements.flagExpression;
      delete subAreaToSave.unlockRequirements.storyFlags;
    }
    
    if (subAreaToSave.unlockRequirements?.skills && Object.keys(subAreaToSave.unlockRequirements.skills).length === 0) {
        delete subAreaToSave.unlockRequirements.skills;
    }

    if (subAreaToSave.unlockRequirements && Object.keys(subAreaToSave.unlockRequirements).length === 0) {
        delete subAreaToSave.unlockRequirements;
    }
    
    // Ensure coordinates and nodeType are set
    subAreaToSave.x = typeof subAreaToSave.x === 'number' ? Math.round(subAreaToSave.x) : 50;
    subAreaToSave.y = typeof subAreaToSave.y === 'number' ? Math.round(subAreaToSave.y) : 50;
    subAreaToSave.nodeType = subAreaToSave.nodeType || 'encounter';
    subAreaToSave.previousSubAreaIds = subAreaToSave.previousSubAreaIds || [];

    const { id, ...data } = subAreaToSave;

    try {
        if (id) { // Editing existing
            await setDoc(doc(db, 'subAreas', id), { ...data, locationId: selectedLocationId });
        } else { // Creating new
            await addDoc(collection(db, 'subAreas'), { ...data, locationId: selectedLocationId });
        }
        startNewSubArea();
    } catch (error) {
        console.error("Error saving sub-area: ", error);
        alert("Failed to save sub-area. Check console for details.");
    }
  };


  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this sub-area? This action cannot be undone.')) {
      await deleteDoc(doc(db, 'subAreas', id));
      startNewSubArea();
    }
  };

  // --- WYSIWYG DRAG & DROP POINTER HANDLER ---
  const handlePinPointerDown = (e: React.PointerEvent, sa: SubArea) => {
    e.stopPropagation();
    e.preventDefault();
    selectSubAreaToEdit(sa);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const rawX = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const rawY = ((moveEvent.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.round(Math.max(5, Math.min(95, rawX)));
      const clampedY = Math.round(Math.max(5, Math.min(95, rawY)));

      // Live update locally for smooth 60fps drag preview
      setSubAreas(prev => prev.map(item => item.id === sa.id ? { ...item, x: clampedX, y: clampedY } : item));
      setEditingSubArea(prev => prev && prev.id === sa.id ? { ...prev, x: clampedX, y: clampedY } : prev);
    };

    const onPointerUp = async (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const rect = canvas.getBoundingClientRect();
      const rawX = ((upEvent.clientX - rect.left) / rect.width) * 100;
      const rawY = ((upEvent.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.round(Math.max(5, Math.min(95, rawX)));
      const clampedY = Math.round(Math.max(5, Math.min(95, rawY)));

      try {
        if (sa.id) {
          await updateDoc(doc(db, 'subAreas', sa.id), { x: clampedX, y: clampedY });
        }
      } catch (err) {
        console.error("Failed to save pin coordinates:", err);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // --- WAYPOINTS (path bend points on the segment leading into a sub-area) ---
  const setWaypointsLocal = (saId: string, waypoints: { x: number; y: number }[]) => {
    setSubAreas(prev => prev.map(item => item.id === saId ? { ...item, waypoints } : item));
    setEditingSubArea(prev => prev && prev.id === saId ? { ...prev, waypoints } : prev);
  };

  const saveWaypoints = async (saId: string, waypoints: { x: number; y: number }[]) => {
    try {
      await updateDoc(doc(db, 'subAreas', saId), { waypoints });
    } catch (err) {
      console.error("Failed to save waypoints:", err);
    }
  };

  const handleAddWaypoint = async (sa: SubArea) => {
    const idx = sortedSubAreas.findIndex(s => s.id === sa.id);
    if (idx <= 0) return;
    const prevPin = sortedSubAreas[idx - 1];
    const wps = sa.waypoints ?? [];
    const from = wps.length > 0 ? wps[wps.length - 1] : { x: prevPin.x ?? 50, y: prevPin.y ?? 50 };
    const to = { x: sa.x ?? 50, y: sa.y ?? 50 };
    const next = [...wps, { x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2) }];
    setWaypointsLocal(sa.id, next);
    await saveWaypoints(sa.id, next);
  };

  const handleClearWaypoints = async (sa: SubArea) => {
    if (!sa.waypoints?.length) return;
    setWaypointsLocal(sa.id, []);
    await saveWaypoints(sa.id, []);
  };

  const handleRemoveWaypoint = async (sa: SubArea, index: number) => {
    const next = (sa.waypoints ?? []).filter((_, i) => i !== index);
    setWaypointsLocal(sa.id, next);
    await saveWaypoints(sa.id, next);
  };

  const handleWaypointPointerDown = (e: React.PointerEvent, sa: SubArea, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    let latest = sa.waypoints ?? [];
    const toPoint = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.round(Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))),
        y: Math.round(Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100))),
      };
    };

    const onMove = (ev: PointerEvent) => {
      latest = latest.map((w, i) => (i === index ? toPoint(ev) : w));
      setWaypointsLocal(sa.id, latest);
    };
    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      await saveWaypoints(sa.id, latest);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Compute SVG path between sorted sub-areas
  const sortedSubAreas = [...subAreas].sort((a, b) => a.order - b.order);
  const bezierPath = buildMapPath(sortedSubAreas);
  const selectedSortedIndex = sortedSubAreas.findIndex(s => s.id === editingSubArea?.id);
  const selectedPin = !isCreating && selectedSortedIndex > 0 ? sortedSubAreas[selectedSortedIndex] : null;

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const allPossibleSkills: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];

  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const savedColor = selectedLocation?.pathColor || '#fbbf24';
  const displayColor = colorDraft ?? savedColor;
  const previewColor = HEX_COLOR.test(displayColor) ? displayColor : savedColor;

  // Update the UI immediately; write to Firestore once the value is a valid hex and input has settled
  const handlePathColorChange = (color: string) => {
    if (!selectedLocationId) return;
    setColorDraft(color);
    if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current);
    if (!HEX_COLOR.test(color)) return;

    const locationId = selectedLocationId;
    colorSaveTimer.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'locations', locationId), { pathColor: color });
        setColorDraft(prev => (prev === color ? null : prev));
      } catch (err) {
        console.error("Failed to update path color:", err);
      }
    }, 300);
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
      
      {/* 1. LOCATION SELECTOR TABS */}
      <div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Location:</div>
        <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
          {locations.map(loc => (
            <TabButton 
              key={loc.id} 
              onClick={() => { setColorDraft(null); setSelectedLocationId(loc.id); startNewSubArea(); }} 
              active={selectedLocationId === loc.id}
            >
              {loc.name}
            </TabButton>
          ))}
        </div>
      </div>

      {/* 2. WYSIWYG VISUAL NODE PLACER CANVAS */}
      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-700 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📍</span>
            <div>
              <h3 className="font-black text-lg text-white">WYSIWYG Expedition Path & Node Placer</h3>
              <p className="text-xs text-gray-400">
                Drag sub-area pins directly on the aerial art to set coordinates (clamped 5%–95%).
              </p>
            </div>
          </div>
          {selectedLocation && (
            <span className="text-xs font-mono font-bold bg-gray-800 text-yellow-400 px-3 py-1 rounded-full border border-gray-700">
              {selectedLocation.name} • {subAreas.length} nodes
            </span>
          )}
        </div>

        {/* Path Color Selector & Presets */}
        {selectedLocation && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-950/80 p-2.5 rounded-xl border border-gray-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-300">Path Color:</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={previewColor}
                  onChange={(e) => handlePathColorChange(e.target.value)}
                  className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent"
                  title="Choose custom path color"
                />
                <input
                  type="text"
                  value={displayColor}
                  onChange={(e) => handlePathColorChange(e.target.value)}
                  onBlur={() => { if (!HEX_COLOR.test(displayColor)) setColorDraft(null); }}
                  className="w-24 px-2 py-1 rounded bg-gray-800 text-white font-mono text-xs border border-gray-700"
                  placeholder="#fbbf24"
                />
              </div>
            </div>

            {/* Quick Palette Swatches */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-400 text-[11px] mr-1">Presets:</span>
              {[
                { name: 'Amber Gold', color: '#fbbf24' },
                { name: 'Bright Yellow', color: '#facc15' },
                { name: 'Crimson Red', color: '#ef4444' },
                { name: 'Arcane Purple', color: '#a855f7' },
                { name: 'Emerald Green', color: '#10b981' },
                { name: 'Frost Cyan', color: '#06b6d4' },
                { name: 'Bone White', color: '#ffffff' },
              ].map(preset => (
                <button
                  key={preset.color}
                  type="button"
                  onClick={() => handlePathColorChange(preset.color)}
                  title={preset.name}
                  style={{ backgroundColor: preset.color }}
                  className={`w-5 h-5 rounded-full border border-black/40 shadow-sm transition-transform hover:scale-125 ${
                    previewColor.toLowerCase() === preset.color.toLowerCase()
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Waypoint controls for the selected sub-area */}
        {selectedLocation && (
          <div className="flex flex-wrap items-center gap-2 bg-gray-950/80 p-2.5 rounded-xl border border-gray-800 text-xs text-gray-300">
            <span className="font-bold">Path Waypoints:</span>
            {selectedPin ? (
              <>
                <span className="text-gray-400">
                  Segment into #{selectedPin.order} {selectedPin.name} ({selectedPin.waypoints?.length ?? 0})
                </span>
                <button
                  type="button"
                  onClick={() => handleAddWaypoint(selectedPin)}
                  className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  + Add Waypoint
                </button>
                <button
                  type="button"
                  onClick={() => handleClearWaypoints(selectedPin)}
                  disabled={!selectedPin.waypoints?.length}
                  className="px-2.5 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear Waypoints
                </button>
              </>
            ) : (
              <span className="text-gray-500">Select a sub-area (other than the first) to edit the path leading to it.</span>
            )}
          </div>
        )}

        {/* Canvas */}
        <div 
          ref={canvasRef}
          className="relative w-full aspect-[16/9] rounded-xl overflow-hidden border-2 border-dashed border-gray-600 bg-gray-950 select-none shadow-2xl"
        >
          {selectedLocation?.imageUrl ? (
            <img 
              src={selectedLocation.imageUrl} 
              alt={selectedLocation.name}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none" 
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-gradient-to-br from-gray-900 via-gray-950 to-black p-6 text-center">
              <span className="text-4xl mb-2 opacity-40">🗺️</span>
              <p className="font-bold text-sm text-gray-400">No aerial background image set for this location</p>
              <p className="text-xs text-gray-500 max-w-md mt-1">
                You can still place and drag pins on this grid. Add an Image URL in the Locations panel to display custom aerial art here.
              </p>
            </div>
          )}

          {/* Grid lines overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:10%_10%] pointer-events-none" />

          {/* SVG Bezier Path (Single color, no black under-stroke) */}
          {bezierPath && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
              <path
                d={bezierPath}
                stroke={previewColor}
                strokeWidth="3.5"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="4 4"
                fill="none"
                className="animate-pulse"
              />
            </svg>
          )}

          {/* Waypoint dots (drag to move, double-click to remove) */}
          {sortedSubAreas.flatMap(sa => (sa.waypoints ?? []).map((w, i) => (
            <div
              key={`${sa.id}-wp-${i}`}
              onPointerDown={(e) => handleWaypointPointerDown(e, sa, i)}
              onDoubleClick={() => handleRemoveWaypoint(sa, i)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md cursor-grab active:cursor-grabbing z-[15] touch-none ${
                editingSubArea?.id === sa.id ? 'bg-yellow-300' : 'bg-gray-300'
              }`}
              style={{ left: `${w.x}%`, top: `${w.y}%` }}
              title={`Waypoint ${i + 1} to #${sa.order} ${sa.name} (${w.x}%, ${w.y}%) - drag to move, double-click to remove`}
            />
          )))}

          {/* Draggable Pins */}
          {subAreas.map((sa) => {
            const isEditing = editingSubArea?.id === sa.id;
            const isBoss = sa.nodeType === 'boss';
            const isPuzzle = sa.nodeType === 'puzzle';
            const isLore = sa.nodeType === 'lore';
            const icon = isBoss ? '💀' : isPuzzle ? '🧩' : isLore ? '📜' : '⚔️';
            const posX = sa.x ?? 50;
            const posY = sa.y ?? 50;

            return (
              <div
                key={sa.id}
                onPointerDown={(e) => handlePinPointerDown(e, sa)}
                className={`absolute cursor-grab active:cursor-grabbing -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-transform z-20 group ${
                  isEditing ? 'scale-125 z-30' : 'hover:scale-110'
                }`}
                style={{ left: `${posX}%`, top: `${posY}%` }}
                title={`${sa.name} (${posX}%, ${posY}%) - Drag to move`}
              >
                {/* Pin Circle */}
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-xs sm:text-sm shadow-xl border-2 transition-all ${
                  isEditing 
                    ? 'bg-yellow-400 text-gray-950 border-white ring-4 ring-yellow-400/60 animate-bounce' 
                    : isBoss
                    ? 'bg-red-700 text-white border-red-300 ring-2 ring-red-500/50'
                    : isPuzzle
                    ? 'bg-purple-700 text-white border-purple-300 ring-2 ring-purple-500/50'
                    : isLore
                    ? 'bg-emerald-700 text-white border-emerald-300 ring-2 ring-emerald-500/50'
                    : 'bg-amber-600 text-white border-amber-300 ring-2 ring-amber-500/50'
                }`}>
                  {icon}
                </div>

                {/* Pin Tooltip / Badge */}
                <div className="absolute top-full mt-1 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] text-white font-bold whitespace-nowrap pointer-events-none shadow-md border border-white/20">
                  #{sa.order} {sa.name} ({posX}%, {posY}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. SUB-AREAS LIST & FORM GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Sub-Areas List */}
        <div className="md:col-span-1 flex flex-col gap-2 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
            <h3 className="font-bold text-lg pb-2 mb-2 text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-600">
              Sub-Areas in {selectedLocation?.name || '...'}
            </h3>
            <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
                {subAreas.map(sa => (
                    <div 
                      key={sa.id} 
                      onClick={() => selectSubAreaToEdit(sa)} 
                      className={`p-3 rounded-lg transition-all cursor-pointer border ${
                        !isCreating && editingSubArea?.id === sa.id 
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-400 dark:bg-blue-900/40 dark:border-blue-400' 
                          : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            #{sa.order} {sa.name}
                          </span>
                          <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                            {sa.nodeType || 'encounter'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex justify-between items-center">
                          <span>Pos: ({sa.x ?? 50}%, {sa.y ?? 50}%)</span>
                          {sa.imageUrl && <span>🖼️ Art</span>}
                        </div>
                    </div>
                ))}
            </div>
            <TabButton onClick={startNewSubArea} active={isCreating} className="mt-auto">
                + New Sub-Area
            </TabButton>
        </div>

        {/* Right Column: Edit / Create Form */}
        <div className="md:col-span-2 bg-gray-50 dark:bg-gray-700/50 p-6 rounded-xl border border-gray-200 dark:border-gray-600">
            {!editingSubArea ? (
              <div className="text-center text-gray-500 py-10">Select a sub-area to edit or create a new one.</div>
            ) : (
                <>
                    <h3 className="font-bold text-xl mb-4 text-gray-900 dark:text-gray-100">
                      {isCreating ? 'Create New Sub-Area' : `Edit: ${editingSubArea.name}`}
                    </h3>
                     <div className="flex flex-col gap-4">
                        <Input 
                          label="ID (Optional)" 
                          value={editingSubArea.id ?? ''} 
                          onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('id', e.target.value)} 
                          placeholder="auto-generates if empty" 
                          disabled={!isCreating && !!editingSubArea.id}
                        />
                        <Input 
                          label="Name" 
                          value={editingSubArea.name ?? ''} 
                          onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('name', e.target.value)} 
                        />
                        <Input 
                          label="Description" 
                          value={editingSubArea.description ?? ''} 
                          onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('description', e.target.value)} 
                        />
                        <Input 
                          label="Sub-Area Image URL" 
                          value={editingSubArea.imageUrl ?? ''} 
                          onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('imageUrl', e.target.value)} 
                          placeholder="https://..."
                        />
                        <Input 
                          label="Order (Path Sequence)" 
                          type="number" 
                          value={editingSubArea.order ?? 0} 
                          onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('order', Number(e.target.value))} 
                        />

                        {/* Node Type & Coordinates */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                              Node Type
                            </label>
                            <select
                              value={editingSubArea.nodeType || 'encounter'}
                              onChange={(e) => handleFormChange('nodeType', e.target.value as SubAreaNodeType)}
                              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                            >
                              <option value="encounter">⚔️ Encounter</option>
                              <option value="boss">💀 Boss</option>
                              <option value="puzzle">🧩 Puzzle</option>
                              <option value="lore">📜 Lore / Story</option>
                            </select>
                          </div>

                          <div>
                            <Input 
                              label="X Position (5%–95%)" 
                              type="number" 
                              value={editingSubArea.x ?? 50} 
                              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('x', Number(e.target.value))} 
                            />
                          </div>

                          <div>
                            <Input 
                              label="Y Position (5%–95%)" 
                              type="number" 
                              value={editingSubArea.y ?? 50} 
                              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('y', Number(e.target.value))} 
                            />
                          </div>
                        </div>
                        
                        {/* Branching Sub-Area Links */}
                        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                              🔗 Linked Previous Sub-Areas (Branching Paths)
                            </label>
                            <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                              {editingSubArea.previousSubAreaIds && editingSubArea.previousSubAreaIds.length > 0
                                ? `${editingSubArea.previousSubAreaIds.length} custom link(s)`
                                : 'Sequential by Order'}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Select which previous sub-area(s) lead into this node. If none are selected, it defaults to the previous sub-area by Order number.
                          </p>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {subAreas
                              .filter(sa => sa.id !== editingSubArea.id)
                              .map(sa => {
                                const isLinked = (editingSubArea.previousSubAreaIds || []).includes(sa.id);
                                return (
                                  <button
                                    key={sa.id}
                                    type="button"
                                    onClick={() => togglePreviousSubAreaLink(sa.id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                                      isLinked
                                        ? 'bg-amber-500 text-gray-950 border-amber-400 shadow-sm'
                                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-amber-400'
                                    }`}
                                  >
                                    <span>{isLinked ? '✓' : '+'}</span>
                                    <span>#{sa.order} {sa.name}</span>
                                  </button>
                                );
                              })}
                            {subAreas.filter(sa => sa.id !== editingSubArea.id).length === 0 && (
                              <span className="text-xs text-gray-400 italic">No other sub-areas available to link.</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                        
                        {/* BOOLEAN FLAG LOGIC SECTION */}
                        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                <span>🚩</span> Required Story Flags & Boolean Logic
                              </h4>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                Group required flags with AND / OR logic, e.g. <span className="font-mono text-amber-500">(A OR B) AND C</span> or <span className="font-mono text-amber-500">(A AND B) OR D</span>.
                              </p>
                            </div>

                            {/* Root Operator Switch */}
                            <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-900 p-1 rounded-lg border border-gray-300 dark:border-gray-700 self-start sm:self-auto">
                              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 px-1 uppercase">Root:</span>
                              <button
                                type="button"
                                onClick={() => handleRootOperatorChange('AND')}
                                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                                  flagLogicState.rootOperator === 'AND'
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-white'
                                }`}
                              >
                                ALL (AND)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRootOperatorChange('OR')}
                                className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
                                  flagLogicState.rootOperator === 'OR'
                                    ? 'bg-purple-600 text-white shadow-xs'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-white'
                                }`}
                              >
                                ANY (OR)
                              </button>
                            </div>
                          </div>

                          {/* Live Formula Badge Preview */}
                          <div className="flex items-center gap-2 bg-gray-950 p-2.5 rounded-lg border border-gray-700 text-xs font-mono">
                            <span className="text-gray-400 shrink-0 font-bold">Live Formula:</span>
                            <span className="text-yellow-400 font-bold overflow-x-auto truncate">
                              {flagExpressionInput.trim() || 'No flag requirements (Open to all)'}
                            </span>
                          </div>

                          {/* Direct Formula Editor */}
                          <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">
                              Direct Expression (Editable String):
                            </label>
                            <input
                              type="text"
                              value={flagExpressionInput}
                              onChange={(e) => setFlagExpressionInput(e.target.value)}
                              onBlur={handleExpressionInputBlur}
                              placeholder="e.g. (FOUND_KEY OR TALKED_TO_ELDER) AND DEFEATED_GOBLIN"
                              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>

                          {/* Groups List */}
                          <div className="space-y-2.5 pt-1">
                            {flagLogicState.groups.map((group, gIdx) => (
                              <div
                                key={group.id || gIdx}
                                className="p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 shadow-xs space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 font-mono">Group #{gIdx + 1}</span>
                                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded border border-gray-300 dark:border-gray-600 text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() => handleGroupOperatorChange(group.id!, 'OR')}
                                        className={`px-1.5 py-0.5 rounded font-bold ${
                                          group.operator === 'OR' ? 'bg-purple-600 text-white' : 'text-gray-400'
                                        }`}
                                      >
                                        OR
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleGroupOperatorChange(group.id!, 'AND')}
                                        className={`px-1.5 py-0.5 rounded font-bold ${
                                          group.operator === 'AND' ? 'bg-blue-600 text-white' : 'text-gray-400'
                                        }`}
                                      >
                                        AND
                                      </button>
                                    </div>
                                    <span className="text-[10px] text-gray-400">
                                      ({group.operator === 'OR' ? 'Requires ANY of these' : 'Requires ALL of these'})
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFlagGroup(group.id!)}
                                    className="text-xs text-red-500 hover:text-red-700 font-bold"
                                  >
                                    ✕ Remove Group
                                  </button>
                                </div>

                                {/* Flag Pills in this group */}
                                <div className="flex flex-wrap gap-1.5">
                                  {group.flags.map((flag, fIdx) => (
                                    <span
                                      key={`${flag}-${fIdx}`}
                                      className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60 font-mono text-xs flex items-center gap-1.5"
                                    >
                                      <span>{flag}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFlagFromGroup(group.id!, fIdx)}
                                        className="text-amber-600 hover:text-red-500 font-bold"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                  {group.flags.length === 0 && (
                                    <span className="text-xs text-gray-400 italic">No flags in this group yet.</span>
                                  )}
                                </div>

                                {/* Add flag to this group input */}
                                <div className="flex gap-2 pt-1">
                                  <input
                                    type="text"
                                    value={newFlagInputs[group.id!] || ''}
                                    onChange={(e) => setNewFlagInputs(prev => ({ ...prev, [group.id!]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddFlagToGroup(group.id!);
                                      }
                                    }}
                                    placeholder="Type flag and press Enter (e.g. HAS_SUMMIT_KEY)"
                                    className="flex-1 px-2.5 py-1 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAddFlagToGroup(group.id!)}
                                    className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs rounded transition-colors"
                                  >
                                    + Add Flag
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={handleAddFlagGroup}
                            className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-amber-400 dark:hover:border-amber-400 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-amber-500 transition-colors flex items-center justify-center gap-1.5"
                          >
                            <span>➕</span> Add Flag Group
                          </button>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Skill Requirements (Optional)</h4>

                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                            {allPossibleSkills.map(skillName => (
                                <Input 
                                    key={skillName}
                                    label={`Min ${skillName}`}
                                    type="number"
                                    value={editingSubArea.unlockRequirements?.skills?.[skillName] || ''}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleSkillChange(skillName, e.target.value)}
                                    placeholder="Level"
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button 
                          onClick={handleSave} 
                          className="flex-grow px-5 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-md"
                        >
                            {isCreating ? 'Create Sub-Area' : 'Save Changes'}
                        </button>
                        {!isCreating && editingSubArea.id && (
                            <button 
                              onClick={() => handleDelete(editingSubArea.id!)} 
                              className="px-5 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-md"
                            >
                                Delete
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
      </div>
    </div>
  );
}

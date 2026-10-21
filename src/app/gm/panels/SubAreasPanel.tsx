'use client';
import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, orderBy, addDoc, updateDoc } from 'firebase/firestore';
import { GameLocation, SubArea, CharacterSkills, SubAreaNodeType } from '@/types/game';
import { Input } from '@/app/gm/components/Input';
import { TabButton } from '@/app/gm/components/TabButton';

export default function SubAreasPanel() {
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const [editingSubArea, setEditingSubArea] = useState<Partial<SubArea> | null>(null);
  const [storyFlagsInput, setStoryFlagsInput] = useState('');
  const [isCreating, setIsCreating] = useState(true);

  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'locations'), orderBy('order'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameLocation));
      setLocations(fetchedLocations);
      if (!selectedLocationId && fetchedLocations.length > 0) {
        setSelectedLocationId(fetchedLocations[0].id);
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
    }, (error) => {
      console.error(`Error fetching sub-areas for location ${selectedLocationId}:`, error);
      setSubAreas([]);
    });

    return () => unsubscribe();
  }, [selectedLocationId]);

  const selectSubAreaToEdit = (sa: SubArea) => {
    setIsCreating(false);
    setEditingSubArea(JSON.parse(JSON.stringify(sa)));
    setStoryFlagsInput(sa.unlockRequirements?.storyFlags?.join(', ') ?? '');
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
        unlockRequirements: { skills: {} }
    });
    setStoryFlagsInput('');
  };

  const handleFormChange = (field: keyof SubArea, value: any) => {
    setEditingSubArea(prev => prev ? { ...prev, [field]: value } : null);
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

    const flags = storyFlagsInput.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (flags.length > 0) {
        subAreaToSave.unlockRequirements = {
            ...(subAreaToSave.unlockRequirements || {}),
            storyFlags: flags
        };
    } else if (subAreaToSave.unlockRequirements) {
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

  // Compute SVG Bezier path between sorted sub-areas
  const sortedSubAreas = [...subAreas].sort((a, b) => a.order - b.order);
  let bezierPath = '';
  if (sortedSubAreas.length >= 2) {
    bezierPath = `M ${sortedSubAreas[0].x ?? 50} ${sortedSubAreas[0].y ?? 50}`;
    for (let i = 0; i < sortedSubAreas.length - 1; i++) {
      const p1 = sortedSubAreas[i];
      const p2 = sortedSubAreas[i + 1];
      const dx = (p2.x ?? 50) - (p1.x ?? 50);
      const cp1x = (p1.x ?? 50) + dx * 0.45;
      const cp1y = p1.y ?? 50;
      const cp2x = (p1.x ?? 50) + dx * 0.55;
      const cp2y = p2.y ?? 50;
      bezierPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x ?? 50} ${p2.y ?? 50}`;
    }
  }

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const allPossibleSkills: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];

  const handlePathColorChange = async (color: string) => {
    if (!selectedLocationId) return;
    try {
      await updateDoc(doc(db, 'locations', selectedLocationId), {
        pathColor: color,
      });
      setLocations(prev => prev.map(loc => loc.id === selectedLocationId ? { ...loc, pathColor: color } : loc));
    } catch (err) {
      console.error("Failed to update path color:", err);
    }
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
              onClick={() => { setSelectedLocationId(loc.id); startNewSubArea(); }} 
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
                  value={selectedLocation.pathColor || '#fbbf24'}
                  onChange={(e) => handlePathColorChange(e.target.value)}
                  className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent"
                  title="Choose custom path color"
                />
                <input
                  type="text"
                  value={selectedLocation.pathColor || '#fbbf24'}
                  onChange={(e) => handlePathColorChange(e.target.value)}
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
                    (selectedLocation.pathColor || '#fbbf24').toLowerCase() === preset.color.toLowerCase()
                      ? 'ring-2 ring-white scale-110'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
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
                stroke={selectedLocation?.pathColor || '#fbbf24'}
                strokeWidth="3.5"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="4 4"
                fill="none"
                className="animate-pulse"
              />
            </svg>
          )}

          {/* Draggable Pins */}
          {subAreas.map((sa) => {
            const isEditing = editingSubArea?.id === sa.id;
            const isBoss = sa.nodeType === 'boss';
            const isPuzzle = sa.nodeType === 'puzzle';
            const isLore = sa.nodeType === 'lore';
            const icon = isBoss ? '💀' : isPuzzle ? '🧩' : isLore ? '📜' : (sa.order || '⚔️');
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
                        
                        <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Unlock Requirements (Optional)</h4>
                        
                        <Input 
                            label="Story Flags (comma-separated)" 
                            value={storyFlagsInput} 
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setStoryFlagsInput(e.target.value)} 
                            placeholder="DEFEATED_GOBLIN_KING, FOUND_KEY"
                        />

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

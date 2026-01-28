"use client";
import { useState, useEffect, ChangeEvent } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { GameLocation, CharacterSkills } from '@/types/game';
import { Input } from '@/app/gm/components/Input';

export function LocationsPanel() {
    const [locs, setLocs] = useState<GameLocation[]>([]);
    const [editingLocation, setEditingLocation] = useState<Partial<GameLocation> | null>(null);
    const [storyFlagsInput, setStoryFlagsInput] = useState('');
    const [isCreating, setIsCreating] = useState(true);
    const [msg, setMsg] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    // Effect for fetching locations
    useEffect(() => {
        const q = query(collection(db, 'locations'), orderBy('order'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameLocation));
            setLocs(fetchedLocations);
        });
        return () => unsubscribe();
    }, []);

    const visibleLocs = locs.filter(l => 
      l.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectLocationToEdit = (loc: GameLocation) => {
        setIsCreating(false);
        setEditingLocation(JSON.parse(JSON.stringify(loc)));
        setStoryFlagsInput(loc.unlockRequirements?.storyFlags?.join(', ') ?? '');
        setMsg(`✏️ Editing: ${loc.name}`);
    };

    const startNewLocation = () => {
        setIsCreating(true);
        setEditingLocation({
            id: '', name: '', description: '', order: locs.length + 1,
            unlockRequirements: { skills: {} }
        });
        setStoryFlagsInput('');
        setMsg("Creating a new location");
    };
    
    // Initialize the form when the component loads
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
        <div className="grid md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 dark:text-gray-100 p-6 rounded-xl border dark:border-gray-700 shadow-sm transition-colors">
            <div className="space-y-4">
                <div className="flex justify-between items-start">
                    <h2 className="font-bold text-xl">{isCreating ? "Create Map Location" : "Edit Location"}</h2>
                    <button onClick={startNewLocation} className="text-sm font-bold text-blue-500 hover:text-blue-400">
                        + New
                    </button>
                </div>


                {msg && <div className="text-green-600 dark:text-green-400 text-sm font-bold">{msg}</div>}

                {editingLocation && (
                    <>
                        <Input label="ID" value={editingLocation.id ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('id', e.target.value)} placeholder="unique-location-id" disabled={!isCreating}/>
                        <Input label="Location Name" value={editingLocation.name ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('name', e.target.value)} />
                        <Input label="Description" value={editingLocation.description ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('description', e.target.value)} />
                        <Input type="number" label="Order (1, 2, 3...)" value={editingLocation.order ?? 1} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('order', Number(e.target.value))} />
                        <Input label="Image URL" value={editingLocation.imageUrl ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('imageUrl', e.target.value)} />

                        <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                        <h4 className="font-bold">Unlock Requirements (Optional)</h4>

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

                        <div className="flex gap-2">
                            <button onClick={handleSave} className="btn-primary flex-1 bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-2 rounded-lg font-bold">
                                {isCreating ? "Save" : "Update"}
                            </button>
                            {!isCreating && (
                                <button onClick={() => handleDelete(editingLocation.id!)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200">
                                    Delete
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="space-y-4 border-l dark:border-gray-700 pl-4">
                <div>
                    <input
                        className="input w-full text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        placeholder="🔍 Search Locations..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                    <h2 className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase">Library ({visibleLocs.length})</h2>
                    {visibleLocs.map(l => (
                        <div
                            key={l.id}
                            onClick={() => selectLocationToEdit(l)}
                            className={`p-3 border rounded flex justify-between cursor-pointer transition-colors 
                                ${!isCreating && editingLocation?.id === l.id
                                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400'
                                    : 'bg-white dark:bg-gray-800 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`
                            }
                        >
                            <div>
                                <span className="font-bold mr-2 dark:text-gray-100">{l.order}. {l.name}</span>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{l.description}</div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(l.id!); }} className="text-xs text-red-400 font-bold hover:text-red-600 dark:hover:text-red-300">Delete</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
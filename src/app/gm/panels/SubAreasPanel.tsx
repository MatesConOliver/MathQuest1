"use client";
import { useState, useEffect, ChangeEvent } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { GameLocation, SubArea, CharacterSkills } from '@/types/game';
import { Input } from '@/app/gm/components/Input';
import { TabButton } from '@/app/gm/components/TabButton';

const SubAreasPanel = () => {
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // State for the form, separated for clarity
  const [editingSubArea, setEditingSubArea] = useState<Partial<SubArea> | null>(null);
  const [storyFlagsInput, setStoryFlagsInput] = useState('');
  const [isCreating, setIsCreating] = useState(true);

  // Effect for fetching locations
  useEffect(() => {
    const q = query(collection(db, 'locations'), orderBy('order'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameLocation));
      setLocations(fetchedLocations);
      // If no location is selected yet, and we have locations, select the first one.
      if (!selectedLocationId && fetchedLocations.length > 0) {
        setSelectedLocationId(fetchedLocations[0].id);
      }
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []); // Empty dependency array means this runs once on mount

  // Effect for fetching sub-areas based on selected location
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

    return () => unsubscribe(); // Cleanup subscription when selectedLocationId changes or on unmount
  }, [selectedLocationId]); // Reruns whenever selectedLocationId changes

  const selectSubAreaToEdit = (sa: SubArea) => {
    setIsCreating(false);
    setEditingSubArea(JSON.parse(JSON.stringify(sa)));
    setStoryFlagsInput(sa.unlockRequirements?.storyFlags?.join(', ') ?? '');
  };

  const startNewSubArea = () => {
    setIsCreating(true);
    setEditingSubArea({
        id: '', name: '', description: '', order: subAreas.length + 1,
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
    if (!editingSubArea || !editingSubArea.id || !editingSubArea.name || !selectedLocationId) {
      alert("Sub-Area ID, Name, and a parent Location are required.");
      return;
    }

    const subAreaToSave: Partial<SubArea> = JSON.parse(JSON.stringify(editingSubArea));

    // Handle story flags from the separate input state
    const flags = storyFlagsInput.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (flags.length > 0) {
        subAreaToSave.unlockRequirements = {
            ...(subAreaToSave.unlockRequirements || {}),
            storyFlags: flags
        };
    } else if (subAreaToSave.unlockRequirements) {
        delete subAreaToSave.unlockRequirements.storyFlags;
    }
    
    // Clean up empty skills object
    if (subAreaToSave.unlockRequirements?.skills && Object.keys(subAreaToSave.unlockRequirements.skills).length === 0) {
        delete subAreaToSave.unlockRequirements.skills;
    }

    // Clean up empty unlockRequirements object
    if (subAreaToSave.unlockRequirements && Object.keys(subAreaToSave.unlockRequirements).length === 0) {
        delete subAreaToSave.unlockRequirements;
    }
    
    const { id, ...data } = subAreaToSave;

    await setDoc(doc(db, 'subAreas', id!),
      { ...data, locationId: selectedLocationId }
    );
    
    startNewSubArea(); // Reset form after save
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this sub-area? This action cannot be undone.')) {
      await deleteDoc(doc(db, 'subAreas', id));
      startNewSubArea();
    }
  };

  const allPossibleSkills: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];

  return (
    <div className="flex flex-col gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
        {locations.map(loc => (
          <TabButton key={loc.id} onClick={() => { setSelectedLocationId(loc.id); startNewSubArea(); }} active={selectedLocationId === loc.id}>
            {loc.name}
          </TabButton>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 flex flex-col gap-2 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
            <h3 className="font-bold text-lg pb-2 mb-2 text-gray-900 dark:text-gray-100">Sub-Areas in {locations.find(l=>l.id === selectedLocationId)?.name || '...'}</h3>
            <div className={"flex flex-col gap-2"}>
                {subAreas.map(sa => (
                    <div key={sa.id} onClick={() => selectSubAreaToEdit(sa)} className={`p-3 rounded transition-colors duration-200 cursor-pointer border ${!isCreating && editingSubArea?.id === sa.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600'}`}>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{sa.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Order: {sa.order}</span>
                    </div>
                ))}
            </div>
            <TabButton onClick={startNewSubArea} active={isCreating} className="mt-auto">
                + New Sub-Area
            </TabButton>
        </div>

        <div className="md:col-span-2 bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
            {!editingSubArea ? <div className="text-center text-gray-500 py-10">Select a sub-area to edit or create a new one.</div> : (
                <>
                    <h3 className="font-bold text-xl mb-4 text-gray-900 dark:text-gray-100">{isCreating ? 'Create New Sub-Area' : `Edit: ${editingSubArea.name}`}</h3>
                     <div className="flex flex-col gap-4">
                        <Input label="ID" value={editingSubArea.id ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('id', e.target.value)} placeholder="unique-sub-area-id" disabled={!isCreating}/>
                        <Input label="Name" value={editingSubArea.name ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('name', e.target.value)} />
                        <Input label="Description" value={editingSubArea.description ?? ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('description', e.target.value)} />
                        <Input label="Order" type="number" value={editingSubArea.order ?? 0} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFormChange('order', Number(e.target.value))} />
                        
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
                                    value={editingSubArea.unlockRequirements?.skills?.[skillName] || ''}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleSkillChange(skillName, e.target.value)}
                                    placeholder="Level"
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-4 mt-6">
                        <button onClick={handleSave} className="flex-grow px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors duration-200">
                            {isCreating ? 'Create Sub-Area' : 'Save Changes'}
                        </button>
                        {!isCreating && editingSubArea.id && (
                            <button onClick={() => handleDelete(editingSubArea.id!)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200">
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
};

export default SubAreasPanel;
"use client";
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { GameLocation, SubArea, CharacterSkills } from '@/types/game';
import { Input } from '@/app/gm/components/Input';
import { TabButton } from '@/app/gm/components/TabButton';

const SubAreasPanel = () => {
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [subAreas, setSubAreas] = useState<SubArea[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedSubArea, setSelectedSubArea] = useState<Partial<SubArea> | null>(null);
  
  const getInitialNewSubArea = (): Partial<SubArea> => ({
    id: '',
    name: '',
    description: '',
    order: 0,
    unlockRequirements: {
      storyFlags: [],
      skills: {},
    },
  });
  const [newSubArea, setNewSubArea] = useState<Partial<SubArea>>(getInitialNewSubArea());

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'locations'), orderBy('order')), (snapshot) => {
      const locs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GameLocation));
      setLocations(locs);
      if (!selectedLocationId && locs.length > 0) {
        setSelectedLocationId(locs[0].id);
      }
    });
    return () => unsub();
  }, [selectedLocationId]);

  useEffect(() => {
    if (!selectedLocationId) {
      setSubAreas([]);
      return;
    }

    const q = query(collection(db, 'subAreas'), where('locationId', '==', selectedLocationId), orderBy('order'));
    const unsub = onSnapshot(q, (snapshot) => {
      const areas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubArea));
      setSubAreas(areas);
    });
    return () => unsub();
  }, [selectedLocationId]);

  const handleSave = async () => {
    let subAreaToSave = JSON.parse(JSON.stringify(selectedSubArea || newSubArea));

    if (!subAreaToSave.id || !subAreaToSave.name || !selectedLocationId) {
      alert("Sub-Area ID, Name, and a parent Location are required.");
      return;
    }
    
    if (subAreaToSave.unlockRequirements?.storyFlags) {
        subAreaToSave.unlockRequirements.storyFlags = subAreaToSave.unlockRequirements.storyFlags.filter(Boolean);
    }

    if (subAreaToSave.unlockRequirements) {
        if (subAreaToSave.unlockRequirements.storyFlags?.length === 0) {
            delete subAreaToSave.unlockRequirements.storyFlags;
        }
        if (subAreaToSave.unlockRequirements.skills && Object.values(subAreaToSave.unlockRequirements.skills).every(v => v === 0 || v === null || v === undefined)) {
            delete subAreaToSave.unlockRequirements.skills;
        }
        if (Object.keys(subAreaToSave.unlockRequirements).length === 0) {
            delete subAreaToSave.unlockRequirements;
        }
    }

    const { id, ...data } = subAreaToSave;

    await setDoc(doc(db, 'subAreas', id!),
      {
        ...data,
        locationId: selectedLocationId,
      },
      { merge: true }
    );

    if (!selectedSubArea) {
      setNewSubArea(getInitialNewSubArea());
    }
    setSelectedSubArea(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this sub-area? This action cannot be undone.')) {
      await deleteDoc(doc(db, 'subAreas', id));
      setSelectedSubArea(null);
    }
  };
  
  const renderSubAreaForm = (subArea: Partial<SubArea>, setSubArea: (sa: Partial<SubArea>) => void) => {
    const isNew = !selectedSubArea;

    const handleSkillChange = (skill: keyof CharacterSkills, value: string) => {
        const level = Number(value);
        const currentSkills = subArea.unlockRequirements?.skills || {};
        const updatedSkills = { ...currentSkills };

        if (!isNaN(level) && level > 0) {
            updatedSkills[skill] = level;
        } else {
            delete updatedSkills[skill];
        }

        setSubArea({
            ...subArea,
            unlockRequirements: {
                ...subArea.unlockRequirements,
                skills: updatedSkills,
            },
        });
    };
    const allPossibleSkills: (keyof CharacterSkills)[] = ['algebra', 'calculus', 'functions', 'geometry', 'probabilityAndStatistics'];

    return (
        <div className="flex flex-col gap-4">
            <Input label="ID" value={subArea.id ?? ''} onChange={(e) => setSubArea({ ...subArea, id: e.target.value })} placeholder="unique-sub-area-id" disabled={!isNew}/>
            <Input label="Name" value={subArea.name ?? ''} onChange={(e) => setSubArea({ ...subArea, name: e.target.value })} />
            <Input label="Description" value={subArea.description ?? ''} onChange={(e) => setSubArea({ ...subArea, description: e.target.value })} />
            <Input label="Order" type="number" value={subArea.order ?? 0} onChange={(e) => setSubArea({ ...subArea, order: Number(e.target.value) })} />
            
            <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
            <h4 className="font-bold">Unlock Requirements (Optional)</h4>
            <Input 
                label="Story Flags (comma-separated)" 
                value={subArea.unlockRequirements?.storyFlags?.join(', ') ?? ''} 
                onChange={(e) => setSubArea({ ...subArea, unlockRequirements: { ...subArea.unlockRequirements, storyFlags: e.target.value.split(',').map(s => s.trim()) }})} 
                placeholder="FLAG_A, FLAG_B"
            />

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                {allPossibleSkills.map(skillName => (
                    <Input 
                        key={skillName}
                        label={`Min ${skillName}`}
                        type="number"
                        value={subArea.unlockRequirements?.skills?.[skillName] || ''}
                        onChange={(e) => handleSkillChange(skillName, e.target.value)}
                        placeholder="Level"
                    />
                ))}
            </div>

        </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
        {locations.map(loc => (
          <TabButton key={loc.id} onClick={() => { setSelectedLocationId(loc.id); setSelectedSubArea(null); }} active={selectedLocationId === loc.id}>
            {loc.name}
          </TabButton>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 flex flex-col gap-2 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
             <h3 className="font-bold text-lg pb-2 mb-2 text-gray-900 dark:text-gray-100">Sub-Areas in {locations.find(l=>l.id === selectedLocationId)?.name || '...'}</h3>
            <div className="flex flex-col gap-2 mt-2">
                {subAreas.map(sa => (
                    <div key={sa.id} onClick={() => setSelectedSubArea(JSON.parse(JSON.stringify(sa)))} className={`p-3 rounded transition-colors duration-200 cursor-pointer border ${selectedSubArea?.id === sa.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/30 dark:border-blue-400' : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-600'}`}>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{sa.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Order: {sa.order}</span>
                    </div>
                ))}
            </div>
            <TabButton onClick={() => setSelectedSubArea(null)} active={selectedSubArea === null} className="mt-auto">
                + New Sub-Area
            </TabButton>
        </div>

        <div className="md:col-span-2 bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
            {selectedSubArea ? (
                <div>
                    <h3 className="font-bold text-xl mb-4 text-gray-900 dark:text-gray-100">Edit: {selectedSubArea.name}</h3>
                    {renderSubAreaForm(selectedSubArea, (sa) => setSelectedSubArea(sa))}
                </div>
            ) : (
                <div>
                    <h3 className="font-bold text-xl mb-4 text-gray-900 dark:text-gray-100">Create New Sub-Area</h3>
                    {renderSubAreaForm(newSubArea, (sa) => setNewSubArea(sa))}
                </div>
            )}
            <div className="flex gap-4 mt-6">
                <button onClick={handleSave} className="flex-grow px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors duration-200">
                    {selectedSubArea ? 'Save Changes' : 'Create Sub-Area'}
                </button>
                {selectedSubArea?.id && (
                    <button onClick={() => handleDelete(selectedSubArea.id!)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200">
                        Delete
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default SubAreasPanel;

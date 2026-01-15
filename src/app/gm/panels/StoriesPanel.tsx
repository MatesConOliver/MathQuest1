'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
} from 'firebase/firestore';
import { StoryEvent, StoryTrigger, StoryScene } from '@/types/game';
import { Input } from '@/app/gm/components/Input';

export function StoriesPanel() {
  const [stories, setStories] = useState<StoryEvent[]>([]);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // --- Form States ---
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [triggerType, setTriggerType] = useState<StoryTrigger>('ON_LOGIN');
  const [triggerCondition, setTriggerCondition] = useState(''); // e.g., 'rat_king_id'
  const [oneTime, setOneTime] = useState(true);

  // Scenes Management
  const [scenes, setScenes] = useState<StoryScene[]>([]);

  // Rewards
  const [rewardXp, setRewardXp] = useState(0);
  const [rewardGold, setRewardGold] = useState(0);
  const [unlockMapId, setUnlockMapId] = useState('');

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    try {
      const q = query(collection(db, 'stories'));
      const snap = await getDocs(q);
      setStories(
        snap.docs.map(
          (d) => ({ ...d.data(), id: d.id } as StoryEvent)
        )
      );
    } catch (e: any) {
      setMsg('Error loading stories: ' + e.message);
    }
  }

  function resetForm() {
    setEditingId('');
    setId('');
    setTitle('');
    setTriggerType('ON_LOGIN');
    setTriggerCondition('');
    setOneTime(true);
    setScenes([]);
    setRewardXp(0);
    setRewardGold(0);
    setUnlockMapId('');
    setMsg('');
  }

  function loadStoryToEdit(s: StoryEvent) {
    setEditingId(s.id);
    setId(s.id);
    setTitle(s.title);
    setTriggerType(s.triggerType);
    setTriggerCondition(s.triggerCondition || '');
    setOneTime(s.oneTime);
    setScenes(s.scenes || []);
    setRewardXp(s.rewards?.xp || 0);
    setRewardGold(s.rewards?.gold || 0);
    setUnlockMapId(s.rewards?.unlockMapId || '');
  }

  // --- Scene Helpers ---
  function addScene() {
    const newSceneId = `scene_${scenes.length + 1}`;
    const newScene: StoryScene = {
      id: newSceneId,
      text: 'New dialogue...',
      speakerName: 'Narrator',
      nextSceneId: 'END',
      fadeIn: true,
      fadeOut: true,
    };

    const newScenes = [...scenes];
    // If there are existing scenes, update the last one to point to this new one.
    if (newScenes.length > 0) {
      newScenes[newScenes.length - 1].nextSceneId = newSceneId;
    }

    setScenes([...newScenes, newScene]);
  }

  function updateScene(index: number, field: keyof StoryScene, value: any) {
    const copy = [...scenes];
    copy[index] = { ...copy[index], [field]: value };
    setScenes(copy);
  }

  function deleteScene(index: number) {
    const copy = [...scenes];
    copy.splice(index, 1);
    setScenes(copy);
  }

  async function saveStory() {
    if (!id || !title) return setMsg('ID and Title are required.');
    setMsg('Saving...');

    const docData: StoryEvent = {
      id,
      title,
      triggerType,
      triggerCondition,
      oneTime,
      scenes,
      rewards: {
        xp: rewardXp || 0,
        gold: rewardGold || 0,
        ...(unlockMapId && { unlockMapId }),
      },
    };

    try {
      await setDoc(doc(db, 'stories', id), docData);
      setMsg('✅ Story Saved!');
      if (!editingId) resetForm();
      loadStories();
    } catch (e: any) {
      setMsg('Error: ' + e.message);
    }
  }

  async function deleteStory(sId: string) {
    if (!confirm('Delete this story?')) return;
    await deleteDoc(doc(db, 'stories', sId));
    loadStories();
  }

  return (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700'>
      {/* LEFT: FORM */}
      <div className='space-y-6'>
        <div className='flex justify-between items-center'>
          <h2 className='text-xl font-bold'>
            {editingId ? '✏️ Edit Story' : '📖 New Story'}
          </h2>
          <button
            onClick={resetForm}
            className='text-xs underline text-gray-500'
          >
            Reset
          </button>
        </div>

        {msg && (
          <div className='p-2 bg-blue-100 text-blue-800 rounded text-center text-sm font-bold'>
            {msg}
          </div>
        )}

        <div className='grid grid-cols-2 gap-4'>
          <Input
            label='Story ID (Unique)'
            value={id}
            onChange={(e: any) => setId(e.target.value)}
            disabled={!!editingId}
          />
          <Input
            label='Title (Internal)'
            value={title}
            onChange={(e: any) => setTitle(e.target.value)}
          />
        </div>

        <div className='p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3 border dark:border-gray-600'>
          <h3 className='text-xs font-bold uppercase text-gray-400'>
            Trigger Logic
          </h3>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <label className='text-xs font-bold text-gray-500 uppercase'>
                Trigger Type
              </label>
              <select
                className='w-full p-2 rounded border text-sm dark:bg-gray-800 dark:border-gray-600'
                value={triggerType}
                onChange={(e: any) => setTriggerType(e.target.value)}
              >
                <option value='ON_LOGIN'>ON_LOGIN (Start of game)</option>
                <option value='ON_ENTER_MAP'>
                  ON_ENTER_MAP (Specific Location)
                </option>
                <option value='ON_VICTORY'>ON_VICTORY (After Fight)</option>
                <option value='ON_DEFEAT'>ON_DEFEAT (After Loss)</option>
                <option value='ON_LEVEL_UP'>ON_LEVEL_UP (XP Milestone)</option>
                <option value='ON_OBJECT_CONDITIONS'>
                  ON_OBJECT_CONDITIONS
                </option>
              </select>
            </div>
            <Input
              label="Condition ID (e.g. 'rat_king')"
              value={triggerCondition}
              onChange={(e: any) => setTriggerCondition(e.target.value)}
            />
          </div>
          <label className='flex items-center gap-2 text-sm cursor-pointer'>
            <input
              type='checkbox'
              checked={oneTime}
              onChange={(e) => setOneTime(e.target.checked)}
            />
            <span>Play Only Once? (Recommended)</span>
          </label>
        </div>

        {/* SCENES EDITOR */}
        <div className='space-y-2'>
          <div className='flex justify-between items-end'>
            <h3 className='font-bold text-lg'>🎬 Scenes ({scenes.length})</h3>
            <button
              onClick={addScene}
              className='text-xs bg-black text-white px-2 py-1 rounded hover:bg-gray-800'
            >
              + Add Scene
            </button>
          </div>

          <div className='space-y-4 max-h-[400px] overflow-y-auto pr-2 border-t pt-4 dark:border-gray-700'>
            {scenes.map((scene, idx) => (
              <div
                key={idx}
                className='p-3 border rounded-xl bg-gray-50 dark:bg-gray-900/30 dark:border-gray-600 space-y-2 relative'
              >
                <div className='absolute top-2 right-2'>
                  <button
                    onClick={() => deleteScene(idx)}
                    className='text-red-400 hover:text-red-600 font-bold text-xs'
                  >
                    ✕
                  </button>
                </div>

                <div className='grid grid-cols-3 gap-2'>
                  <Input
                    label='Speaker'
                    value={scene.speakerName}
                    onChange={(e: any) =>
                      updateScene(idx, 'speakerName', e.target.value)
                    }
                  />
                  <div className='col-span-2'>
                    <Input
                      label='Sprite URL (Optional)'
                      value={scene.speakerSprite}
                      onChange={(e: any) =>
                        updateScene(idx, 'speakerSprite', e.target.value)
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className='text-xs font-bold text-gray-500 uppercase'>
                    Dialogue Text
                  </label>
                  <textarea
                    className='w-full p-2 border rounded text-sm h-20 dark:bg-gray-800 dark:border-gray-600'
                    value={scene.text}
                    onChange={(e) => updateScene(idx, 'text', e.target.value)}
                  />
                </div>

                <div className='grid grid-cols-2 gap-2'>
                  <Input
                    label='Background URL'
                    value={scene.backgroundUrl}
                    onChange={(e: any) =>
                      updateScene(idx, 'backgroundUrl', e.target.value)
                    }
                  />
                  <Input
                    label='Music URL'
                    value={scene.musicUrl}
                    onChange={(e: any) =>
                      updateScene(idx, 'musicUrl', e.target.value)
                    }
                  />
                </div>

                <div className='pt-2'>
                  <Input
                    label='Video URL'
                    value={scene.videoUrl}
                    onChange={(e: any) =>
                      updateScene(idx, 'videoUrl', e.target.value)
                    }
                  />
                </div>

                <div className='flex gap-4 pt-2'>
                  <label className='flex items-center gap-2 text-sm cursor-pointer'>
                    <input
                      type='checkbox'
                      checked={scene.fadeIn ?? true}
                      onChange={(e) =>
                        updateScene(idx, 'fadeIn', e.target.checked)
                      }
                    />
                    <span>Fade In</span>
                  </label>
                  <label className='flex items-center gap-2 text-sm cursor-pointer'>
                    <input
                      type='checkbox'
                      checked={scene.fadeOut ?? true}
                      onChange={(e) =>
                        updateScene(idx, 'fadeOut', e.target.checked)
                      }
                    />
                    <span>Fade Out</span>
                  </label>
                </div>

                <div className='pt-2 border-t dark:border-gray-700'>
                  <Input
                    label="Next Scene ID (Leave empty for 'Next in List')"
                    value={scene.nextSceneId}
                    onChange={(e: any) =>
                      updateScene(idx, 'nextSceneId', e.target.value)
                    }
                  />
                </div>
              </div>
            ))}
            {scenes.length === 0 && (
              <p className='text-gray-400 text-sm text-center'>No scenes yet.</p>
            )}
          </div>
        </div>

        {/* REWARDS */}
        <div className='p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-100 dark:border-yellow-800'>
          <h3 className='text-xs font-bold uppercase text-yellow-600 mb-2'>
            Completion Rewards
          </h3>
          <div className='grid grid-cols-3 gap-2'>
            <Input
              label='XP'
              type='number'
              value={rewardXp}
              onChange={(e: any) => setRewardXp(Number(e.target.value))}
            />
            <Input
              label='Gold'
              type='number'
              value={rewardGold}
              onChange={(e: any) => setRewardGold(Number(e.target.value))}
            />
            <Input
              label='Unlock Map ID'
              value={unlockMapId}
              onChange={(e: any) => setUnlockMapId(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={saveStory}
          className='w-full py-3 bg-black text-white dark:bg-white dark:text-black rounded-xl font-bold text-lg hover:opacity-90'
        >
          💾 Save Story Event
        </button>
      </div>

      {/* RIGHT: LIST */}
      <div className='border-l pl-6 dark:border-gray-700 space-y-4'>
        <h3 className='font-bold text-gray-400 uppercase text-xs'>
          Existing Stories
        </h3>
        <input
          className='w-full p-2 border rounded text-sm mb-4 dark:bg-gray-800 dark:border-gray-600'
          placeholder='Search stories...'
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className='space-y-2 h-[600px] overflow-y-auto'>
          {stories
            .filter((s) =>
              s.title.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((s) => (
              <div
                key={s.id}
                onClick={() => loadStoryToEdit(s)}
                className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  editingId === s.id
                    ? 'border-black ring-1 ring-black dark:border-white'
                    : 'dark:border-gray-600'
                }`}>
                <div className='flex justify-between items-start'>
                  <div>
                    <div className='font-bold text-sm'>{s.title}</div>
                    <div className='text-xs text-gray-500 font-mono mt-1'>
                      {s.id}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                      s.oneTime
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-green-100 text-green-600'
                    }`}>
                    {s.triggerType}
                  </span>
                </div>
                <div className='mt-2 text-xs text-gray-400'>
                  {s.scenes?.length || 0} Scenes • Rewards:{' '}
                  {s.rewards?.xp ? `XP` : 'None'}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteStory(s.id);
                  }}
                  className='mt-2 text-red-400 hover:text-red-600 text-xs font-bold underline'
                >
                  Delete
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

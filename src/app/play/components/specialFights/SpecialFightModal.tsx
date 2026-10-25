'use client';

import React, { useState } from 'react';
import { SPECIAL_FIGHTS_LIST, getSpecialFightById } from './registry';
import { FoeDoc } from '@/types/game';
import { X, Swords, RefreshCw } from 'lucide-react';

interface SpecialFightModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFightId?: string;
  foes?: FoeDoc[];
}

export default function SpecialFightModal({
  isOpen,
  onClose,
  initialFightId = 'loc2_vieta_scales',
  foes = [],
}: SpecialFightModalProps) {
  const [selectedFightId, setSelectedFightId] = useState(initialFightId);
  const [selectedFoeId, setSelectedFoeId] = useState<string>(foes[0]?.id || '');
  const [key, setKey] = useState(0); // For forcing reset

  if (!isOpen) return null;

  const activeDef = getSpecialFightById(selectedFightId) || SPECIAL_FIGHTS_LIST[0];
  const activeFoe = foes.find(f => f.id === selectedFoeId) || foes[0] || {
    id: 'test_guardian',
    name: 'Ancient Stone Guardian',
    maxHp: 150,
    attackDamage: 12,
    emoji: '🗿',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/monster_sprites%2Fearth_golem.png?alt=media',
  };

  const FightComponent = activeDef.component;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-2 sm:p-4">
      {/* Top Bar with selector and controls */}
      <div className="shrink-0 max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-indigo-500/30 px-4 py-2.5 rounded-2xl mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
            <Swords className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              Special Fight Test Lab
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                GM ONLY
              </span>
            </h3>
          </div>
        </div>

        {/* Fight & Foe selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="font-bold">Fight:</span>
            <select
              value={selectedFightId}
              onChange={(e) => {
                setSelectedFightId(e.target.value);
                setKey(prev => prev + 1);
              }}
              className="bg-black/80 border border-indigo-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              {SPECIAL_FIGHTS_LIST.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.locationName.split(':')[0]})
                </option>
              ))}
            </select>
          </div>

          {foes.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <span className="font-bold">Foe:</span>
              <select
                value={selectedFoeId}
                onChange={(e) => {
                  setSelectedFoeId(e.target.value);
                  setKey(prev => prev + 1);
                }}
                className="bg-black/80 border border-indigo-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                {foes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.emoji || '👹'} {f.name} (Max HP: {f.maxHp})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setKey(prev => prev + 1)}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors flex items-center gap-1 text-xs font-bold"
            title="Reset Test"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 transition-colors"
            title="Close Lab"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Special Fight container */}
      <div className="flex-1 max-w-6xl w-full mx-auto rounded-3xl overflow-hidden border-2 border-indigo-500/40 shadow-2xl relative min-h-0">
        <FightComponent
          key={key}
          foe={activeFoe}
          character={{
            ownerUid: 'test',
            name: 'Arch-Scholar Owl',
            level: 15,
            xp: 1200,
            gold: 350,
            maxHp: 100,
            hp: 85,
            stats: { a: 0, b: 0, c: 5, d: 10 },
            skills: { algebra: 15, functions: 15, geometry: 0, probabilityAndStatistics: 0, calculus: 0 },
            unspentPoints: 0,
            inventory: [],
            equipment: { mainHand: null, offHand: null, armor: null, head: null },
            completedStoryEvents: [],
            storyFlags: [],
            unlockedContinents: [],
            encounterWins: {},
            imageUrl: 'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9',
          }}
          onComplete={(res) => {
            console.log('Special fight completed in test mode:', res);
          }}
          isTestMode={true}
          onCloseTest={onClose}
        />
      </div>
    </div>
  );
}

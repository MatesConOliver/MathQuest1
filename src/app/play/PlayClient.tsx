'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { auth, getAllDocs, getDoc, updateDoc, callApi, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs as getFirebaseDocs, query, where, increment } from 'firebase/firestore';
import {
  Character,
  EncounterDoc,
  FoeDoc,
  QuestionDoc,
  GameItem,
  InventoryItem,
  Story,
  StoryEvent,
} from '@/types/game';
import { useRouter, useSearchParams } from 'next/navigation';
import 'katex/dist/katex.min.css';

// Import the new components
import { Lobby } from './components/Lobby';
import { BattleIntro } from './components/BattleIntro';
import { BattleScreen } from './components/BattleScreen';
import { VictoryScreen } from './components/VictoryScreen';
import { DefeatScreen } from './components/DefeatScreen';
import { StoryPlayer } from '@/components/StoryPlayer'; // Corrected Import

// Main game content component
export default function PlayClient() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Game state
  const [mode, setMode] = useState('lobby');
  const [character, setCharacter] = useState<Character | null>(null);
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
  const [currentEncounter, setCurrentEncounter] = useState<EncounterDoc | null>(
    null
  );
  const [foe, setFoe] = useState<FoeDoc | null>(null);
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [playerHp, setPlayerHp] = useState(100);
  const [foeHp, setFoeHp] = useState(50);
  const [msg, setMsg] = useState('');
  const [activeStory, setActiveStory] = useState<StoryEvent | null>(null); // Changed to StoryEvent

  // Battle mechanics state
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const totalTime = useMemo(
    () => questions[currentQIndex]?.timeLimit || 30,
    [questions, currentQIndex]
  );
  const [isPaused, setIsPaused] = useState(false);
  const [isEscaping, setIsEscaping] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [levelUpData, setLevelUpData] = useState<{
    oldLvl: number;
    newLvl: number;
    hpGain: number;
    pointsGain: number;
  } | null>(null);
  const [lootDrops, setLootDrops] = useState<string[]>([]);
  const [skillGains, setSkillGains] = useState<{[key: string]: number} | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [showInventory, setShowInventory] = useState(false);
  const [showEscapeConfirm, setShowEscapeConfirm] = useState(false);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});

  const battleStats = useMemo(() => {
    if (!character) {
      return { a: 0, b: 0, c: 0, d: 0, k: 1, xBonus: 0, maxHp: 100 };
    }

    const baseA = character.stats?.a || 0;
    const baseB = character.stats?.b || 0;
    const baseC = character.stats?.c || 0;
    const baseD = character.stats?.d || 0;
    const baseHp = character.maxHp;

    let totalA = baseA;
    let totalB = baseB;
    let totalC = baseC;
    let totalD = baseD;
    let totalXBonus = 0;
    let totalK = 1;
    let hpFlat = baseHp;
    let hpMult = 0;

    if (character.equipment) {
        Object.values(character.equipment).forEach((equippedInstanceId) => {
          if (!equippedInstanceId) return;
          const instance = character.inventory.find(
            (i) => i.instanceId === equippedInstanceId
          );
          if (!instance) return;
          const def = gameItems[instance.itemId];
          if (!def || !def.stats) return;
    
          const isBroken =
            (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
          if (isBroken) return;
    
          const s = def.stats;
    
          if (s.a) totalA += s.a;
          if (s.b) totalB += s.b;
          if (s.c) totalC += s.c;
          if (s.d) totalD += s.d;
          if (s.xBonus) totalXBonus += s.xBonus;
          if (s.damage?.mult) totalK += s.damage.mult;
          if (s.maxHp?.flat) hpFlat += s.maxHp.flat;
          if (s.maxHp?.mult) hpMult += s.maxHp.mult;
        });
    }

    const finalMaxHp = Math.floor(hpFlat * (1 + hpMult));

    return {
      a: totalA,
      b: totalB,
      c: totalC,
      d: totalD,
      k: totalK,
      xBonus: totalXBonus,
      maxHp: finalMaxHp,
    };
  }, [character, gameItems]);

  const calculatePlayerDamage = useCallback(
    (questionDifficulty: number) => {
      const { a, b, c, d, k, xBonus } = battleStats;
      const x = (questionDifficulty || 1) + xBonus;

      const termA = (a / 400) * Math.pow(x, 3);
      const termB = (b / 40) * Math.pow(x, 2);
      const termC = (1 + c / 10) * x;
      const termD = d / 2;

      const totalDamage = k * (termA + termB + termC + termD);

      return Math.max(1, Math.floor(totalDamage));
    },
    [battleStats]
  );

  const handleWin = useCallback(async () => {
    if (!user || !character || !currentEncounter) return;

    // --- Standard Rewards ---
    const xpGain = currentEncounter.winRewardXp || 0;
    const goldGain = currentEncounter.winRewardGold || 0;
    const skillsGained = currentEncounter.winRewardSkills || {};
    setSkillGains(skillsGained);

    // --- Level Up Logic ---
    const oldLvl = character.level;
    let newXp = (character.xp || 0) + xpGain;
    let newLvl = oldLvl;
    let hpGain = 0;
    let pointsGain = 0;
    let xpToNextLevel = Math.floor(100 * Math.pow(1.1, newLvl - 1));

    while (newXp >= xpToNextLevel) {
        newXp -= xpToNextLevel;
        newLvl++;
        hpGain += 10;
        pointsGain += 1;
        xpToNextLevel = Math.floor(100 * Math.pow(1.1, newLvl - 1));
    }

    // --- Loot Drop Logic ---
    if (currentEncounter.winRewardItems) {
        setLootDrops(currentEncounter.winRewardItems.map(id => gameItems[id]?.name || 'Unknown Item'));
    }

    try {
        // --- Prepare DB Update Payload ---
        const updates: { [key:string]: any } = {
            hp: playerHp,
            xp: newXp,
            level: newLvl,
            gold: increment(goldGain),
            maxHp: increment(hpGain),
            unspentPoints: increment(pointsGain),
            inventory: [
                ...character.inventory,
                ...(currentEncounter.winRewardItems || []).map(itemId => ({
                    itemId,
                    instanceId: Date.now().toString() + Math.random(),
                    obtainedAt: Date.now()
                })),
            ],
        };

        for (const [skill, amount] of Object.entries(skillsGained)) {
            if (amount && amount > 0) {
                updates[`skills.${skill}`] = increment(amount);
            }
        }
        
        await updateDoc('characters', user.uid, updates);

        // --- Optimistically update local character state ---
        setCharacter(prev => prev ? ({
            ...prev,
            xp: newXp,
            level: newLvl,
            gold: prev.gold + goldGain,
            maxHp: prev.maxHp + hpGain,
            unspentPoints: prev.unspentPoints + pointsGain,
            skills: {
                algebra: (prev.skills.algebra || 0) + (skillsGained.algebra || 0),
                functions: (prev.skills.functions || 0) + (skillsGained.functions || 0),
                geometry: (prev.skills.geometry || 0) + (skillsGained.geometry || 0),
                probabilityAndStatistics: (prev.skills.probabilityAndStatistics || 0) + (skillsGained.probabilityAndStatistics || 0),
                calculus: (prev.skills.calculus || 0) + (skillsGained.calculus || 0),
            },
            inventory: updates.inventory,
        }) : null);

        if (newLvl > oldLvl) {
            setLevelUpData({ oldLvl, newLvl, hpGain, pointsGain });
        }
        setMode('win');

    } catch (error) {
        console.error('Error updating character on win:', error);
        setMsg('Could not save victory progress.');
        setMode('lobby');
    }
  }, [user, character, currentEncounter, gameItems, playerHp]);

  const handleLoss = useCallback(async (reason: string) => {
    if (!user || !character) return;
    
    const goldLoss = Math.floor((character.gold || 0) * 0.20);
    const finalReason = `${reason} You lost ${goldLoss} gold.`;

    try {
        await updateDoc('characters', user.uid, {
            hp: battleStats.maxHp, // Restore to full health
            gold: increment(-goldLoss)
        });
        
        // Optimistically update local state
        setCharacter(p => p ? ({ ...p, hp: battleStats.maxHp, gold: p.gold - goldLoss }) : null);

        setMsg(finalReason);
        setMode('lose');
    } catch (e) {
        console.error('Error updating character on loss: ', e);
        setMsg('Error saving character state.');
        setMode('lobby');
    }
  }, [user, character, battleStats]);

  const nextQuestion = useCallback(() => {
    if (foeHp <= 0) {
      handleWin();
    } else if (playerHp <= 0) {
      handleLoss('You were defeated in battle!');
    } else if (currentQIndex === questions.length - 1) {
      handleLoss('You ran out of turns!');
    } else {
      setIsPaused(false);
      setSelectedChoice(null);
      setCurrentQIndex((prev) => prev + 1);
      setTimeLeft(questions[currentQIndex + 1]?.timeLimit || 30);
      setMsg('');
    }
  }, [foeHp, playerHp, currentQIndex, questions, handleWin, handleLoss]);

  const handleAnswer = useCallback(
    async (choiceIndex: number) => {
      if (isPaused) return;

      setIsPaused(true);
      setSelectedChoice(choiceIndex);

      const correct = choiceIndex === questions[currentQIndex].correctIndex;

      if (correct) {
        const foeDamage = calculatePlayerDamage(
          questions[currentQIndex].difficulty || 1
        );
        const newFoeHp = Math.max(0, foeHp - foeDamage);
        setMsg(`Correct! You dealt ${foeDamage} damage.`);
        setFoeHp(newFoeHp);
      } else {
        const playerDamage = foe?.attackDamage || 5;
        const newPlayerHp = Math.max(0, playerHp - playerDamage);
        setMsg(`Incorrect! The enemy dealt ${playerDamage} damage.`);
        setPlayerHp(newPlayerHp);
      }
    },
    [
      isPaused,
      questions,
      currentQIndex,
      foeHp,
      playerHp,
      calculatePlayerDamage,
      foe,
    ]
  );

  const handleStartEncounter = useCallback(
    (encounter: EncounterDoc) => {
      if (!character || character.hp <= 0) {
        setMsg('You must heal before starting a new battle!');
        return;
      }

      const setupBattle = async (enc: EncounterDoc) => {
        setIsLoading(true);
        setMsg('');
        try {
          const foeToLoad = enc.foes && enc.foes.length > 0 ? enc.foes[0] : enc.foeId;
          if (!foeToLoad) {
            setMsg('Encounter has no foe assigned.');
            setMode('lobby');
            return;
          }
          const foeData = await getDoc<FoeDoc>('foes', foeToLoad);

          let questionData: QuestionDoc[] = [];
          const tagsToFetch =
            enc.questionTags && enc.questionTags.length > 0
              ? enc.questionTags
              : enc.questionTag
              ? [enc.questionTag]
              : [];

          if (tagsToFetch.length > 0) {
            const questionsQuery = query(
              collection(db, 'questions'),
              where('tags', 'array-contains-any', tagsToFetch)
            );
            const questionSnap = await getFirebaseDocs(questionsQuery);
            questionData = questionSnap.docs.map(
              (d) => ({ ...d.data(), id: d.id } as QuestionDoc)
            );
          }

          if (enc.shuffleQuestions) {
            for (let i = questionData.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [questionData[i], questionData[j]] = [
                questionData[j],
                questionData[i],
              ];
            }
          }

          if (!foeData || questionData.length === 0) {
            let errorMsg = 'Failed to load battle data.';
            if (!foeData) {
              errorMsg = `Foe with ID '${foeToLoad}' not found.`;
            } else if (questionData.length === 0) {
              errorMsg = `No questions found for tags: ${tagsToFetch.join(', ')}.`;
            }
            setMsg(errorMsg);
            setMode('lobby');
            return;
          }

          setFoe(foeData);
          setQuestions(questionData);
          setCurrentEncounter(enc);
          setFoeHp(foeData.maxHp);
          if (character) {
            const currentCharacterHp =
              character.hp > battleStats.maxHp
                ? battleStats.maxHp
                : character.hp;
            setPlayerHp(currentCharacterHp);
          }

          setCurrentQIndex(0);
          setTimeLeft(questionData[0]?.timeLimit || 30);
          setIsPaused(false);
          setSelectedChoice(null);
          setLevelUpData(null);
          setLootDrops([]);
          setSkillGains(null);
          setMode('intro');
        } catch (error) {
          console.error('Error setting up battle:', error);
          setMsg('An error occurred preparing for battle.');
          setMode('lobby');
        } finally {
          setIsLoading(false);
        }
      };

      setupBattle(encounter);
    },
    [character, battleStats.maxHp]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        router.push('/login');
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;

    const fetchGameData = async () => {
      try {
        const [charData, encs, items] = await Promise.all([
          getDoc<Character>('characters', user.uid),
          getAllDocs<EncounterDoc>('encounters'),
          getAllDocs<GameItem>('items'),
        ]);

        if (charData) {
          setCharacter(charData);
        } else {
          router.push('/character/new');
          return;
        }

        setEncounters(encs);
        const itemsMap = items.reduce(
          (acc, item) => ({ ...acc, [item.id]: item }),
          {}
        );
        setGameItems(itemsMap);

        // Check for a login story using the new callApi function
        const storyEvent = await callApi<StoryEvent | null>('getStoryForTrigger', { trigger: 'LOGIN' });

        if (storyEvent && storyEvent.scenes && storyEvent.scenes.length > 0) {
            setActiveStory(storyEvent);
        }

      } catch (error) {
        console.error('Error fetching game data or story:', error);
        setMsg('Failed to load game data. Please refresh.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchGameData();
  }, [user, router]);

  useEffect(() => {
    if (character) {
      const newHp = Math.min(character.hp, battleStats.maxHp);
      setPlayerHp(newHp);
    }
  }, [character, battleStats]);

  useEffect(() => {
    const encounterId = searchParams.get('id');
    if (encounterId && encounters.length > 0 && character) {
      const selectedEncounter = encounters.find((e) => e.id === encounterId);
      if (selectedEncounter) {
        handleStartEncounter(selectedEncounter);
      } else {
        setMsg("The battle you were looking for doesn't exist!");
      }
    }
  }, [searchParams, encounters, character, handleStartEncounter]);

  useEffect(() => {
    if (mode === 'battle' && !isPaused && !showInventory) {
      if (timeLeft <= 0) {
        handleAnswer(-1); // Automatically fail the question
        return;
      }
      const t = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
      setTimer(t);
      return () => clearInterval(t);
    } else if (timer) {
      clearInterval(timer);
    }
  }, [mode, isPaused, timeLeft, showInventory, handleAnswer]);

  const handleFinishStory = async () => {
    if (!user || !activeStory) return;
    try {
        await updateDoc('characters', user.uid, {
            completedStoryEvents: [...(character?.completedStoryEvents || []), activeStory.id]
        });
        setActiveStory(null);
    } catch (error) {
        console.error("Failed to update completed stories: ", error);
        // Still hide the story, but log the error
        setActiveStory(null);
    }
  };

  const handleStartBattle = () => setMode('battle');

  const skipQuestion = () => handleAnswer(-1);

  const handleFightAgain = () => {
    if (currentEncounter) {
      handleStartEncounter(currentEncounter);
    }
  };

  const executeEscape = () => {
    setShowEscapeConfirm(false);
    setIsPaused(true);
    setMsg('You successfully escaped!');
    setIsEscaping(true);
    setTimeout(() => {
        router.push('/map');
    }, 2000);
  };

  const usePotion = async (item: InventoryItem) => {
    if (!user || !character || !gameItems[item.itemId] || isPaused) return;

    const potion = gameItems[item.itemId];
    const healAmount = potion.stats?.heal?.flat || 20;
    const newHp = Math.min(battleStats.maxHp, playerHp + healAmount);

    const newInventory = [...character.inventory];
    const itemIndex = newInventory.findIndex(
      (i) => i.instanceId === item.instanceId
    );
    if (itemIndex > -1) newInventory.splice(itemIndex, 1);

    try {
      setPlayerHp(newHp);
      setCharacter((prev) =>
        prev ? { ...prev, inventory: newInventory } : null
      );
      setShowInventory(false);
      setMsg(`Healed for ${healAmount} HP!`);

      await updateDoc('characters', user.uid, { inventory: newInventory });
      setTimeout(() => setMsg(''), 2000);
    } catch (error) {
      console.error('Error using potion:', error);
      setPlayerHp(playerHp); // Revert optimistic update
      setCharacter(character); // Revert optimistic update
      setMsg('Failed to use potion.');
    }
  };

  const renderMixedText = (text: string) => <>{text}</>;

  if (isLoading || !user || !character) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-lg font-bold text-gray-500 animate-pulse">
        Loading Your Adventure...
      </div>
    );
  }
  
  if (activeStory) {
    return <StoryPlayer story={activeStory} onComplete={handleFinishStory} />;
  }

  switch (mode) {
    case 'intro':
      return (
        <BattleIntro
          encounter={currentEncounter}
          foe={foe}
          questionCount={questions.length}
          onStartBattle={handleStartBattle}
        />
      );
    case 'battle':
      return (
        <BattleScreen
          character={character}
          foe={foe}
          questions={questions}
          currentQIndex={currentQIndex}
          playerHp={playerHp}
          foeHp={foeHp}
          msg={msg}
          timeLeft={timeLeft}
          totalTime={totalTime}
          isPaused={isPaused}
          isEscaping={isEscaping}
          selectedChoice={selectedChoice}
          gameItems={gameItems}
          showInventory={showInventory}
          setShowInventory={setShowInventory}
          showEscapeConfirm={showEscapeConfirm}
          setShowEscapeConfirm={setShowEscapeConfirm}
          handleAnswer={handleAnswer}
          nextQuestion={nextQuestion}
          skipQuestion={skipQuestion}
          executeEscape={executeEscape}
          usePotion={usePotion}
          renderMixedText={renderMixedText}
        />
      );
    case 'win':
      return (
        <VictoryScreen
          character={character}
          levelUpData={levelUpData}
          lootDrops={lootDrops}
          onFightAgain={handleFightAgain}
        />
      );
    case 'lose':
      return <DefeatScreen msg={msg} onTryAgain={handleFightAgain} />;
    default:
      return (
        <Lobby
          encounters={encounters}
          onStartEncounter={handleStartEncounter}
          msg={msg}
        />
      );
  }
}

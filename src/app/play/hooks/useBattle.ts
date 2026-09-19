
import { useEffect, useState, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Character,
  EncounterDoc,
  FoeDoc,
  QuestionDoc,
  GameItem,
  InventoryItem,
} from '@/types/game';
import { getDoc, updateDoc, db } from '@/lib/firebase';
import { collection, getDocs as getFirebaseDocs, query, where, increment } from 'firebase/firestore';

interface UseBattleProps {
  user: User | null;
  character: Character | null;
  encounters: EncounterDoc[];
  gameItems: Record<string, GameItem>;
  foes: Record<string, FoeDoc>;
  setCharacter: React.Dispatch<React.SetStateAction<Character | null>>;
}

export function useBattle({ user, character, encounters, gameItems, foes, setCharacter }: UseBattleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState('lobby');
  const [currentEncounter, setCurrentEncounter] = useState<EncounterDoc | null>(null);
  const [foe, setFoe] = useState<FoeDoc | null>(null);
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [playerHp, setPlayerHp] = useState(100);
  const [foeHp, setFoeHp] = useState(50);
  const [msg, setMsg] = useState('');
  const [isBattleOver, setIsBattleOver] = useState(false);

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
  const [xpReward, setXpReward] = useState(0);
  const [goldReward, setGoldReward] = useState(0);

  const [isLoading, setIsLoading] = useState(false); // Battle-specific loading
  const [showInventory, setShowInventory] = useState(false);
  const [showEscapeConfirm, setShowEscapeConfirm] = useState(false);
  // Instance IDs of potions consumed during the current battle; not persisted until the battle ends.
  const [consumedPotionInstanceIds, setConsumedPotionInstanceIds] = useState<string[]>([]);

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

  // Inventory as it should appear during the current battle: potions already used
  // in this fight are hidden, without touching the persisted character/Firestore.
  const availableInventory = useMemo(() => {
    if (!character) return [];
    return character.inventory.filter(
      (i) => !consumedPotionInstanceIds.includes(i.instanceId)
    );
  }, [character, consumedPotionInstanceIds]);

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
    if (!user || !character || !currentEncounter || !currentEncounter.id) return;
    const encounterId = currentEncounter.id;

    const xpGain = currentEncounter.winRewardXp || 0;
    const goldGain = currentEncounter.winRewardGold || 0;
    const skillsGained = currentEncounter.winRewardSkills || {};
    setXpReward(xpGain);
    setGoldReward(goldGain);
    setSkillGains(skillsGained);

    const oldLvl = character.level;
    let newXp = (character.xp || 0) + xpGain;
    let newLvl = oldLvl;
    let hpGain = 0;
    let pointsGain = 0;

    const calculateXpToNextLevel = (level: number) => {
      const base = 3 * level * level - 3 * level + 1;
      const modifier = Math.sqrt(Math.max(0, 1 - 0.005 * level));
      return Math.max(1, Math.floor(base * modifier));
    };

    let xpToNextLevel = calculateXpToNextLevel(newLvl);

    while (newXp >= xpToNextLevel) {
        newXp -= xpToNextLevel;
        newLvl++;
        hpGain += 5;
        pointsGain += 1;
        xpToNextLevel = calculateXpToNextLevel(newLvl);
    }

    if (currentEncounter.winRewardItems) {
        setLootDrops(currentEncounter.winRewardItems.map(id => gameItems[id]?.name || 'Unknown Item'));
    }

    // Consolidate potions consumed during this battle: start from the persisted inventory
    // (untouched during combat) and remove exactly what was used.
    const finalInventory = character.inventory.filter(
      (i) => !consumedPotionInstanceIds.includes(i.instanceId)
    );

    try {
        const updates: { [key:string]: any } = {
            hp: playerHp + hpGain,
            xp: newXp,
            level: newLvl,
            gold: increment(goldGain),
            maxHp: increment(hpGain),
            unspentPoints: increment(pointsGain),
            inventory: [
                ...finalInventory,
                ...(currentEncounter.winRewardItems || []).map(itemId => ({
                    itemId,
                    instanceId: Date.now().toString() + Math.random(),
                    obtainedAt: Date.now()
                })),
            ],
            [`encounterWins.${encounterId}`]: increment(1)
        };

        for (const [skill, amount] of Object.entries(skillsGained)) {
            if (amount && amount > 0) {
                updates[`skills.${skill}`] = increment(amount);
            }
        }
        
        await updateDoc('characters', user.uid, updates);

        setCharacter(prev => {
            if (!prev) return null;
            const newWins = { ...(prev.encounterWins || {}) };
            newWins[encounterId] = (newWins[encounterId] || 0) + 1;
            return {
                ...prev,
                hp: playerHp + hpGain,
                xp: newXp,
                level: newLvl,
                gold: prev.gold + goldGain,
                maxHp: prev.maxHp + hpGain,
                unspentPoints: prev.unspentPoints + pointsGain,
                skills: {
                    algebra: (prev.skills?.algebra || 0) + (skillsGained.algebra || 0),
                    functions: (prev.skills?.functions || 0) + (skillsGained.functions || 0),
                    geometry: (prev.skills?.geometry || 0) + (skillsGained.geometry || 0),
                    probabilityAndStatistics: (prev.skills?.probabilityAndStatistics || 0) + (skillsGained.probabilityAndStatistics || 0),
                    calculus: (prev.skills?.calculus || 0) + (skillsGained.calculus || 0),
                },
                inventory: updates.inventory,
                encounterWins: newWins,
                storyFlags: prev.storyFlags
            };
        });

        if (newLvl > oldLvl) {
            setLevelUpData({ oldLvl, newLvl, hpGain, pointsGain });
        }

        setConsumedPotionInstanceIds([]);
        setIsBattleOver(true);
        setMode('win');

    } catch (error) {
        console.error('Error updating character on win:', error);
        setMsg('Could not save victory progress.');
        setMode('lobby');
    }
  }, [user, character, currentEncounter, gameItems, playerHp, consumedPotionInstanceIds, setCharacter]);

  const handleReturnToMap = useCallback(() => {
    if (currentEncounter?.winRewardStoryFlag) {
      sessionStorage.setItem("pendingStoryFlag", currentEncounter.winRewardStoryFlag);
    }
    router.push("/map");
  }, [currentEncounter, router]);

  const handleLoss = useCallback(async (reason: string) => {
    if (!user || !character) return;
    
    const goldLoss = Math.floor((character.gold || 0) * 0.20);
    const finalReason = `${reason} You lost ${goldLoss} gold.`;

    // Potions consumed during this battle stay consumed even though the player lost.
    const finalInventory = character.inventory.filter(
      (i) => !consumedPotionInstanceIds.includes(i.instanceId)
    );

    try {
        await updateDoc('characters', user.uid, {
            hp: battleStats.maxHp, // Restore to full health
            gold: increment(-goldLoss),
            inventory: finalInventory
        });
        
        setCharacter(p => p ? ({ ...p, hp: battleStats.maxHp, gold: p.gold - goldLoss, inventory: finalInventory }) : null);

        setConsumedPotionInstanceIds([]);
        router.push('/play', { scroll: false });
        setMsg(finalReason);
        setIsBattleOver(true);
        setMode('lose');
    } catch (e) {
        console.error('Error updating character on loss: ', e);
        setMsg('Error saving character state.');
        setMode('lobby');
    }
  }, [user, character, battleStats, consumedPotionInstanceIds, router, setCharacter]);

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

      setIsBattleOver(false);

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
          setConsumedPotionInstanceIds([]);
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
    if (character) {
      const newHp = Math.min(character.hp, battleStats.maxHp);
      setPlayerHp(newHp);
    }
  }, [character, battleStats]);

  useEffect(() => {
    const encounterId = searchParams.get('id');
    
    if (mode === 'win' || mode === 'lose' || mode === 'battle' || mode === 'intro') {
      return;
    }

    if (encounterId && encounters.length > 0 && character) {
      const selectedEncounter = encounters.find((e) => e.id === encounterId);
      if (selectedEncounter) {
        handleStartEncounter(selectedEncounter);
      } else {
        setMsg("The battle you were looking for doesn't exist!");
      }
    }
  }, [searchParams, encounters, character, handleStartEncounter, mode]);

  useEffect(() => {
    if (mode === 'battle' && !isPaused) {
      if (timeLeft <= 0) {
        handleAnswer(-1);
        return;
      }
      const t = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
      setTimer(t);
      return () => clearInterval(t);
    } else if (timer) {
      clearInterval(timer);
    }
  }, [mode, isPaused, timeLeft, handleAnswer]);

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

  const usePotion = (item: InventoryItem) => {
    if (!user || !character || !gameItems[item.itemId] || isPaused) return;

    if (playerHp >= battleStats.maxHp) {
      setMsg('HP is already full.');
      setTimeout(() => setMsg(''), 2000);
      return;
    }

    const potion = gameItems[item.itemId];
    const healAmount = potion.stats?.heal?.flat || 20;
    const newHp = Math.min(battleStats.maxHp, playerHp + healAmount);

    // Temporary, combat-only state: nothing is written to Firestore or to the
    // persisted character until the battle is consolidated (win/loss).
    setPlayerHp(newHp);
    setConsumedPotionInstanceIds((prev) => [...prev, item.instanceId]);
    setShowInventory(false);
    setMsg(`Healed for ${healAmount} HP!`);
    setTimeout(() => setMsg(''), 2000);
  };

  return {
    mode,
    isLoading,
    msg,
    character,
    currentEncounter,
    foe,
    questions,
    currentQIndex,
    playerHp,
    foeHp,
    timeLeft,
    totalTime,
    isPaused,
    isEscaping,
    selectedChoice,
    gameItems,
    availableInventory,
    showInventory,
    setShowInventory,
    showEscapeConfirm,
    setShowEscapeConfirm,
    levelUpData,
    lootDrops,
    xpReward,
    goldReward,
    skillGains,
    handleStartEncounter,
    handleStartBattle,
    handleAnswer,
    nextQuestion,
    skipQuestion,
    executeEscape,
    usePotion,
    handleFightAgain,
    handleReturnToMap
  };
}

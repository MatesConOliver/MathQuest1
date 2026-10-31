
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
import { arrayUnion, collection, getDocs as getFirebaseDocs, query, where, orderBy, increment } from 'firebase/firestore';
import { useAudio } from '@/context/AudioContext';

export interface CombatEffect {
  target: 'foe' | 'player';
  amount: number;
  id: number;
  isCorrect: boolean;
}

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
  const audio = useAudio();
  const playSfx = useCallback((s: string) => audio?.playSfx(s), [audio]);

  const [mode, setMode] = useState('lobby');
  const [currentEncounter, setCurrentEncounter] = useState<EncounterDoc | null>(null);
  const [foe, setFoe] = useState<FoeDoc | null>(null);
  // Full pool of questions matching the encounter tags (fetched once at battle start).
  // Its length is used as the total "turn budget" for the encounter.
  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  // Question currently displayed to the player.
  const [currentQuestion, setCurrentQuestion] = useState<QuestionDoc | null>(null);
  // Pending chained sub-questions (same groupId) waiting to be asked in order.
  const [questionQueue, setQuestionQueue] = useState<QuestionDoc[]>([]);
  // IDs of questions already shown this battle (answered, failed, or skipped) so they don't repeat.
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  // Turn counter (not an array index anymore since questions are drawn dynamically).
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showSubquestionMenu, setShowSubquestionMenu] = useState(false);
  const [playerHp, setPlayerHp] = useState(100);
  const [foeHp, setFoeHp] = useState(50);
  const [msg, setMsg] = useState('');
  const [isBattleOver, setIsBattleOver] = useState(false);

  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const totalTime = useMemo(
    () => currentQuestion?.timeLimit || 30,
    [currentQuestion]
  );

  // Only questions with no groupId, or the first part (order 1) of a group, may be
  // picked as a fresh random draw. Later parts can only appear via the chained queue.
  // Already-used questions (answered, failed, or skipped this battle) are excluded so they don't repeat.
  const eligibleStarterPool = useMemo(
    () =>
      questions.filter(
        (q) => (!q.groupId || (q.order ?? 1) <= 1) && (!q.id || !usedQuestionIds.includes(q.id))
      ),
    [questions, usedQuestionIds]
  );

  const fetchGroupQuestions = useCallback(async (groupId: string, excludeId?: string) => {
    const groupQuery = query(
      collection(db, 'questions'),
      where('groupId', '==', groupId),
      orderBy('order', 'asc')
    );
    const snap = await getFirebaseDocs(groupQuery);
    return snap.docs
      .map((d) => ({ ...d.data(), id: d.id } as QuestionDoc))
      .filter((q) => q.id !== excludeId);
  }, []);
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
  // Local battle inventory that tracks durability degradation in real time
  const [battleInventory, setBattleInventory] = useState<InventoryItem[]>([]);
  // Floating combat text and sprite damage animation state
  const [combatEffect, setCombatEffect] = useState<CombatEffect | null>(null);

  // Special Fight & Phase 2 state
  const [specialFightActive, setSpecialFightActive] = useState(false);
  const [specialFightTriggered, setSpecialFightTriggered] = useState(false);
  const [activeSpecialFightId, setActiveSpecialFightId] = useState<string | null>(null);
  const [isPhase2, setIsPhase2] = useState(false);

  useEffect(() => {
    if (character?.inventory) {
      setBattleInventory(character.inventory);
    }
  }, [character?.inventory]);

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

    const inventoryToUse = battleInventory.length > 0 ? battleInventory : character.inventory;

    if (character.equipment) {
        Object.values(character.equipment).forEach((equippedInstanceId) => {
          if (!equippedInstanceId) return;
          const instance = inventoryToUse.find(
            (i) => i.instanceId === equippedInstanceId
          );
          if (!instance) return;
          const def = gameItems[instance.itemId];
          if (!def || !def.stats) return;
    
          const isWeapon = def.slot === "mainHand" || def.slot === "offHand" || def.type === "weapon";
          const isBroken =
            isWeapon && (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
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
  }, [character, gameItems, battleInventory]);

  // Inventory as it should appear during the current battle: potions already used
  // in this fight are hidden, without touching the persisted character/Firestore.
  const availableInventory = useMemo(() => {
    if (!character) return [];
    const sourceInventory = battleInventory.length > 0 ? battleInventory : character.inventory;
    return sourceInventory.filter(
      (i) => !consumedPotionInstanceIds.includes(i.instanceId)
    );
  }, [character, battleInventory, consumedPotionInstanceIds]);

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

    // Consolidate inventory with updated durabilities from this battle (minus consumed potions)
    const finalInventory = (battleInventory.length > 0 ? battleInventory : character.inventory).filter(
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

          if (currentEncounter.winRewardStoryFlag) {
            updates.pendingProgressionFlags = arrayUnion(currentEncounter.winRewardStoryFlag);
          }

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
                storyFlags: prev.storyFlags,
                pendingProgressionFlags: currentEncounter.winRewardStoryFlag
                  ? [...new Set([...(prev.pendingProgressionFlags || []), currentEncounter.winRewardStoryFlag])]
                  : prev.pendingProgressionFlags
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
  }, [user, character, currentEncounter, gameItems, playerHp, consumedPotionInstanceIds, battleInventory, setCharacter]);

  const targetLocationId = useMemo(() => {
    const fromQuery = searchParams.get('locationId');
    if (fromQuery) return fromQuery;
    if (currentEncounter?.locationId) return currentEncounter.locationId;
    return null;
  }, [searchParams, currentEncounter]);

  const targetSubAreaId = useMemo(() => {
    const fromQuery = searchParams.get('subAreaId');
    if (fromQuery) return fromQuery;
    if (currentEncounter?.subAreaId) return currentEncounter.subAreaId;
    return null;
  }, [searchParams, currentEncounter]);

  const buildReturnMapUrl = useCallback(() => {
    const locId = targetLocationId || (typeof window !== 'undefined' ? sessionStorage.getItem('lastActiveLocationId') : null);
    if (!locId) return '/map';
    const subId = targetSubAreaId;
    return `/map?locationId=${locId}${subId ? `&subAreaId=${subId}` : ''}`;
  }, [targetLocationId, targetSubAreaId]);

  useEffect(() => {
    if (targetLocationId && typeof window !== 'undefined') {
      sessionStorage.setItem('lastActiveLocationId', targetLocationId);
    }
  }, [targetLocationId]);

  const handleReturnToMap = useCallback(() => {
    if (currentEncounter?.winRewardStoryFlag) {
      sessionStorage.setItem("pendingStoryFlag", currentEncounter.winRewardStoryFlag);
    }
    const dest = buildReturnMapUrl();
    router.push(dest);
  }, [currentEncounter, buildReturnMapUrl, router]);

  const handleLoss = useCallback(async (reason: string) => {
    if (!user || !character) return;
    
    const goldLoss = Math.floor((character.gold || 0) * 0.20);
    const finalReason = `${reason} You lost ${goldLoss} gold.`;

    // Consolidate inventory with updated durabilities from this battle (minus consumed potions)
    const finalInventory = (battleInventory.length > 0 ? battleInventory : character.inventory).filter(
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
  }, [user, character, battleStats, consumedPotionInstanceIds, battleInventory, router, setCharacter]);

  // Draws a new random question from the eligible starter pool. If it belongs to a
  // group, fetches and queues up the rest of that group's parts in order.
  const drawRandomQuestion = useCallback(async (): Promise<QuestionDoc | null> => {
    let pool = eligibleStarterPool;
    if (pool.length === 0 && questions.length > 0) {
      // Extended battle fallback: recycle questions except the current one
      const recycled = questions.filter((q) => (!q.groupId || (q.order ?? 1) <= 1));
      const filtered = currentQuestion?.id ? recycled.filter((q) => q.id !== currentQuestion.id) : recycled;
      pool = filtered.length > 0 ? filtered : recycled;
    }
    if (pool.length === 0) return null;
    const picked =
      pool[Math.floor(Math.random() * pool.length)];

    if (picked.groupId) {
      try {
        const siblings = await fetchGroupQuestions(picked.groupId, picked.id);
        setQuestionQueue(siblings);
      } catch (e) {
        console.error('Error fetching group questions:', e);
        setQuestionQueue([]);
      }
    } else {
      setQuestionQueue([]);
    }

    if (picked.id) {
      setUsedQuestionIds((prev) => [...prev, picked.id as string]);
    }
    return picked;
  }, [eligibleStarterPool, questions, currentQuestion, fetchGroupQuestions]);

  const advanceQuestion = useCallback(async (abandonCurrentGroup: boolean) => {
    if (foeHp <= 0) {
      handleWin();
      return;
    }
    if (playerHp <= 0) {
      handleLoss('You were defeated in battle!');
      return;
    }
    const skippedTurns = abandonCurrentGroup ? questionQueue.length : 0;
    if (currentQIndex + skippedTurns >= questions.length - 1) {
      handleLoss('You ran out of turns!');
      return;
    }

    setSelectedChoice(null);
    setCombatEffect(null);
    setShowSubquestionMenu(false);
    setMsg('');
    setCurrentQIndex((prev) => prev + skippedTurns + 1);

    if (abandonCurrentGroup) {
      setQuestionQueue([]);
    } else if (questionQueue.length > 0) {
      const [next, ...rest] = questionQueue;
      setQuestionQueue(rest);
      setCurrentQuestion(next);
      setTimeLeft(next.timeLimit || 30);
      setIsPaused(false);
      return;
    }

    const drawn = await drawRandomQuestion();
    if (!drawn) {
      handleLoss('No more questions available!');
      return;
    }
    setCurrentQuestion(drawn);
    setTimeLeft(drawn.timeLimit || 30);
    setIsPaused(false);
  }, [foeHp, playerHp, currentQIndex, questions.length, questionQueue, drawRandomQuestion, handleWin, handleLoss]);

  const nextQuestion = useCallback(() => advanceQuestion(false), [advanceQuestion]);

  // Player fails a sub-question but chooses to keep going through the group's queue.
  const continueSubquestion = useCallback(() => {
    nextQuestion();
  }, [nextQuestion]);

  // Player fails a sub-question and gives up on the rest of the group.
  const abandonGroup = useCallback(() => {
    advanceQuestion(true);
  }, [advanceQuestion]);

  const handleAnswer = useCallback(
    async (choiceIndex: number) => {
      if (isPaused || !currentQuestion) return;

      setIsPaused(true);
      setSelectedChoice(choiceIndex);

      const correct = choiceIndex === currentQuestion.correctIndex;

      // Durability degradation rules:
      // Only weapons have durability (both hands):
      // - Main hand weapon: loses 1 durability on correct answer
      // - Off hand weapon/shield: loses 1 durability on EVERY answer regardless
      // Armor and head gear NEVER lose durability
      setBattleInventory((prevInventory) => {
        const source = prevInventory.length > 0 ? prevInventory : (character?.inventory || []);
        return source.map((item) => {
          if (!item.maxDurability) return item;

          const isMainHand = correct && character?.equipment?.mainHand === item.instanceId;
          const isOffHand = character?.equipment?.offHand === item.instanceId;

          if (isMainHand || isOffHand) {
            const currentDur = typeof item.durability === 'number' ? item.durability : item.maxDurability;
            const nextDurability = Math.max(0, currentDur - 1);
            return { ...item, durability: nextDurability };
          }
          return item;
        });
      });

      if (correct) {
        const foeDamage = calculatePlayerDamage(currentQuestion.difficulty || 1);
        const calculatedFoeHp = foeHp - foeDamage;
        const maxHp = foe?.maxHp || 50;
        const halfHp = maxHp * 0.5;

        // Check for special fight trigger: first time foe is below 50% HP (or 0% from 1-hit KO)
        const shouldTriggerSpecial =
          Boolean(currentEncounter?.specialFightId) &&
          !specialFightTriggered &&
          (calculatedFoeHp <= halfHp || calculatedFoeHp <= 0);

        if (shouldTriggerSpecial) {
          // Keep foe alive at min 1 HP so handleWin doesn't execute before the special fight
          const clampedHp = Math.max(1, calculatedFoeHp);
          setFoeHp(clampedHp);
          setSpecialFightTriggered(true);
          setActiveSpecialFightId(currentEncounter!.specialFightId!);
          setMsg(`Correct! You dealt ${foeDamage} damage... BUT A SPECIAL TRIAL IS TRIGGERED!`);
          
          setCombatEffect({
            target: 'foe',
            amount: foeDamage,
            id: Date.now(),
            isCorrect: true,
          });
          playSfx('attack');
          setTimeout(() => playSfx('hit'), 140);

          // Allow the attack animation to play, then open special fight
          setTimeout(() => {
            setIsPaused(true);
            setSpecialFightActive(true);
          }, 700);
        } else {
          const newFoeHp = Math.max(0, calculatedFoeHp);
          setMsg(`Correct! You dealt ${foeDamage} damage.`);
          setFoeHp(newFoeHp);
          setCombatEffect({
            target: 'foe',
            amount: foeDamage,
            id: Date.now(),
            isCorrect: true,
          });
          playSfx('attack');
          setTimeout(() => playSfx('hit'), 140);
        }
      } else {
        const playerDamage = foe?.attackDamage || 5;
        const newPlayerHp = Math.max(0, playerHp - playerDamage);
        const failText = choiceIndex === -2
          ? `Turn skipped! The enemy dealt ${playerDamage} damage.`
          : choiceIndex === -1
          ? `Time's up! The enemy dealt ${playerDamage} damage.`
          : `Incorrect! The enemy dealt ${playerDamage} damage.`;
        setMsg(failText);
        setPlayerHp(newPlayerHp);
        setCombatEffect({
          target: 'player',
          amount: playerDamage,
          id: Date.now(),
          isCorrect: false,
        });
        playSfx('hit');

        // Only offer the "keep going / bail out" choice mid-way through a chained exercise if player survived.
        if (currentQuestion.groupId && questionQueue.length > 0 && newPlayerHp > 0 && foeHp > 0) {
          setShowSubquestionMenu(true);
        }
      }
    },
    [
      isPaused,
      currentQuestion,
      character?.equipment,
      character?.inventory,
      foeHp,
      playerHp,
      calculatePlayerDamage,
      foe,
      questionQueue,
      playSfx,
      currentEncounter,
      specialFightTriggered,
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

          const starterPool = questionData.filter((q) => !q.groupId || (q.order ?? 1) <= 1);
          const starter =
            starterPool.length > 0
              ? starterPool[Math.floor(Math.random() * starterPool.length)]
              : null;

          if (!foeData || questionData.length === 0 || !starter) {
            let errorMsg = 'Failed to load battle data.';
            if (!foeData) {
              errorMsg = `Foe with ID '${foeToLoad}' not found.`;
            } else if (questionData.length === 0) {
              errorMsg = `No questions found for tags: ${tagsToFetch.join(', ')}.`;
            } else if (!starter) {
              errorMsg = 'No valid starting questions found (check groupId/order setup).';
            }
            setMsg(errorMsg);
            setMode('lobby');
            return;
          }

          let starterQueue: QuestionDoc[] = [];
          if (starter.groupId) {
            try {
              starterQueue = await fetchGroupQuestions(starter.groupId, starter.id);
            } catch (e) {
              console.error('Error fetching group questions:', e);
            }
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
          setCurrentQuestion(starter);
          setQuestionQueue(starterQueue);
          setUsedQuestionIds(starter.id ? [starter.id] : []);
          setShowSubquestionMenu(false);
          setTimeLeft(starter.timeLimit || 30);
          setIsPaused(false);
          setSelectedChoice(null);
          setCombatEffect(null);
          setSpecialFightActive(false);
          setSpecialFightTriggered(false);
          setActiveSpecialFightId(null);
          setIsPhase2(false);
          if (character?.inventory) setBattleInventory(character.inventory);
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
    [character, battleStats.maxHp, fetchGroupQuestions]
  );

  const handleSpecialFightComplete = useCallback(
    async (result: { success: boolean; message?: string }) => {
      setSpecialFightActive(false);

      const answeredQuestionId = currentQuestion?.id;
      if (answeredQuestionId) {
        setUsedQuestionIds((prev) => (prev.includes(answeredQuestionId) ? prev : [...prev, answeredQuestionId]));
      }

      if (result.success) {
        // Foe recovers full HP and enters Phase 2!
        if (foe) {
          setFoeHp(foe.maxHp);
        }
        setIsPhase2(true);
        const speedBonus = currentEncounter?.phase2TimeSpeedPercent || 25;
        setMsg(`⚡ PHASE 2 AWAKENED! ${foe?.name || 'The foe'} fully restored HP! Question timer is now ${speedBonus}% faster!`);
        playSfx('attack');
      } else {
        // Penalty on fail: lose 30% of max HP
        const penalty = Math.max(10, Math.floor((battleStats.maxHp || 100) * 0.3));
        const newPlayerHp = Math.max(0, playerHp - penalty);
        setPlayerHp(newPlayerHp);
        setMsg(`The special trial overwhelmed you for -${penalty} HP!`);
        if (newPlayerHp <= 0) {
          handleLoss('You were defeated by the special trial!');
          return;
        }
      }

      // CRITICAL: Advance past the question answered right before the special battle so it is NEVER asked again!
      setSelectedChoice(null);
      setCombatEffect(null);
      setShowSubquestionMenu(false);
      setCurrentQIndex((prev) => prev + 1);

      if (questionQueue.length > 0) {
        const [next, ...rest] = questionQueue;
        setQuestionQueue(rest);
        setCurrentQuestion(next);
        setTimeLeft(next.timeLimit || 30);
        setIsPaused(false);
      } else {
        // Draw a fresh question from pool, excluding the answered question
        const drawn = await drawRandomQuestion();
        if (drawn && drawn.id !== answeredQuestionId) {
          setCurrentQuestion(drawn);
          setTimeLeft(drawn.timeLimit || 30);
          setIsPaused(false);
        } else {
          // Fallback: Pick any starter question whose id is not answeredQuestionId
          const fallbackPool = questions.filter(
            (q) => (!q.groupId || (q.order ?? 1) <= 1) && q.id !== answeredQuestionId
          );
          if (fallbackPool.length > 0) {
            const picked = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
            if (picked.id) {
              setUsedQuestionIds((prev) => (prev.includes(picked.id!) ? prev : [...prev, picked.id!]));
            }
            setCurrentQuestion(picked);
            setTimeLeft(picked.timeLimit || 30);
            setIsPaused(false);
          } else {
            setIsPaused(false);
          }
        }
      }
    },
    [
      foe,
      currentEncounter,
      battleStats.maxHp,
      playSfx,
      playerHp,
      currentQuestion,
      questionQueue,
      drawRandomQuestion,
      questions,
      handleLoss,
    ]
  );

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
    if (mode !== 'battle' || isPaused || !currentQuestion || specialFightActive) {
      return;
    }

    // Phase 2 timer speed: ticks faster if isPhase2 is active
    const speedBonus = isPhase2 ? (currentEncounter?.phase2TimeSpeedPercent || 25) : 0;
    const intervalMs = Math.max(200, Math.round(1000 / (1 + speedBonus / 100)));

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimeout(() => handleAnswer(-1), 0);
          return 0;
        }
        return prev - 1;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [mode, isPaused, currentQuestion, handleAnswer, isPhase2, currentEncounter?.phase2TimeSpeedPercent, specialFightActive]);

  const handleStartBattle = () => setMode('battle');

  const skipQuestion = () => handleAnswer(-2);

  const handleFightAgain = () => {
    if (currentEncounter) {
      handleStartEncounter(currentEncounter);
    }
  };

  const executeEscape = async () => {
    setShowEscapeConfirm(false);
    setIsPaused(true);

    if (!user || !character) {
      setMsg('Could not save escape.');
      setIsPaused(false);
      return;
    }

    const finalInventory = (battleInventory.length > 0 ? battleInventory : character.inventory).filter(
      (i) => !consumedPotionInstanceIds.includes(i.instanceId)
    );

    try {
      await updateDoc('characters', user.uid, {
        hp: playerHp,
        inventory: finalInventory
      });

      setCharacter((prev) =>
        prev ? { ...prev, hp: playerHp, inventory: finalInventory } : null
      );
      setConsumedPotionInstanceIds([]);
      setMsg('You successfully escaped!');
      setIsEscaping(true);
      setIsBattleOver(true);

      setTimeout(() => {
        const dest = buildReturnMapUrl();
        router.push(dest);
      }, 2000);
    } catch (error) {
      console.error('Error saving escape:', error);
      setMsg('Could not save escape. Please try again.');
      setIsPaused(false);
    }
  };

  const usePotion = (item: InventoryItem) => {
    if (!user || !character || !gameItems[item.itemId] || isPaused) return;

    if (playerHp >= battleStats.maxHp) {
      setMsg('HP is already full.');
      setTimeout(() => setMsg(''), 2000);
      return;
    }

    const potion = gameItems[item.itemId];
    const healFlat = potion.stats?.heal?.flat || 0;
    const healMult = potion.stats?.heal?.mult || 0;
    const healAmount = (healFlat > 0 || healMult > 0)
      ? Math.round(healFlat + (battleStats.maxHp * (healMult > 1 ? healMult - 1 : healMult)))
      : 20;
    const newHp = Math.min(battleStats.maxHp, playerHp + healAmount);

    // Temporary, combat-only state: nothing is written to Firestore or to the
    // persisted character until the battle is consolidated (win/loss).
    setPlayerHp(newHp);
    setConsumedPotionInstanceIds((prev) => [...prev, item.instanceId]);
    setShowInventory(false);
    setMsg(`Healed for ${healAmount} HP! (${newHp}/${battleStats.maxHp})`);
    setTimeout(() => setMsg(''), 2500);
  };

  return {
    mode,
    isLoading,
    msg,
    character,
    currentEncounter,
    foe,
    questions,
    currentQuestion,
    questionQueue,
    abandonGroupTurnCost: questionQueue.length,
    showSubquestionMenu,
    currentQIndex,
    playerHp,
    playerMaxHp: battleStats.maxHp,
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
    continueSubquestion,
    abandonGroup,
    skipQuestion,
    executeEscape,
    usePotion,
    handleFightAgain,
    handleReturnToMap,
    combatEffect,
    battleInventory,
    specialFightActive,
    activeSpecialFightId,
    isPhase2,
    handleSpecialFightComplete,
  };
}

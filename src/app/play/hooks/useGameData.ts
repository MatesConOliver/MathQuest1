
import { useEffect, useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { Character, EncounterDoc, FoeDoc, GameItem, GameLocation, StoryEvent, SubArea, UnlockedSubArea } from '@/types/game';
import { getAllDocs, getDoc, callApi, updateDoc, db } from '@/lib/firebase';
import { getUnlockStatus } from '@/lib/unlock';

export function useGameData(user: User | null) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});
  const [foes, setFoes] = useState<Record<string, FoeDoc>>({});
  const [subAreas, setSubAreas] = useState<Record<string, SubArea>>({});
  const [activeStory, setActiveStory] = useState<StoryEvent | null>(null);
  const [msg, setMsg] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    const fetchGameData = async () => {
      setIsLoading(true);
      try {
        const [charData, encs, items, foeData, subAreaData, locationData, unlockedSnap] = await Promise.all([
          getDoc<Character>('characters', user.uid),
          getAllDocs<EncounterDoc>('encounters'),
          getAllDocs<GameItem>('items'),
          getAllDocs<FoeDoc>('foes'),
          getAllDocs<SubArea>('subAreas'),
          getAllDocs<GameLocation>('locations'),
          getDocs(collection(db, `characters/${user.uid}/unlockedSubAreas`)),
        ]);

        if (charData) {
          setCharacter(charData);
        } else {
          router.push('/character/new');
          return;
        }

        const itemsMap = items.reduce(
          (acc, item) => ({ ...acc, [item.id]: item }),
          {}
        );
        setGameItems(itemsMap);

        const foesMap = foeData.reduce<Record<string, FoeDoc>>((acc, foe) => {
            if (foe.id) {
                acc[foe.id] = foe;
            }
            return acc;
        }, {});
        setFoes(foesMap);

        const subAreasMap = subAreaData.reduce<Record<string, SubArea>>((acc, sa) => {
            if (sa.id) {
                acc[sa.id] = sa;
            }
            return acc;
        }, {});
        setSubAreas(subAreasMap);

        const locationsMap = locationData.reduce<Record<string, GameLocation>>((acc, loc) => {
            if (loc.id) {
                acc[loc.id] = loc;
            }
            return acc;
        }, {});

        const unlockedSubAreas: { [key: string]: UnlockedSubArea } = {};
        unlockedSnap.forEach(doc => { unlockedSubAreas[doc.id] = doc.data() as UnlockedSubArea });

        // Only expose encounters whose location AND sub-area are actually unlocked,
        // so stray/test content or direct `?id=` links can't bypass progression.
        const reachableEncounters = encs.filter((enc) => {
          const location = locationsMap[enc.locationId];
          const subArea = subAreasMap[enc.subAreaId];
          if (!location || !subArea) return false;
          if (getUnlockStatus(location, charData, unlockedSubAreas).locked) return false;
          if (getUnlockStatus(subArea, charData, unlockedSubAreas).locked) return false;
          return true;
        });
        setEncounters(reachableEncounters);

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

  const getFoe = useCallback((id: string) => foes[id], [foes]);
  const getSubArea = useCallback((id: string) => subAreas[id], [subAreas]);

  const completeStory = async () => {
    if (!user || !activeStory) return;
    try {
        await updateDoc('characters', user.uid, {
            completedStoryEvents: [...(character?.completedStoryEvents || []), activeStory.id]
        });
        setActiveStory(null);
    } catch (error) {
        console.error("Failed to update completed stories: ", error);
        setActiveStory(null); // still hide story on error to not block user
    }
  };


  return { character, setCharacter, encounters, gameItems, foes, subAreas, activeStory, msg, setMsg, isLoading, getFoe, getSubArea, completeStory, setActiveStory };
}

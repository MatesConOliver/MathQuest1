
import { useEffect, useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { Character, EncounterDoc, FoeDoc, GameItem, StoryEvent } from '@/types/game';
import { getAllDocs, getDoc, callApi, updateDoc } from '@/lib/firebase';

export function useGameData(user: User | null) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);
  const [gameItems, setGameItems] = useState<Record<string, GameItem>>({});
  const [foes, setFoes] = useState<Record<string, FoeDoc>>({});
  const [activeStory, setActiveStory] = useState<StoryEvent | null>(null);
  const [msg, setMsg] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;

    const fetchGameData = async () => {
      setIsLoading(true);
      try {
        const [charData, encs, items, foeData] = await Promise.all([
          getDoc<Character>('characters', user.uid),
          getAllDocs<EncounterDoc>('encounters'),
          getAllDocs<GameItem>('items'),
          getAllDocs<FoeDoc>('foes'),
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

        const foesMap = foeData.reduce<Record<string, FoeDoc>>((acc, foe) => {
            if (foe.id) {
                acc[foe.id] = foe;
            }
            return acc;
        }, {});
        setFoes(foesMap);

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


  return { character, setCharacter, encounters, gameItems, foes, activeStory, msg, setMsg, isLoading, getFoe, completeStory, setActiveStory };
}

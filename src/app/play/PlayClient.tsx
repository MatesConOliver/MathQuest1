
'use client';

import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { useBattle } from './hooks/useBattle';

import { Lobby } from './components/Lobby';
import { BattleIntro } from './components/BattleIntro';
import { BattleScreen } from './components/BattleScreen';
import { VictoryScreen } from './components/VictoryScreen';
import { DefeatScreen } from './components/DefeatScreen';
import { StoryPlayer } from '@/components/StoryPlayer';

export default function PlayClient() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const {
    character,
    setCharacter,
    encounters,
    gameItems,
    foes,
    subAreas,
    activeStory,
    msg: gameDataMsg,
    setMsg,
    isLoading: isGameDataLoading,
    getFoe,
    getSubArea,
    completeStory,
  } = useGameData(user);

  const battle = useBattle({
    user,
    character,
    encounters,
    gameItems,
    foes,
    setCharacter,
  });

  if (isAuthLoading || isGameDataLoading || !character) {
    return (
      <div className="w-full h-screen flex items-center justify-center text-lg font-bold text-gray-500 animate-pulse">
        Loading Your Adventure...
      </div>
    );
  }

  if (activeStory) {
    return <StoryPlayer story={activeStory} onComplete={completeStory} />;
  }
  
  const currentSubArea = battle.currentEncounter ? getSubArea(battle.currentEncounter.subAreaId) : null;

  switch (battle.mode) {
    case 'intro':
      return (
        <BattleIntro
          encounter={battle.currentEncounter}
          foe={battle.foe}
          questionCount={battle.questions.length}
          onStartBattle={battle.handleStartBattle}
          character={character}
        />
      );
    case 'battle':
      return (
        <BattleScreen
          character={character}
          foe={battle.foe}
          questions={battle.questions}
          currentQIndex={battle.currentQIndex}
          playerHp={battle.playerHp}
          foeHp={battle.foeHp}
          msg={battle.msg}
          timeLeft={battle.timeLeft}
          totalTime={battle.totalTime}
          isPaused={battle.isPaused}
          isEscaping={battle.isEscaping}
          selectedChoice={battle.selectedChoice}
          gameItems={battle.gameItems}
          showInventory={battle.showInventory}
          setShowInventory={battle.setShowInventory}
          showEscapeConfirm={battle.showEscapeConfirm}
          setShowEscapeConfirm={battle.setShowEscapeConfirm}
          handleAnswer={battle.handleAnswer}
          nextQuestion={battle.nextQuestion}
          skipQuestion={battle.skipQuestion}
          executeEscape={battle.executeEscape}
          usePotion={battle.usePotion}
          subArea={currentSubArea}
        />
      );
    case 'win':
      return (
        <VictoryScreen
          character={character}
          levelUpData={battle.levelUpData}
          lootDrops={battle.lootDrops}
          onFightAgain={battle.handleFightAgain}
          onReturnToMap={battle.handleReturnToMap}
          xpReward={battle.xpReward}
          goldReward={battle.goldReward}
          skillGains={battle.skillGains}
        />
      );
    case 'lose':
      return <DefeatScreen msg={battle.msg} onTryAgain={battle.handleFightAgain} />;
    default:
      return (
        <Lobby
          encounters={encounters}
          onStartEncounter={battle.handleStartEncounter}
          msg={gameDataMsg || battle.msg}
          encounterWinCounts={character.encounterWins || {}}
          getFoe={getFoe}
        />
      );
  }
}

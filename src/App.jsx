import { memo, useCallback, useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import {
  BadgeInfo,
  ChevronRight,
  Clock3,
  Eraser,
  Flame,
  Goal,
  Heart,
  History,
  RefreshCcw,
  Shield,
  Shuffle,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { PLAYER_DATA } from "./players";

const GAME_STATUS = {
  PLAYING: "playing",
  WRONG: "wrong",
  SUCCESS: "success",
  COMPLETE: "complete",
};

const GAME_MODES = [
  {
    id: "today-stars",
    title: "Günümüz Yıldızları",
    description: "Aktif Türk ve dünya yıldızları",
    categories: ["yabanci_yeni", "turk_yeni"],
    icon: Star,
  },
  {
    id: "legends",
    title: "Nostalji / Efsaneler",
    description: "Futbol tarihinden unutulmaz isimler",
    categories: ["yabanci_eski", "turk_eski"],
    icon: History,
  },
  {
    id: "national-league",
    title: "Milli Takım & Süper Lig",
    description: "Türk futbolcular ve yerel hafıza",
    categories: ["turk_yeni", "turk_eski"],
    icon: Users,
  },
];

const DIFFICULTY_STAGES = [
  {
    id: "easy",
    label: "Amatör",
    range: "0-5",
    badgeClass: "border-emerald-300/25 bg-emerald-500/12 text-emerald-200",
    dotClass: "bg-emerald-400",
  },
  {
    id: "medium",
    label: "Profesyonel",
    range: "6-15",
    badgeClass: "border-amber-300/25 bg-amber-500/12 text-amber-100",
    dotClass: "bg-amber-300",
  },
  {
    id: "hard",
    label: "Efsane",
    range: "16+",
    badgeClass: "border-red-300/25 bg-red-500/12 text-red-100",
    dotClass: "bg-red-400",
  },
];

const INITIAL_LIVES = 3;
const QUESTION_SECONDS = 30;
const WRONG_FEEDBACK_MS = 520;
const QUESTION_TRANSITION_MS = 240;
const SUCCESS_STAGGER_MS = 70;
const MAX_LETTER_COLUMNS = 6;
const MIN_LETTER_COLUMNS = 4;
const MAX_APP_WIDTH = "max-w-[450px]";
const SPACE_TILE = { id: "space", letter: " ", isSpace: true };
const TILE_ROTATIONS = ["-1.6deg", "1.1deg", "-0.9deg", "1.8deg", "-1.2deg", "0.7deg", "1.4deg"];

function createTiles(word) {
  return word
    .replace(/\s/g, "")
    .split("")
    .map((letter, index) => ({
      id: `${word}-${letter}-${index}`,
      letter,
    }));
}

function createEmptyGuess(word) {
  return word.split("").map((letter) => (letter === " " ? SPACE_TILE : null));
}

function fisherYatesShuffle(items) {
  const shuffled = [...items];

  for (let currentIndex = shuffled.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }

  return shuffled;
}

function shuffleWord(word) {
  const tiles = fisherYatesShuffle(createTiles(word));
  const cleanWord = word.replace(/\s/g, "");
  const shuffledWord = tiles.map((tile) => tile.letter).join("");

  if (cleanWord.length > 1 && shuffledWord === cleanWord) {
    return shuffleWord(word);
  }

  return tiles;
}

function getModePlayers(mode) {
  return PLAYER_DATA.filter((player) => mode.categories.includes(player.category));
}

function getDifficultyStage(score) {
  if (score <= 5) {
    return DIFFICULTY_STAGES[0];
  }

  if (score <= 15) {
    return DIFFICULTY_STAGES[1];
  }

  return DIFFICULTY_STAGES[2];
}

function selectNextPlayer(playerPool, usedPlayerIds, score) {
  const stage = getDifficultyStage(score);
  const unplayedPlayers = playerPool.filter((player) => !usedPlayerIds.has(player.id));

  if (unplayedPlayers.length === 0) {
    return null;
  }

  const stagedPlayers = unplayedPlayers.filter((player) => player.difficulty === stage.id);

  if (stagedPlayers.length === 0) {
    return null;
  }

  return fisherYatesShuffle(stagedPlayers)[0];
}

function fireSuccessConfetti() {
  confetti({
    particleCount: 70,
    spread: 62,
    origin: { y: 0.62 },
    colors: ["#10b981", "#34d399", "#818cf8", "#ffffff"],
    scalar: 0.85,
  });
}

function App() {
  const [selectedMode, setSelectedMode] = useState(null);
  const [timeAttack, setTimeAttack] = useState(false);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [usedPlayerIds, setUsedPlayerIds] = useState(new Set());
  const [playerIndex, setPlayerIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [shuffledTiles, setShuffledTiles] = useState([]);
  const [status, setStatus] = useState(GAME_STATUS.PLAYING);
  const [hintLevel, setHintLevel] = useState(0);
  const [isChangingQuestion, setIsChangingQuestion] = useState(false);
  const [levelUpMessage, setLevelUpMessage] = useState("");

  const isComplete = status === GAME_STATUS.COMPLETE;
  const isSuccess = status === GAME_STATUS.SUCCESS;
  const targetWord = currentPlayer?.name ?? "";
  const difficultyStage = useMemo(() => getDifficultyStage(score), [score]);

  const selectedTileIds = useMemo(
    () => new Set(selectedTiles.filter((tile) => tile && !tile.isSpace).map((tile) => tile.id)),
    [selectedTiles],
  );

  const guessedWord = useMemo(
    () => selectedTiles.map((tile) => tile?.letter ?? "").join(""),
    [selectedTiles],
  );

  const hasSelectedLetters = useMemo(
    () => selectedTiles.some((tile) => tile && !tile.isSpace),
    [selectedTiles],
  );

  const progressLabel = useMemo(
    () => `${Math.min(playerIndex + 1, players.length)} / ${players.length}`,
    [playerIndex, players.length],
  );

  const startMode = useCallback(
    (mode) => {
      const modePlayers = getModePlayers(mode);
      const firstPlayer = selectNextPlayer(modePlayers, new Set(), 0);

      setSelectedMode(mode);
      setPlayers(modePlayers);
      setCurrentPlayer(firstPlayer);
      setUsedPlayerIds(firstPlayer ? new Set([firstPlayer.id]) : new Set());
      setPlayerIndex(0);
      setScore(0);
      setLives(INITIAL_LIVES);
      setTimeLeft(QUESTION_SECONDS);
      setSelectedTiles([]);
      setShuffledTiles([]);
      setHintLevel(0);
      setLevelUpMessage("");
      setStatus(firstPlayer ? GAME_STATUS.PLAYING : GAME_STATUS.COMPLETE);
      setIsChangingQuestion(false);
    },
    [],
  );

  const goToNextPlayer = useCallback(
    ({ keepTransition = true, scoreForSelection = score } = {}) => {
      if (keepTransition) {
        setIsChangingQuestion(true);
      }

      window.setTimeout(
        () => {
          const nextPlayer = selectNextPlayer(players, usedPlayerIds, scoreForSelection);

          if (!nextPlayer) {
            setStatus(GAME_STATUS.COMPLETE);
            setIsChangingQuestion(false);
            return;
          }

          setCurrentPlayer(nextPlayer);
          setUsedPlayerIds((currentUsedIds) => new Set([...currentUsedIds, nextPlayer.id]));
          setPlayerIndex((currentIndex) => currentIndex + 1);
          setIsChangingQuestion(false);
        },
        keepTransition ? QUESTION_TRANSITION_MS : 0,
      );
    },
    [players, score, usedPlayerIds],
  );

  const registerMiss = useCallback(
    ({ advanceToNext = false } = {}) => {
      if (!targetWord || status !== GAME_STATUS.PLAYING) {
        return;
      }

      setStatus(GAME_STATUS.WRONG);
      setLives((currentLives) => {
        const nextLives = Math.max(0, currentLives - 1);

        window.setTimeout(() => {
          if (nextLives <= 0) {
            setStatus(GAME_STATUS.COMPLETE);
            return;
          }

          if (advanceToNext) {
            goToNextPlayer({ keepTransition: true });
            return;
          }

          setSelectedTiles(createEmptyGuess(targetWord));
          setStatus(GAME_STATUS.PLAYING);
        }, WRONG_FEEDBACK_MS);

        return nextLives;
      });
    },
    [goToNextPlayer, status, targetWord],
  );

  const handleTileSelect = useCallback(
    (tile) => {
      if (isSuccess || status === GAME_STATUS.WRONG || status === GAME_STATUS.COMPLETE) {
        return;
      }

      setSelectedTiles((currentTiles) => {
        if (currentTiles.some((selectedTile) => selectedTile?.id === tile.id)) {
          return currentTiles;
        }

        const nextOpenIndex = currentTiles.findIndex((selectedTile) => selectedTile === null);
        if (nextOpenIndex === -1) {
          return currentTiles;
        }

        return currentTiles.map((selectedTile, index) => (index === nextOpenIndex ? tile : selectedTile));
      });
    },
    [isSuccess, status],
  );

  const handleSlotClear = useCallback(
    (slotIndex) => {
      if (isSuccess || status === GAME_STATUS.WRONG || !selectedTiles[slotIndex]?.letter.trim()) {
        return;
      }

      setSelectedTiles((currentTiles) =>
        currentTiles.map((selectedTile, index) => (index === slotIndex ? null : selectedTile)),
      );
    },
    [isSuccess, selectedTiles, status],
  );

  const handleBackspace = useCallback(() => {
    if (isSuccess || status !== GAME_STATUS.PLAYING) {
      return;
    }

    setSelectedTiles((currentTiles) => {
      const lastSelectedIndex = currentTiles.findLastIndex((tile) => tile && !tile.isSpace);
      if (lastSelectedIndex === -1) {
        return currentTiles;
      }

      return currentTiles.map((selectedTile, index) => (index === lastSelectedIndex ? null : selectedTile));
    });
  }, [isSuccess, status]);

  const handleClear = useCallback(() => {
    if (isSuccess || !hasSelectedLetters) {
      return;
    }

    setSelectedTiles(createEmptyGuess(targetWord));
    setStatus(GAME_STATUS.PLAYING);
  }, [hasSelectedLetters, isSuccess, targetWord]);

  const handleShuffle = useCallback(() => {
    if (!targetWord || isSuccess || status === GAME_STATUS.WRONG) {
      return;
    }

    setShuffledTiles(shuffleWord(targetWord));
  }, [isSuccess, status, targetWord]);

  const handleNextPlayer = useCallback(() => {
    if (!isSuccess || isChangingQuestion) {
      return;
    }

    goToNextPlayer({ keepTransition: true });
  }, [goToNextPlayer, isChangingQuestion, isSuccess]);

  const handleRestart = useCallback(() => {
    if (selectedMode) {
      startMode(selectedMode);
    }
  }, [selectedMode, startMode]);

  const handleMenu = useCallback(() => {
    setSelectedMode(null);
    setPlayers([]);
    setCurrentPlayer(null);
    setUsedPlayerIds(new Set());
    setPlayerIndex(0);
    setLevelUpMessage("");
    setStatus(GAME_STATUS.PLAYING);
    setIsChangingQuestion(false);
  }, []);

  useEffect(() => {
    if (!selectedMode) {
      return;
    }

    if (!currentPlayer) {
      setStatus(GAME_STATUS.COMPLETE);
      return;
    }

    setSelectedTiles(createEmptyGuess(currentPlayer.name));
    setShuffledTiles(shuffleWord(currentPlayer.name));
    setHintLevel(0);
    setTimeLeft(QUESTION_SECONDS);
    setStatus(GAME_STATUS.PLAYING);
  }, [currentPlayer, selectedMode]);

  useEffect(() => {
    if (
      !targetWord ||
      status !== GAME_STATUS.PLAYING ||
      selectedTiles.length !== targetWord.length ||
      selectedTiles.some((tile) => tile === null)
    ) {
      return;
    }

    if (guessedWord === targetWord) {
      const nextScore = score + 1;
      const currentStage = getDifficultyStage(score);
      const nextStage = getDifficultyStage(nextScore);

      setStatus(GAME_STATUS.SUCCESS);
      setScore(nextScore);
      if (currentStage.id !== nextStage.id) {
        setLevelUpMessage(`Seviye Atladın! ${nextStage.label}`);
      }
      fireSuccessConfetti();
      return;
    }

    registerMiss();
  }, [guessedWord, registerMiss, score, selectedTiles, status, targetWord]);

  useEffect(() => {
    if (!selectedMode || !timeAttack || status !== GAME_STATUS.PLAYING || isChangingQuestion) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          window.clearInterval(timer);
          registerMiss({ advanceToNext: true });
          return 0;
        }

        return currentTime - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isChangingQuestion, registerMiss, selectedMode, status, timeAttack]);

  useEffect(() => {
    if (!selectedMode || status !== GAME_STATUS.PLAYING) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.repeat) {
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        handleBackspace();
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const keyCandidates = new Set([event.key.toUpperCase(), event.key.toLocaleUpperCase("tr-TR")]);
      const nextTile = shuffledTiles.find((tile) => keyCandidates.has(tile.letter) && !selectedTileIds.has(tile.id));

      if (nextTile) {
        event.preventDefault();
        handleTileSelect(nextTile);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBackspace, handleTileSelect, selectedMode, selectedTileIds, shuffledTiles, status]);

  useEffect(() => {
    if (!levelUpMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setLevelUpMessage(""), 1500);
    return () => window.clearTimeout(timer);
  }, [levelUpMessage]);

  if (!selectedMode) {
    return (
      <ModeSelectScreen
        modes={GAME_MODES}
        timeAttack={timeAttack}
        onToggleTimeAttack={() => setTimeAttack((currentValue) => !currentValue)}
        onStart={startMode}
      />
    );
  }

  if (isComplete) {
    return (
      <GameOver
        lives={lives}
        modeTitle={selectedMode.title}
        onMenu={handleMenu}
        onRestart={handleRestart}
        score={score}
        timeAttack={timeAttack}
        total={players.length}
      />
    );
  }

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-0 font-body text-slate-100 sm:px-4">
      <section
        className={`relative flex h-dvh w-full ${MAX_APP_WIDTH} flex-col overflow-hidden border-x border-emerald-200/10 bg-[#03120f]/82 shadow-[0_0_90px_rgba(16,185,129,0.18)] backdrop-blur-xl sm:h-[min(860px,100dvh)] sm:rounded-[28px] sm:border`}
      >
        <PitchBackdrop />
        {levelUpMessage ? <LevelUpToast message={levelUpMessage} /> : null}

        <header className="relative z-10 shrink-0 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-950/40">
                <Goal className="size-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300">Anagram FC</p>
                <h1 className="font-display text-xl font-black leading-none tracking-wide text-white">Futbol Anagram</h1>
              </div>
            </div>

            <ScoreBadge score={score} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Lives lives={lives} />
            <DifficultyBadge stage={difficultyStage} />
            <span className="truncate rounded-full border border-white/10 bg-white/7 px-3 py-1.5 text-xs font-bold text-slate-300">
              {selectedMode.title}
            </span>
          </div>

          {timeAttack ? <TimerBar timeLeft={timeLeft} totalTime={QUESTION_SECONDS} /> : null}
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-3">
          <section
            className={`flex min-h-0 flex-1 flex-col justify-center transition duration-300 ease-out ${
              isChangingQuestion ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="size-4 text-emerald-300" />
                Oyuncu {progressLabel}
              </span>
              <span className="rounded-full bg-white/7 px-2.5 py-1 text-slate-300">Anagram</span>
            </div>

            <GuessBoard selectedTiles={selectedTiles} status={status} onSlotClear={handleSlotClear} />

            <HintPanel
              disabled={hintLevel >= 2 || isSuccess}
              hintLevel={hintLevel}
              onReveal={() => setHintLevel((currentLevel) => Math.min(2, currentLevel + 1))}
              player={currentPlayer}
            />
          </section>
        </div>

        <footer className="sticky bottom-0 z-10 shrink-0 border-t border-emerald-200/10 bg-[#02080f]/92 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-22px_54px_rgba(1,8,15,0.82)] backdrop-blur-xl">
          <LetterBank
            disabled={isSuccess || status === GAME_STATUS.WRONG}
            onSelect={handleTileSelect}
            selectedTileIds={selectedTileIds}
            tiles={shuffledTiles}
          />

          <div className="mt-4 grid grid-cols-[1fr_1.4fr] gap-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={isSuccess || !hasSelectedLetters}
              className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-800/80 px-4 font-display text-sm font-black tracking-wider text-slate-200 transition duration-300 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser className="size-4" />
              Temizle
            </button>

            {isSuccess ? (
              <ShimmerButton onClick={handleNextPlayer} disabled={isChangingQuestion} />
            ) : (
              <button
                type="button"
                onClick={handleShuffle}
                disabled={status === GAME_STATUS.WRONG || !shuffledTiles.length}
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 font-display text-sm font-black tracking-wider text-slate-950 shadow-[0_0_28px_rgba(16,185,129,0.32)] transition duration-300 ease-out hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-emerald-500/35 disabled:text-emerald-950/60"
              >
                <Shuffle className="size-4" />
                Karıştır
              </button>
            )}
          </div>
        </footer>
      </section>
    </main>
  );
}

function ModeSelectScreen({ modes, onStart, onToggleTimeAttack, timeAttack }) {
  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-0 font-body text-slate-100 sm:px-4">
      <section
        className={`relative flex h-dvh w-full ${MAX_APP_WIDTH} flex-col overflow-hidden border-x border-emerald-200/10 bg-[#03120f]/84 px-4 py-5 shadow-[0_0_90px_rgba(16,185,129,0.2)] backdrop-blur-xl sm:h-[min(860px,100dvh)] sm:rounded-[28px] sm:border`}
      >
        <PitchBackdrop />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center">
          <div className="mb-6">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-500/15 text-emerald-300">
              <Goal className="size-8" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">Anagram FC</p>
            <h1 className="mt-2 font-display text-3xl font-black leading-tight tracking-wide text-white">Modunu seç</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
              Havuzunu belirle, istersen 30 saniyelik zaman baskısıyla oyna.
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleTimeAttack}
            className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-left transition duration-300 ease-out active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-indigo-500/15 text-indigo-200">
                <Zap className="size-5" />
              </span>
              <span>
                <span className="block font-display text-sm font-black tracking-wide text-white">Zaman Yarışı</span>
                <span className="block text-xs font-semibold text-slate-500">Her soru için 30 saniye</span>
              </span>
            </span>
            <span
              className={`flex h-7 w-12 items-center rounded-full p-1 transition duration-300 ease-out ${
                timeAttack ? "justify-end bg-emerald-500" : "justify-start bg-slate-700"
              }`}
              aria-hidden="true"
            >
              <span className="size-5 rounded-full bg-white shadow" />
            </span>
          </button>

          <div className="grid gap-3">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const playerCount = getModePlayers(mode).length;

              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onStart(mode)}
                  className="group rounded-2xl border border-white/10 bg-slate-900/76 p-4 text-left shadow-lg shadow-slate-950/20 transition duration-300 ease-out hover:border-emerald-300/35 hover:bg-slate-900 hover:shadow-[0_0_28px_rgba(16,185,129,0.16)] active:scale-[0.99]"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl border border-emerald-200/15 bg-emerald-500/12 text-emerald-200 transition duration-300 ease-out group-hover:bg-emerald-500 group-hover:text-slate-950">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-base font-black tracking-wide text-white">{mode.title}</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-500">{mode.description}</span>
                    </span>
                    <span className="rounded-full bg-white/7 px-2.5 py-1 text-xs font-bold text-slate-300">
                      {playerCount}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}

function ScoreBadge({ score }) {
  return (
    <div className="rounded-2xl border border-indigo-300/20 bg-indigo-500/12 px-3 py-2 text-right shadow-[0_0_24px_rgba(99,102,241,0.16)]">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-indigo-200">
        <Trophy className="size-3.5" />
        Skor
      </div>
      <p className="font-display text-2xl font-black leading-none tracking-wider text-white">{score}</p>
    </div>
  );
}

function Lives({ lives }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-red-300/15 bg-red-500/10 px-3 py-1.5"
      aria-label={`Can: ${lives}`}
    >
      <span className="mr-1 text-[11px] font-black uppercase tracking-[0.12em] text-red-100/80">Can</span>
      {Array.from({ length: INITIAL_LIVES }).map((_, index) => (
        <Heart
          key={index}
          className={`size-4 ${index < lives ? "fill-red-400 text-red-300" : "text-slate-700"}`}
        />
      ))}
    </div>
  );
}

function DifficultyBadge({ stage }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-display text-xs font-black tracking-wide shadow-[0_0_18px_rgba(16,185,129,0.12)] ${stage.badgeClass}`}
      title={`Skor aralığı: ${stage.range}`}
    >
      <span className={`size-2 rounded-full ${stage.dotClass}`} />
      Seviye: {stage.label}
    </div>
  );
}

function LevelUpToast({ message }) {
  return (
    <div className="pointer-events-none absolute inset-x-4 top-24 z-30 flex justify-center">
      <div className="animate-level-up rounded-2xl border border-emerald-200/30 bg-slate-950/92 px-5 py-3 text-center shadow-[0_0_40px_rgba(16,185,129,0.35)] backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Seviye Atladın!</p>
        <p className="mt-1 font-display text-lg font-black tracking-wide text-white">{message.replace("Seviye Atladın! ", "")}</p>
      </div>
    </div>
  );
}

function TimerBar({ timeLeft, totalTime }) {
  const percentage = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5 text-emerald-300" />
          Süre
        </span>
        <span className={timeLeft <= 7 ? "text-red-300" : "text-slate-300"}>{timeLeft}s</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            timeLeft <= 7 ? "bg-red-400" : "bg-emerald-400"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

const GuessBoard = memo(function GuessBoard({ selectedTiles, status, onSlotClear }) {
  const isSuccess = status === GAME_STATUS.SUCCESS;
  const isWrong = status === GAME_STATUS.WRONG;
  const rows = selectedTiles.reduce(
    (wordRows, tile, index) => {
      if (tile?.isSpace) {
        if (wordRows.at(-1).length > 0) {
          wordRows.push([]);
        }
        return wordRows;
      }

      wordRows.at(-1).push({ tile, index });
      return wordRows;
    },
    [[]],
  ).filter((row) => row.length > 0);

  return (
    <div
      className={`flex min-h-[7rem] flex-col items-center justify-center gap-2 ${isWrong ? "animate-shake" : ""}`}
      aria-label="Tahmin kutuları"
    >
      {rows.map((row, rowIndex) => (
        <div
          key={`guess-row-${rowIndex}`}
          className="grid w-full max-w-full justify-center gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
            width: `min(100%, ${row.length * 2.6}rem)`,
          }}
        >
          {row.map(({ tile, index }) => (
            <button
              key={`${tile?.id ?? "empty"}-${index}`}
              type="button"
              onClick={() => onSlotClear(index)}
              disabled={!tile || isSuccess || isWrong}
              className={`aspect-square min-h-7 rounded-xl border font-display font-black tracking-wider transition duration-300 ease-out active:scale-95 ${
                row.length > 10 ? "text-xs sm:text-sm" : "text-base sm:text-lg"
              } ${
                isSuccess
                  ? "border-emerald-200/80 bg-emerald-400 text-slate-950 shadow-[0_0_26px_rgba(52,211,153,0.66)]"
                  : isWrong
                    ? "border-red-300/80 bg-red-500/85 text-white shadow-lg shadow-red-950/40"
                    : tile
                      ? "border-violet-300/60 bg-indigo-500/25 text-white shadow-[0_0_22px_rgba(139,92,246,0.34)]"
                      : "border-dashed border-emerald-300/55 bg-emerald-500/[0.11] text-emerald-100 shadow-inner shadow-emerald-950/30"
              }`}
              style={isSuccess ? { animation: `success-bounce 520ms ${index * SUCCESS_STAGGER_MS}ms both` } : undefined}
              aria-label={tile ? `${tile.letter} harfini geri al` : `${index + 1}. boş kutu`}
            >
              {tile?.letter ?? ""}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
});

const LetterBank = memo(function LetterBank({ tiles, selectedTileIds, disabled, onSelect }) {
  const columnCount = Math.min(
    MAX_LETTER_COLUMNS,
    Math.max(MIN_LETTER_COLUMNS, Math.ceil(Math.sqrt(tiles.length * 1.55))),
  );

  return (
    <div
      className="mx-auto grid w-fit max-w-full justify-center gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(42px, 54px))` }}
      aria-label="Karışık harfler"
    >
      {tiles.map((tile, index) => {
        const isUsed = selectedTileIds.has(tile.id);

        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onSelect(tile)}
            disabled={disabled || isUsed}
            className="aspect-[1.08] rotate-[var(--tile-rotation)] rounded-xl border border-emerald-200/20 bg-gradient-to-br from-[#18332f] to-[#08121f] font-display text-lg font-black tracking-wider text-emerald-100 shadow-[0_10px_22px_rgba(0,0,0,0.34)] transition duration-300 ease-out hover:rotate-0 hover:border-emerald-300/60 hover:bg-slate-800 hover:shadow-[0_0_24px_rgba(16,185,129,0.28)] active:rotate-0 active:scale-95 disabled:cursor-not-allowed disabled:rotate-0 disabled:border-white/5 disabled:bg-none disabled:bg-slate-900/45 disabled:text-slate-600 disabled:shadow-none"
            style={{ "--tile-rotation": TILE_ROTATIONS[index % TILE_ROTATIONS.length] }}
            aria-label={`${tile.letter} harfini seç`}
          >
            {tile.letter}
          </button>
        );
      })}
    </div>
  );
});

const HintPanel = memo(function HintPanel({ disabled, hintLevel, onReveal, player }) {
  const buttonLabel = hintLevel === 0 ? "Ülkeyi Göster" : "Kulübü Göster";

  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_0_28px_rgba(15,23,42,0.42)] transition duration-300 ease-out">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
          <BadgeInfo className="size-4 text-emerald-300" />
          İpucu
        </div>
        <button
          type="button"
          onClick={onReveal}
          disabled={disabled}
          className="rounded-full border border-emerald-300/20 bg-emerald-500/12 px-3 py-1 font-display text-xs font-black tracking-wide text-emerald-200 transition duration-300 ease-out hover:border-emerald-200/45 hover:shadow-[0_0_18px_rgba(16,185,129,0.24)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {hintLevel >= 2 ? "Tamam" : buttonLabel}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <HintMetric isVisible={hintLevel >= 1} label="Ülke" value={player.nationality} />
        <HintMetric isVisible={hintLevel >= 2} label="Kulüp" value={player.club} />
      </div>
    </div>
  );
});

const HintMetric = memo(function HintMetric({ isVisible, label, value }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-950/55 px-3 py-2 transition duration-300 ease-out">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 truncate font-display text-sm font-black tracking-wide transition duration-300 ease-out ${isVisible ? "text-white" : "text-slate-600"}`}>
        {isVisible ? value : "Kilitli"}
      </p>
    </div>
  );
});

function ShimmerButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative inline-flex h-[52px] overflow-hidden rounded-2xl bg-emerald-500 px-4 font-display text-sm font-black tracking-wider text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.38)] transition duration-300 ease-out hover:bg-emerald-400 active:scale-95 disabled:cursor-wait disabled:opacity-70"
    >
      <span className="absolute inset-y-0 left-0 w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      <span className="relative z-10 flex w-full items-center justify-center gap-2">
        <Sparkles className="size-4" />
        Sıradaki Oyuncu
        <ChevronRight className="size-4" />
      </span>
    </button>
  );
}

function GameOver({ lives, modeTitle, onMenu, onRestart, score, timeAttack, total }) {
  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-4 font-body text-slate-100">
      <section
        className={`relative w-full ${MAX_APP_WIDTH} overflow-hidden rounded-[30px] border border-emerald-200/10 bg-[#03120f]/88 p-6 text-center shadow-[0_0_90px_rgba(16,185,129,0.2)]`}
      >
        <PitchBackdrop />
        <div className="relative z-10">
          <div className="mx-auto grid size-20 place-items-center rounded-[28px] bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-950/45">
            <Trophy className="size-10" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">Final Düdüğü</p>
          <h2 className="mt-2 font-display text-3xl font-black tracking-wide text-white">Oyun Bitti</h2>
          <p className="mx-auto mt-3 max-w-xs text-sm font-medium leading-6 text-slate-400">
            {modeTitle} modunda {total} futbolcudan {score} tanesini doğru bildin.
          </p>

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.055] p-4">
            <div className="flex items-center justify-center gap-3">
              <Flame className="size-6 text-amber-300" />
              <span className="font-display text-5xl font-black tracking-wider text-white">{score}</span>
              <span className="text-xl font-black text-slate-500">/ {total}</span>
            </div>
            <div className="mt-3 flex items-center justify-center gap-3 text-xs font-bold text-slate-400">
              <span>Kalan can: {lives}</span>
              {timeAttack ? <span>Zaman yarışı</span> : null}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onMenu}
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-800/80 px-4 font-display text-sm font-black tracking-wider text-slate-100 transition duration-300 ease-out active:scale-95"
            >
              Mod Seç
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 font-display text-sm font-black tracking-wider text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.35)] transition duration-300 ease-out hover:bg-emerald-400 active:scale-95"
            >
              <RefreshCcw className="size-5" />
              Yeniden Başla
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function PitchBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(16,185,129,0.18),transparent_38%),radial-gradient(circle_at_50%_92%,rgba(79,70,229,0.14),transparent_32%)]" />
      <div className="absolute inset-x-6 top-28 h-48 rounded-[38px] border border-emerald-300/10 bg-emerald-500/[0.035] shadow-[inset_0_0_42px_rgba(16,185,129,0.08)]" />
      <div className="absolute left-1/2 top-28 h-48 w-px -translate-x-1/2 bg-emerald-200/10" />
      <div className="absolute left-1/2 top-44 size-20 -translate-x-1/2 rounded-full border border-emerald-200/10" />
      <div className="absolute -right-14 bottom-40 size-52 rounded-full border border-violet-300/10 bg-violet-500/[0.045]" />
    </div>
  );
}

export default App;

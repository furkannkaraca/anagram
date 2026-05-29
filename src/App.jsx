import { memo, useCallback, useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import {
  BadgeInfo,
  ChevronRight,
  Clock3,
  Copy,
  Flame,
  Goal,
  Heart,
  History,
  House,
  Lightbulb,
  Play,
  RefreshCw,
  RefreshCcw,
  SkipForward,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users,
  UserPlus,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import { PLAYER_DATA } from "./players";
import {
  INITIAL_PASS_RIGHTS,
  ONLINE_MATCH_SECONDS,
  ONLINE_QUESTION_COUNT,
  QUESTION_WRONG_ATTEMPTS,
  createOnlineRoom,
  determineWinner,
  getOnlineRoom,
  joinOnlineRoom,
  subscribeToRoom,
  updateOnlineRoom,
} from "./multiplayer";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

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
    badgeClass: "bg-emerald-500/15 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.2)]",
    dotClass: "bg-emerald-400",
  },
  {
    id: "medium",
    label: "Profesyonel",
    range: "6-15",
    badgeClass: "bg-amber-500/15 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.18)]",
    dotClass: "bg-amber-300",
  },
  {
    id: "hard",
    label: "Efsane",
    range: "16+",
    badgeClass: "bg-red-500/15 text-red-100 shadow-[0_0_18px_rgba(248,113,113,0.18)]",
    dotClass: "bg-red-400",
  },
];

const INITIAL_LIVES = 3;
const INITIAL_HINT_RIGHTS = 3;
const MAX_HINT_RIGHTS = 5;
const HINT_REWARD_STEP = 3;
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
  const tiles = [];
  let cleanIndex = 0;
  let wordIndex = 0;

  word.split("").forEach((letter) => {
    if (letter === " ") {
      wordIndex += 1;
      return;
    }

    tiles.push({
      cleanIndex,
      id: `${word}-${letter}-${cleanIndex}`,
      letter,
      wordIndex,
    });
    cleanIndex += 1;
  });

  return tiles;
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

function shuffleTilesUntilDifferent(tiles) {
  if (tiles.length <= 1 || new Set(tiles.map((tile) => tile.letter)).size <= 1) {
    return [...tiles];
  }

  const shuffled = fisherYatesShuffle(tiles);
  const originalWord = tiles.map((tile) => tile.letter).join("");
  const shuffledWord = shuffled.map((tile) => tile.letter).join("");

  if (shuffledWord === originalWord) {
    return shuffleTilesUntilDifferent(tiles);
  }

  return shuffled;
}

function shuffleWord(word, difficultyId = "hard") {
  const tiles = createTiles(word);
  const hasMultipleWords = word.includes(" ");

  if (difficultyId === "easy" && hasMultipleWords) {
    const groupedTiles = word.split(" ").map((_, wordIndex) => tiles.filter((tile) => tile.wordIndex === wordIndex));
    return groupedTiles.flatMap((wordTiles) => shuffleTilesUntilDifferent(wordTiles));
  }

  return shuffleTilesUntilDifferent(tiles);
}

function getWordIndexAtSlot(word, slotIndex) {
  return word
    .slice(0, Math.max(0, slotIndex))
    .split("")
    .filter((letter) => letter === " ").length;
}

function getActiveWordIndex(word, selectedTiles) {
  const nextOpenIndex = selectedTiles.findIndex((tile) => tile === null);

  if (nextOpenIndex !== -1) {
    return getWordIndexAtSlot(word, nextOpenIndex);
  }

  return Math.max(0, word.split(" ").length - 1);
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

function getLetterColumnCount(tileCount) {
  if (tileCount <= MAX_LETTER_COLUMNS) {
    return Math.max(1, tileCount);
  }

  return Math.min(
    MAX_LETTER_COLUMNS,
    Math.max(MIN_LETTER_COLUMNS, Math.ceil(Math.sqrt(tileCount * 1.55))),
  );
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
  const [onlineSession, setOnlineSession] = useState(null);
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
  const [hintRights, setHintRights] = useState(INITIAL_HINT_RIGHTS);
  const [wrongAttempts, setWrongAttempts] = useState(0);
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

  const usesStagedKeyboard = difficultyStage.id === "easy" && targetWord.includes(" ");
  const activeWordIndex = useMemo(
    () => getActiveWordIndex(targetWord, selectedTiles),
    [selectedTiles, targetWord],
  );
  const keyboardTiles = useMemo(
    () =>
      usesStagedKeyboard
        ? shuffledTiles.filter((tile) => tile.wordIndex === activeWordIndex)
        : shuffledTiles,
    [activeWordIndex, shuffledTiles, usesStagedKeyboard],
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
      setHintRights(INITIAL_HINT_RIGHTS);
      setWrongAttempts(0);
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
      setWrongAttempts((currentAttempts) => {
        const nextAttempts = Math.min(QUESTION_WRONG_ATTEMPTS, currentAttempts + 1);

        if (nextAttempts >= QUESTION_WRONG_ATTEMPTS) {
          window.setTimeout(() => {
            setStatus(GAME_STATUS.COMPLETE);
          }, WRONG_FEEDBACK_MS);
        }

        return nextAttempts;
      });
      setLives((currentLives) => {
        const nextLives = Math.max(0, currentLives - 1);

        window.setTimeout(() => {
          if (nextLives <= 0) {
            setStatus(GAME_STATUS.COMPLETE);
            return;
          }

          if (wrongAttempts + 1 >= QUESTION_WRONG_ATTEMPTS) {
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
    [goToNextPlayer, status, targetWord, wrongAttempts],
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

    setShuffledTiles(shuffleWord(targetWord, difficultyStage.id));
  }, [difficultyStage.id, isSuccess, status, targetWord]);

  const handleRevealHint = useCallback(() => {
    if (hintLevel >= 2 || hintRights <= 0 || isSuccess) {
      return;
    }

    setHintLevel((currentLevel) => Math.min(2, currentLevel + 1));
    setHintRights((currentRights) => Math.max(0, currentRights - 1));
  }, [hintLevel, hintRights, isSuccess]);

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
    setOnlineSession(null);
    setSelectedMode(null);
    setPlayers([]);
    setCurrentPlayer(null);
    setUsedPlayerIds(new Set());
    setPlayerIndex(0);
    setHintRights(INITIAL_HINT_RIGHTS);
    setWrongAttempts(0);
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
    setShuffledTiles(shuffleWord(currentPlayer.name, difficultyStage.id));
    setHintLevel(0);
    setWrongAttempts(0);
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
      if (nextScore % HINT_REWARD_STEP === 0) {
        setHintRights((currentRights) => Math.min(MAX_HINT_RIGHTS, currentRights + 1));
        setLevelUpMessage("+1 İpucu Kazanıldı!");
      }
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
      const nextTile = keyboardTiles.find((tile) => keyCandidates.has(tile.letter) && !selectedTileIds.has(tile.id));

      if (nextTile) {
        event.preventDefault();
        handleTileSelect(nextTile);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBackspace, handleTileSelect, keyboardTiles, selectedMode, selectedTileIds, status]);

  useEffect(() => {
    if (!levelUpMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setLevelUpMessage(""), 1500);
    return () => window.clearTimeout(timer);
  }, [levelUpMessage]);

  if (onlineSession) {
    return (
      <OnlineMatch
        onExit={handleMenu}
        roomId={onlineSession.roomId}
        seat={onlineSession.seat}
      />
    );
  }

  if (!selectedMode) {
    return (
      <ModeSelectScreen
        modes={GAME_MODES}
        onOnlineSession={setOnlineSession}
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
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-0 font-body text-[#17213a] sm:px-4">
      <section
        className={`album-shell relative flex h-dvh w-full ${MAX_APP_WIDTH} flex-col overflow-hidden shadow-[0_24px_80px_rgba(7,18,34,0.42)] sm:h-[min(860px,100dvh)] sm:rounded-[30px]`}
      >
        <PitchBackdrop />
        {levelUpMessage ? <LevelUpToast message={levelUpMessage} /> : null}

        <header className="relative z-10 shrink-0 px-4 pb-2 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 rotate-[-3deg] place-items-center rounded-xl bg-[#f4bd2e] text-[#17345a] shadow-[0_5px_0_#c73031,0_12px_22px_rgba(10,22,40,0.26)] ring-2 ring-white/70">
                <Goal className="size-6" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#f4bd2e]">Sticker FC</p>
                <h1 className="print-ink font-display text-2xl font-black leading-none tracking-wide text-[#fff2c0]">Futbol Anagram</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMenu}
                className="sticker-cut grid size-11 place-items-center rounded-xl text-[#17345a] transition duration-300 ease-out hover:-rotate-2 active:translate-y-1"
                aria-label="Ana menüye dön"
                title="Ana menüye dön"
              >
                <House className="size-5" />
              </button>
              <ScoreBadge score={score} />
            </div>
          </div>

          <div className="album-paper mt-3 grid rotate-[-0.7deg] gap-2 rounded-[22px] px-2 py-2 ring-2 ring-white/50">
            <div className="flex items-center justify-between gap-2">
              <Lives lives={lives} />
              <HintRightsBadge hintRights={hintRights} />
              <WrongAttemptsBadge wrongAttempts={wrongAttempts} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <DifficultyBadge stage={difficultyStage} />
              <span className="min-w-0 truncate rounded-full bg-[#17345a] px-2.5 py-1.5 font-display text-[10px] font-black tracking-wider text-[#fff2c0] shadow-[0_3px_0_#c73031]">
                {selectedMode.title}
              </span>
            </div>
          </div>

          {timeAttack ? <TimerBar timeLeft={timeLeft} totalTime={QUESTION_SECONDS} /> : null}
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-3">
          <section
            className={`flex min-h-0 flex-1 flex-col justify-center transition duration-300 ease-out ${
              isChangingQuestion ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <div className="album-paper relative rotate-[0.6deg] rounded-[28px] px-3 py-8 ring-2 ring-white/45">
              <GuessBoard selectedTiles={selectedTiles} status={status} onSlotClear={handleSlotClear} />
            </div>

            <HintPanel
              disabled={hintLevel >= 2 || hintRights <= 0 || isSuccess}
              hintLevel={hintLevel}
              hintRights={hintRights}
              onReveal={handleRevealHint}
              player={currentPlayer}
            />
          </section>
        </div>

        <footer className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-[#10213d] via-[#10213d]/78 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
          <div className="relative mx-auto max-w-[360px] pb-14">
            <LetterBank
              disabled={isSuccess || status === GAME_STATUS.WRONG}
              onSelect={handleTileSelect}
              selectedTileIds={selectedTileIds}
              tiles={keyboardTiles}
            />

            <IconActionButton
              className="bottom-0 left-0"
              disabled={isSuccess || !hasSelectedLetters}
              label="Temizle"
              onClick={handleClear}
            >
              <Trash2 className="size-5" />
            </IconActionButton>

            {isSuccess ? (
              <ShimmerButton onClick={handleNextPlayer} disabled={isChangingQuestion} />
            ) : (
              <IconActionButton
                className="bottom-0 right-0"
                disabled={status === GAME_STATUS.WRONG || !keyboardTiles.length}
                label="Karıştır"
                onClick={handleShuffle}
              >
                <RefreshCw className="size-5" />
              </IconActionButton>
            )}
          </div>
        </footer>
      </section>
    </main>
  );
}

function OnlineMatch({ onExit, roomId, seat }) {
  const [room, setRoom] = useState(null);
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [shuffledTiles, setShuffledTiles] = useState([]);
  const [status, setStatus] = useState(GAME_STATUS.PLAYING);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintRights, setHintRights] = useState(INITIAL_HINT_RIGHTS);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [passRights, setPassRights] = useState(INITIAL_PASS_RIGHTS);
  const [toastMessage, setToastMessage] = useState("");
  const [onlineError, setOnlineError] = useState("");

  const opponentSeat = seat === "p1" ? "p2" : "p1";
  const me = room?.players?.[seat];
  const opponent = room?.players?.[opponentSeat];
  const questions = room?.players_data ?? [];
  const currentPlayer = questions[me?.currentQuestionIndex ?? 0];
  const targetWord = currentPlayer?.name ?? "";
  const isWaiting = room?.game_status === "waiting";
  const isPlaying = room?.game_status === "playing";
  const isFinished = room?.game_status === "finished";
  const isEliminated = Boolean(me?.isEliminated);
  const difficultyStage = useMemo(() => getDifficultyStage(me?.score ?? 0), [me?.score]);

  const selectedTileIds = useMemo(
    () => new Set(selectedTiles.filter((tile) => tile && !tile.isSpace).map((tile) => tile.id)),
    [selectedTiles],
  );
  const guessedWord = useMemo(() => selectedTiles.map((tile) => tile?.letter ?? "").join(""), [selectedTiles]);
  const hasSelectedLetters = useMemo(() => selectedTiles.some((tile) => tile && !tile.isSpace), [selectedTiles]);
  const usesStagedKeyboard = difficultyStage.id === "easy" && targetWord.includes(" ");
  const activeWordIndex = useMemo(() => getActiveWordIndex(targetWord, selectedTiles), [selectedTiles, targetWord]);
  const keyboardTiles = useMemo(
    () => (usesStagedKeyboard ? shuffledTiles.filter((tile) => tile.wordIndex === activeWordIndex) : shuffledTiles),
    [activeWordIndex, shuffledTiles, usesStagedKeyboard],
  );

  const updateMyPlayer = useCallback(
    async (playerPatch, roomPatch = {}) => {
      if (!room || !me) {
        return null;
      }

      const nextPlayers = {
        ...room.players,
        [seat]: {
          ...room.players[seat],
          ...playerPatch,
        },
      };

      const nextRoom = {
        ...room,
        ...roomPatch,
        players: nextPlayers,
      };

      setRoom(nextRoom);
      return updateOnlineRoom(room.id, {
        ...roomPatch,
        players: nextPlayers,
      });
    },
    [me, room, seat],
  );

  const finalizeIfNeeded = useCallback(
    async (latestRoom) => {
      const p1 = latestRoom?.players?.p1;
      const p2 = latestRoom?.players?.p2;
      if (!p1 || !p2 || latestRoom.game_status !== "playing") {
        return;
      }

      const p1Done = p1.isFinished || p1.isEliminated || p1.remainingTime <= 0;
      const p2Done = p2.isFinished || p2.isEliminated || p2.remainingTime <= 0;
      if (!p1Done || !p2Done) {
        return;
      }

      await updateOnlineRoom(latestRoom.id, {
        game_status: "finished",
        winner: determineWinner(latestRoom.players),
        finished_at: new Date().toISOString(),
      });
    },
    [],
  );

  useEffect(() => {
    let channel;
    let isMounted = true;

    getOnlineRoom(roomId)
      .then((loadedRoom) => {
        if (isMounted) {
          setRoom(loadedRoom);
        }
      })
      .catch((error) => setOnlineError(error.message || "Oda okunamadı."));

    if (isSupabaseConfigured) {
      channel = subscribeToRoom(roomId, (nextRoom) => {
        setRoom(nextRoom);
        finalizeIfNeeded(nextRoom);
      });
    }

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [finalizeIfNeeded, roomId]);

  useEffect(() => {
    if (!room || room.game_status !== "waiting" || !room.players?.p1?.isReady || !room.players?.p2?.isReady) {
      return;
    }

    updateOnlineRoom(room.id, {
      game_status: "playing",
      started_at: new Date().toISOString(),
    }).catch((error) => setOnlineError(error.message || "Maç başlatılamadı."));
  }, [room]);

  useEffect(() => {
    if (!targetWord) {
      return;
    }

    setSelectedTiles(createEmptyGuess(targetWord));
    setShuffledTiles(shuffleWord(targetWord, difficultyStage.id));
    setHintLevel(0);
    setWrongAttempts(0);
    setStatus(GAME_STATUS.PLAYING);
  }, [difficultyStage.id, me?.currentQuestionIndex, targetWord]);

  useEffect(() => {
    if (!isPlaying || isEliminated || me?.isFinished) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const startedAtMs = room?.started_at ? new Date(room.started_at).getTime() : Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      const nextTime = Math.max(0, ONLINE_MATCH_SECONDS - elapsedSeconds);
      updateMyPlayer({
        remainingTime: nextTime,
        isFinished: nextTime <= 0 || me?.isFinished,
      }).then((updatedRoom) => {
        if (updatedRoom) {
          finalizeIfNeeded(updatedRoom);
        }
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [finalizeIfNeeded, isEliminated, isPlaying, me?.isFinished, room?.started_at, updateMyPlayer]);

  useEffect(() => {
    if (
      !targetWord ||
      !isPlaying ||
      isEliminated ||
      me?.isFinished ||
      status !== GAME_STATUS.PLAYING ||
      selectedTiles.length !== targetWord.length ||
      selectedTiles.some((tile) => tile === null)
    ) {
      return;
    }

    if (guessedWord === targetWord) {
      const nextScore = (me?.score ?? 0) + 1;
      const nextQuestionIndex = (me?.currentQuestionIndex ?? 0) + 1;
      const didFinish = nextQuestionIndex >= ONLINE_QUESTION_COUNT;
      const earnedHint = nextScore % HINT_REWARD_STEP === 0;

      setStatus(GAME_STATUS.SUCCESS);
      if (earnedHint) {
        setHintRights((currentRights) => Math.min(MAX_HINT_RIGHTS, currentRights + 1));
        setToastMessage("+1 İpucu Kazanıldı!");
      }
      fireSuccessConfetti();

      window.setTimeout(() => {
        updateMyPlayer({
          score: nextScore,
          currentQuestionIndex: nextQuestionIndex,
          remainingWrongAttempts: QUESTION_WRONG_ATTEMPTS,
          isFinished: didFinish,
        }).then((updatedRoom) => {
          if (updatedRoom) {
            finalizeIfNeeded(updatedRoom);
          }
        });
      }, QUESTION_TRANSITION_MS);
      return;
    }

    const nextAttempts = Math.min(QUESTION_WRONG_ATTEMPTS, wrongAttempts + 1);
    const remainingWrongAttempts = Math.max(0, QUESTION_WRONG_ATTEMPTS - nextAttempts);
    setWrongAttempts(nextAttempts);
    setStatus(GAME_STATUS.WRONG);

    updateMyPlayer({
      remainingWrongAttempts,
      isEliminated: nextAttempts >= QUESTION_WRONG_ATTEMPTS,
      isFinished: nextAttempts >= QUESTION_WRONG_ATTEMPTS,
    }).then((updatedRoom) => {
      if (updatedRoom) {
        finalizeIfNeeded(updatedRoom);
      }
    });

    window.setTimeout(() => {
      if (nextAttempts < QUESTION_WRONG_ATTEMPTS) {
        setSelectedTiles(createEmptyGuess(targetWord));
        setStatus(GAME_STATUS.PLAYING);
      }
    }, WRONG_FEEDBACK_MS);
  }, [
    finalizeIfNeeded,
    guessedWord,
    isEliminated,
    isPlaying,
    me?.currentQuestionIndex,
    me?.isFinished,
    me?.score,
    selectedTiles,
    status,
    targetWord,
    updateMyPlayer,
    wrongAttempts,
  ]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToastMessage(""), 1500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleReady = async () => {
    await updateMyPlayer({ isReady: true });
  };

  const handleTileSelect = useCallback(
    (tile) => {
      if (!isPlaying || isEliminated || me?.isFinished || status === GAME_STATUS.WRONG || status === GAME_STATUS.SUCCESS) {
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
    [isEliminated, isPlaying, me?.isFinished, status],
  );

  const handleSlotClear = useCallback(
    (slotIndex) => {
      if (!isPlaying || isEliminated || status !== GAME_STATUS.PLAYING || !selectedTiles[slotIndex]?.letter.trim()) {
        return;
      }

      setSelectedTiles((currentTiles) =>
        currentTiles.map((selectedTile, index) => (index === slotIndex ? null : selectedTile)),
      );
    },
    [isEliminated, isPlaying, selectedTiles, status],
  );

  const handleBackspace = useCallback(() => {
    if (!isPlaying || isEliminated || status !== GAME_STATUS.PLAYING) {
      return;
    }

    setSelectedTiles((currentTiles) => {
      const lastSelectedIndex = currentTiles.findLastIndex((tile) => tile && !tile.isSpace);
      if (lastSelectedIndex === -1) {
        return currentTiles;
      }

      return currentTiles.map((selectedTile, index) => (index === lastSelectedIndex ? null : selectedTile));
    });
  }, [isEliminated, isPlaying, status]);

  useEffect(() => {
    if (!isPlaying || isEliminated || status !== GAME_STATUS.PLAYING) {
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
      const nextTile = keyboardTiles.find((tile) => keyCandidates.has(tile.letter) && !selectedTileIds.has(tile.id));

      if (nextTile) {
        event.preventDefault();
        handleTileSelect(nextTile);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBackspace, handleTileSelect, isEliminated, isPlaying, keyboardTiles, selectedTileIds, status]);

  const handleClear = () => {
    setSelectedTiles(createEmptyGuess(targetWord));
    setStatus(GAME_STATUS.PLAYING);
  };

  const handleShuffle = () => {
    setShuffledTiles(shuffleWord(targetWord, difficultyStage.id));
  };

  const handleRevealHint = () => {
    if (hintRights <= 0 || hintLevel >= 2) {
      return;
    }

    setHintLevel((currentLevel) => Math.min(2, currentLevel + 1));
    setHintRights((currentRights) => Math.max(0, currentRights - 1));
  };

  const handlePass = () => {
    if (!isPlaying || passRights <= 0 || isEliminated || me?.isFinished) {
      return;
    }

    const nextQuestionIndex = (me?.currentQuestionIndex ?? 0) + 1;
    const didFinish = nextQuestionIndex >= ONLINE_QUESTION_COUNT;
    setPassRights((currentRights) => Math.max(0, currentRights - 1));
    setWrongAttempts(0);
    updateMyPlayer({
      currentQuestionIndex: nextQuestionIndex,
      remainingWrongAttempts: QUESTION_WRONG_ATTEMPTS,
      isFinished: didFinish,
    }).then((updatedRoom) => {
      if (updatedRoom) {
        finalizeIfNeeded(updatedRoom);
      }
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomId);
    setToastMessage("Oda kodu kopyalandı");
  };

  if (!room || !me) {
    return (
      <LoadingShell onExit={onExit} text={onlineError || "Oda yükleniyor..."} />
    );
  }

  if (isFinished) {
    return <OnlineResult room={room} seat={seat} onExit={onExit} />;
  }

  if (isWaiting) {
    return (
      <OnlineWaitingRoom
        error={onlineError}
        me={me}
        onCopyCode={handleCopyCode}
        onExit={onExit}
        onReady={handleReady}
        opponent={opponent}
        roomId={roomId}
        toastMessage={toastMessage}
      />
    );
  }

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-0 font-body text-[#17213a] sm:px-4">
      <section className={`album-shell relative flex h-dvh w-full ${MAX_APP_WIDTH} flex-col overflow-hidden shadow-[0_24px_80px_rgba(7,18,34,0.42)] sm:h-[min(860px,100dvh)] sm:rounded-[30px]`}>
        <PitchBackdrop />
        {toastMessage ? <LevelUpToast message={toastMessage} /> : null}

        <header className="relative z-10 shrink-0 px-4 pb-2 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#f4bd2e]">Online Sticker Maçı</p>
              <h1 className="print-ink font-display text-2xl font-black leading-none tracking-wide text-[#fff2c0]">Oda {roomId}</h1>
            </div>
            <button
              type="button"
              onClick={onExit}
              className="sticker-cut grid size-11 place-items-center rounded-xl text-[#17345a] transition duration-300 ease-out hover:-rotate-2 active:translate-y-1"
              aria-label="Ana menüye dön"
              title="Ana menüye dön"
            >
              <House className="size-5" />
            </button>
          </div>

          <LiveProgressTracker me={me} opponent={opponent} />
          <TimerBar timeLeft={me.remainingTime} totalTime={ONLINE_MATCH_SECONDS} />
          <div className="album-paper mt-2 flex rotate-[0.6deg] items-center justify-between gap-2 rounded-[20px] px-2 py-2 ring-2 ring-white/45">
            <HintRightsBadge hintRights={hintRights} />
            <WrongAttemptsBadge wrongAttempts={wrongAttempts} />
            <span className="rounded-full bg-[#17345a] px-2.5 py-1.5 font-display text-[10px] font-black tracking-wider text-[#fff2c0] shadow-[0_3px_0_#c73031]">
              {Math.min(me.currentQuestionIndex + 1, ONLINE_QUESTION_COUNT)}/{ONLINE_QUESTION_COUNT}. Soru
            </span>
            <span className="rounded-full bg-[#c73031] px-2.5 py-1.5 font-display text-[10px] font-black tracking-wider text-[#fff2c0] shadow-[0_3px_0_#17345a]">
              Pas x{passRights}
            </span>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-3">
          {isEliminated ? (
            <EliminatedPanel opponent={opponent} />
          ) : (
            <section className="flex min-h-0 flex-1 flex-col justify-center transition duration-300 ease-out">
              <div className="album-paper relative rotate-[0.6deg] rounded-[28px] px-3 py-8 ring-2 ring-white/45">
                <GuessBoard selectedTiles={selectedTiles} status={status} onSlotClear={handleSlotClear} />
              </div>

              <HintPanel
                disabled={hintLevel >= 2 || hintRights <= 0}
                hintLevel={hintLevel}
                hintRights={hintRights}
                onReveal={handleRevealHint}
                player={currentPlayer}
              />
            </section>
          )}
        </div>

        {!isEliminated ? (
          <footer className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-[#10213d] via-[#10213d]/78 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
            <div className="relative mx-auto max-w-[360px] pb-14">
              <LetterBank
                disabled={status === GAME_STATUS.WRONG || status === GAME_STATUS.SUCCESS || me.isFinished}
                onSelect={handleTileSelect}
                selectedTileIds={selectedTileIds}
                tiles={keyboardTiles}
              />

              <IconActionButton
                className="bottom-0 left-0"
                disabled={!hasSelectedLetters}
                label="Temizle"
                onClick={handleClear}
              >
                <Trash2 className="size-5" />
              </IconActionButton>

              <button
                type="button"
                onClick={handlePass}
                disabled={passRights <= 0 || status === GAME_STATUS.SUCCESS || me.isFinished}
                className="sticker-cut absolute bottom-0 left-1/2 inline-flex h-12 -translate-x-1/2 items-center justify-center gap-1.5 rounded-full px-4 font-display text-xs font-black tracking-wider transition duration-300 ease-out active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <SkipForward className="size-4" />
                x{passRights}
              </button>

              <IconActionButton
                className="bottom-0 right-0"
                disabled={status === GAME_STATUS.WRONG || !keyboardTiles.length}
                label="Karıştır"
                onClick={handleShuffle}
              >
                <RefreshCw className="size-5" />
              </IconActionButton>
            </div>
          </footer>
        ) : null}
      </section>
    </main>
  );
}

function LoadingShell({ onExit, text }) {
  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-4 font-body text-slate-100">
      <section className={`relative w-full ${MAX_APP_WIDTH} overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.3),_rgba(2,6,23,0.98)_78%)] p-6 text-center shadow-[0_0_90px_rgba(16,185,129,0.2)]`}>
        <PitchBackdrop />
        <div className="relative z-10">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-emerald-400/15 text-emerald-100 shadow-[0_0_28px_rgba(16,185,129,0.22)]">
            <Wifi className="size-8" />
          </div>
          <p className="font-display text-xl font-black tracking-wide text-white">{text}</p>
          <button
            type="button"
            onClick={onExit}
            className="mt-5 h-12 rounded-full bg-white/[0.07] px-5 font-display text-sm font-black tracking-wider text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
          >
            Ana Menü
          </button>
        </div>
      </section>
    </main>
  );
}

function OnlineWaitingRoom({ error, me, onCopyCode, onExit, onReady, opponent, roomId, toastMessage }) {
  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-4 font-body text-slate-100">
      <section className={`relative w-full ${MAX_APP_WIDTH} overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.34),_rgba(6,78,59,0.22)_42%,_rgba(2,6,23,0.98)_82%)] p-6 text-center shadow-[0_0_90px_rgba(16,185,129,0.22)]`}>
        <PitchBackdrop />
        {toastMessage ? <LevelUpToast message={toastMessage} /> : null}
        <div className="relative z-10">
          <div className="mx-auto grid size-20 place-items-center rounded-[28px] bg-emerald-400/15 text-emerald-100 shadow-[0_0_34px_rgba(16,185,129,0.28)]">
            <Wifi className="size-10" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">Online Oda</p>
          <h2 className="mt-2 font-display text-5xl font-black tracking-wider text-white">{roomId}</h2>
          <button
            type="button"
            onClick={onCopyCode}
            className="mx-auto mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white/[0.07] px-4 font-display text-xs font-black tracking-wider text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
          >
            <Copy className="size-4" />
            Kodu Kopyala
          </button>

          <div className="mt-6 grid gap-3 text-left">
            <WaitingPlayerCard label="Oyuncu 1" player={me} />
            <WaitingPlayerCard label="Rakip" player={opponent} />
          </div>

          {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onExit}
              className="h-14 rounded-2xl bg-white/[0.07] font-display text-sm font-black tracking-wider text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl"
            >
              Çık
            </button>
            <button
              type="button"
              onClick={onReady}
              disabled={me.isReady || !opponent}
              className="h-14 rounded-2xl bg-emerald-400 font-display text-sm font-black tracking-wider text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.35)] transition duration-300 ease-out active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            >
              {me.isReady ? "Hazır" : opponent ? "Hazırım" : "Rakip Bekleniyor"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function WaitingPlayerCard({ label, player }) {
  return (
    <div className="rounded-3xl bg-white/[0.06] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/50">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="font-display text-lg font-black tracking-wide text-white">{player?.name || "Bekleniyor"}</p>
        <span className={`rounded-full px-2.5 py-1 font-display text-[10px] font-black tracking-wide ${player?.isReady ? "bg-emerald-400/18 text-emerald-100" : "bg-white/7 text-slate-400"}`}>
          {player?.isReady ? "Hazır" : "Bekliyor"}
        </span>
      </div>
    </div>
  );
}

function LiveProgressTracker({ me, opponent }) {
  return (
    <div className="mt-3 grid gap-2 rounded-[24px] bg-black/20 p-2 shadow-[0_12px_28px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
      <ProgressRow label="Sen" player={me} />
      <ProgressRow label="Rakip" player={opponent} />
    </div>
  );
}

function ProgressRow({ label, player }) {
  const currentIndex = player?.currentQuestionIndex ?? 0;
  const progress = Math.min(100, (currentIndex / ONLINE_QUESTION_COUNT) * 100);

  return (
    <div className="grid grid-cols-[3.8rem_1fr_auto] items-center gap-2">
      <span className="truncate font-display text-[11px] font-black tracking-wide text-slate-300">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-900/80">
        <div className="h-full rounded-full bg-emerald-400 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>
      <span className="font-display text-[11px] font-black tracking-wide text-white">
        {Math.min(currentIndex + 1, ONLINE_QUESTION_COUNT)}/{ONLINE_QUESTION_COUNT} | {player?.score ?? 0} Gol
      </span>
    </div>
  );
}

function EliminatedPanel({ opponent }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="rounded-[30px] bg-black/24 p-6 text-center shadow-[0_0_42px_rgba(248,113,113,0.18),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl">
        <XCircle className="mx-auto size-14 text-red-300 drop-shadow-[0_0_18px_rgba(248,113,113,0.45)]" />
        <h2 className="mt-4 font-display text-2xl font-black tracking-wide text-white">Elendiniz</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">
          Rakibinizin bitirmesi bekleniyor. Rakip skor: {opponent?.score ?? 0} Gol
        </p>
      </div>
    </div>
  );
}

function OnlineResult({ onExit, room, seat }) {
  const me = room.players[seat];
  const opponentSeat = seat === "p1" ? "p2" : "p1";
  const opponent = room.players[opponentSeat];
  const isDraw = room.winner === "draw";
  const didWin = room.winner === seat;

  useEffect(() => {
    if (didWin) {
      fireSuccessConfetti();
    }
  }, [didWin]);

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-4 font-body text-slate-100">
      <section className={`relative w-full ${MAX_APP_WIDTH} overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.34),_rgba(6,78,59,0.22)_42%,_rgba(2,6,23,0.98)_82%)] p-6 text-center shadow-[0_0_90px_rgba(16,185,129,0.22)]`}>
        <PitchBackdrop />
        <div className="relative z-10">
          <div className={`mx-auto grid size-20 place-items-center rounded-[28px] ${didWin ? "bg-emerald-400 text-slate-950" : isDraw ? "bg-amber-300 text-slate-950" : "bg-red-400 text-slate-950"} shadow-xl shadow-slate-950/40`}>
            {didWin ? <Trophy className="size-10" /> : isDraw ? <Sparkles className="size-10" /> : <Heart className="size-10" />}
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">Maç Sonu</p>
          <h2 className="mt-2 font-display text-3xl font-black tracking-wide text-white">
            {isDraw ? "BERABERE" : didWin ? "ZAFER 🏆" : "BOZGUN 💔"}
          </h2>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <ResultStatCard title="Sen" player={me} />
            <ResultStatCard title="Rakip" player={opponent} />
          </div>

          <button
            type="button"
            onClick={onExit}
            className="mt-6 h-14 w-full rounded-2xl bg-emerald-400 font-display text-sm font-black tracking-wider text-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.35)] transition duration-300 ease-out active:scale-95"
          >
            Ana Menü
          </button>
        </div>
      </section>
    </main>
  );
}

function ResultStatCard({ player, title }) {
  return (
    <div className="rounded-[24px] bg-white/[0.06] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/50">{title}</p>
      <p className="mt-2 font-display text-3xl font-black tracking-wider text-white">{player?.score ?? 0}</p>
      <div className="mt-2 grid gap-1 text-xs font-bold text-slate-400">
        <span>Süre: {player?.remainingTime ?? 0}s</span>
        <span>Kalan hak: {player?.remainingWrongAttempts ?? 0}</span>
      </div>
    </div>
  );
}

function ModeSelectScreen({ modes, onOnlineSession, onStart, onToggleTimeAttack, timeAttack }) {
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [onlineError, setOnlineError] = useState("");
  const [isOnlineBusy, setIsOnlineBusy] = useState(false);

  const handleCreateRoom = async () => {
    if (!isSupabaseConfigured) {
      setOnlineError("Online mod için Supabase env bilgileri gerekli.");
      return;
    }

    setIsOnlineBusy(true);
    setOnlineError("");

    try {
      const room = await createOnlineRoom(playerName);
      onOnlineSession({ roomId: room.id, seat: "p1" });
    } catch (error) {
      setOnlineError(error.message || "Oda oluşturulamadı.");
    } finally {
      setIsOnlineBusy(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!isSupabaseConfigured) {
      setOnlineError("Online mod için Supabase env bilgileri gerekli.");
      return;
    }

    if (roomCode.trim().length !== 4) {
      setOnlineError("4 haneli oda kodunu gir.");
      return;
    }

    setIsOnlineBusy(true);
    setOnlineError("");

    try {
      const room = await joinOnlineRoom(roomCode, playerName);
      onOnlineSession({ roomId: room.id, seat: "p2" });
    } catch (error) {
      setOnlineError(error.message || "Odaya katılamadın.");
    } finally {
      setIsOnlineBusy(false);
    }
  };

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-0 font-body text-[#17213a] sm:px-4">
      <section
        className={`album-shell relative flex h-dvh w-full ${MAX_APP_WIDTH} flex-col overflow-y-auto px-4 py-4 shadow-[0_24px_80px_rgba(7,18,34,0.42)] sm:h-[min(860px,100dvh)] sm:rounded-[30px]`}
      >
        <PitchBackdrop />

        <div className="relative z-10 flex min-h-full flex-col justify-start py-1">
          <div className="mb-4">
            <div className="mb-3 grid size-12 rotate-[-4deg] place-items-center rounded-xl bg-[#f4bd2e] text-[#17345a] shadow-[0_6px_0_#c73031,0_15px_26px_rgba(10,22,40,0.28)] ring-2 ring-white/70">
              <Goal className="size-8" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#f4bd2e]">Sticker FC</p>
            <h1 className="print-ink mt-2 font-display text-4xl font-black leading-tight tracking-wide text-[#fff2c0]">Albümünü Seç</h1>
            <p className="mt-2 max-w-xs rounded-xl bg-[#fff2c0]/88 px-3 py-1.5 text-sm font-bold leading-5 text-[#17345a] shadow-[0_5px_0_rgba(23,52,90,0.22)]">
              Havuzunu belirle, istersen 30 saniyelik zaman baskısıyla oyna.
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleTimeAttack}
            className="album-paper mb-3 flex rotate-[-0.8deg] items-center justify-between rounded-[22px] p-3 text-left ring-2 ring-white/50 transition duration-300 ease-out active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#17345a] text-[#fff2c0] shadow-[0_4px_0_#c73031]">
                <Zap className="size-5" />
              </span>
              <span>
                <span className="block font-display text-base font-black tracking-wide text-[#17345a]">Zaman Yarışı</span>
                <span className="block text-xs font-bold text-[#6d5b38]">Her soru için 30 saniye</span>
              </span>
            </span>
            <span
              className={`flex h-7 w-12 items-center rounded-full p-1 transition duration-300 ease-out ${
                timeAttack ? "justify-end bg-[#c73031]" : "justify-start bg-[#17345a]"
              }`}
              aria-hidden="true"
            >
              <span className="size-5 rounded-full bg-white shadow" />
            </span>
          </button>

          <div className="album-paper mb-3 rotate-[0.7deg] rounded-[22px] p-3 ring-2 ring-white/50">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#0f6a64] text-[#fff2c0] shadow-[0_4px_0_#17345a]">
                <Wifi className="size-5" />
              </span>
              <div>
                <p className="font-display text-base font-black tracking-wide text-[#17345a]">Online Canlı Rekabet</p>
                <p className="text-xs font-bold text-[#6d5b38]">2 cihaz, aynı 10 futbolcu, 60 saniye</p>
              </div>
            </div>

            <div className="grid gap-2">
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Oyuncu adın"
                maxLength={16}
                className="h-11 rounded-xl bg-[#fff8dc] px-3 font-display text-base font-black tracking-wide text-[#17345a] outline-none ring-2 ring-[#17345a]/20 transition duration-300 ease-out placeholder:text-[#8b7a4f] focus:ring-[#c73031]/55"
              />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Oda kodu"
                  inputMode="numeric"
                  maxLength={4}
                  className="h-11 rounded-xl bg-[#fff8dc] px-3 font-display text-base font-black tracking-wider text-[#17345a] outline-none ring-2 ring-[#17345a]/20 transition duration-300 ease-out placeholder:text-[#8b7a4f] focus:ring-[#c73031]/55"
                />
                <button
                  type="button"
                  onClick={handleJoinRoom}
                  disabled={isOnlineBusy}
                  className="grid h-11 w-12 place-items-center rounded-xl bg-[#17345a] text-[#fff2c0] shadow-[0_4px_0_#c73031] transition duration-300 ease-out active:translate-y-1 disabled:opacity-45"
                  aria-label="Odaya katıl"
                  title="Odaya katıl"
                >
                  <UserPlus className="size-5" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={isOnlineBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#f4bd2e] font-display text-base font-black tracking-wider text-[#17345a] shadow-[0_5px_0_#c73031] transition duration-300 ease-out active:translate-y-1 disabled:opacity-50"
              >
                <Play className="size-4" />
                Oda Oluştur
              </button>
              {onlineError ? <p className="rounded-lg bg-[#c73031] px-2 py-1 text-xs font-black text-[#fff2c0]">{onlineError}</p> : null}
            </div>
          </div>

          <div className="grid gap-2 pb-3">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const playerCount = getModePlayers(mode).length;

              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onStart(mode)}
                  className="album-paper group rounded-[22px] p-4 text-left ring-2 ring-white/45 transition duration-300 ease-out hover:rotate-[-1deg] active:scale-[0.99]"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#c73031] text-[#fff2c0] shadow-[0_4px_0_#17345a] transition duration-300 ease-out group-hover:bg-[#f4bd2e] group-hover:text-[#17345a]">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-black tracking-wide text-[#17345a]">{mode.title}</span>
                      <span className="mt-1 block text-xs font-bold text-[#6d5b38]">{mode.description}</span>
                    </span>
                    <span className="rounded-full bg-[#17345a] px-2.5 py-1 font-display text-xs font-black tracking-wide text-[#fff2c0] shadow-[0_3px_0_#c73031]">
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
    <div className="sticker-cut rotate-[2deg] rounded-xl px-3 py-2 text-right">
      <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-[#c73031]">
        <Trophy className="size-3.5" />
        Skor
      </div>
      <p className="font-display text-3xl font-black leading-none tracking-wider text-[#17345a]">{score}</p>
    </div>
  );
}

function Lives({ lives }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full bg-[#fff2c0] px-3 py-1.5 text-[#17345a] shadow-[0_3px_0_#c73031]"
      aria-label={`Can: ${lives}`}
    >
      <span className="mr-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#17345a]">Can</span>
      {Array.from({ length: INITIAL_LIVES }).map((_, index) => (
        <Heart
          key={index}
          className={`size-4 transition duration-300 ease-out ${
            index < lives
              ? "fill-[#c73031] text-[#c73031]"
              : "fill-[#b8a777] text-[#b8a777]"
          }`}
        />
      ))}
    </div>
  );
}

function HintRightsBadge({ hintRights }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f4bd2e] px-2.5 py-1.5 font-display text-xs font-black tracking-wide text-[#17345a] shadow-[0_3px_0_#c73031]">
      <Lightbulb className="size-3.5 fill-[#17345a]/70 text-[#17345a]" />
      x{hintRights}
    </div>
  );
}

function WrongAttemptsBadge({ wrongAttempts }) {
  const remaining = Math.max(0, QUESTION_WRONG_ATTEMPTS - wrongAttempts);

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-[#17345a] px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#fff2c0] shadow-[0_3px_0_#c73031]">
      Hak
      {Array.from({ length: QUESTION_WRONG_ATTEMPTS }).map((_, index) => (
        <XCircle
          key={index}
          className={`size-3.5 transition duration-300 ease-out ${
            index < remaining ? "fill-[#c73031] text-[#fff2c0]" : "text-[#7f8a9c]"
          }`}
        />
      ))}
    </div>
  );
}

function DifficultyBadge({ stage }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-[#fff2c0] px-3 py-1.5 font-display text-xs font-black tracking-wide text-[#17345a] shadow-[0_3px_0_#0f6a64]"
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
      <div className="album-paper animate-level-up rotate-[-1deg] rounded-2xl px-5 py-3 text-center ring-2 ring-white/60">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#c73031]">Seviye Atladın!</p>
        <p className="mt-1 font-display text-xl font-black tracking-wide text-[#17345a]">{message.replace("Seviye Atladın! ", "")}</p>
      </div>
    </div>
  );
}

function TimerBar({ timeLeft, totalTime }) {
  const percentage = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.12em] text-[#fff2c0]">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5 text-[#f4bd2e]" />
          Süre
        </span>
        <span className={timeLeft <= 7 ? "text-[#ffcbcb]" : "text-[#fff2c0]"}>{timeLeft}s</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#17345a] shadow-[0_2px_0_#c73031]">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            timeLeft <= 7 ? "bg-[#c73031]" : "bg-[#f4bd2e]"
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
              className={`aspect-square min-h-7 rounded-xl border-2 font-display font-black tracking-wider transition duration-300 ease-out active:scale-95 ${
                row.length > 10 ? "text-xs sm:text-sm" : "text-base sm:text-lg"
              } ${
                isSuccess
                  ? "border-[#17345a] bg-[#f4bd2e] text-[#17345a] shadow-[0_5px_0_#c73031]"
                  : isWrong
                    ? "border-[#17345a] bg-[#c73031] text-[#fff2c0] shadow-[0_5px_0_#17345a]"
                    : tile
                      ? "border-[#17345a] bg-[#fff8dc] text-[#17345a] shadow-[0_5px_0_rgba(23,52,90,0.28)]"
                      : "border-dashed border-[#17345a]/45 bg-[#fff8dc]/45 text-[#17345a]"
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
  const columnCount = getLetterColumnCount(tiles.length);

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
            className="sticker-cut aspect-[1.08] rotate-[var(--tile-rotation)] rounded-xl border-2 border-[#17345a]/35 border-b-4 border-b-[#17345a] font-display text-xl font-black tracking-wider text-[#17345a] transition duration-300 ease-out hover:rotate-0 hover:bg-[#f4bd2e] active:translate-y-1 active:rotate-0 active:border-b-0 disabled:cursor-not-allowed disabled:rotate-0 disabled:border-[#8b7a4f]/25 disabled:bg-[#d8c999] disabled:text-[#8b7a4f] disabled:shadow-none"
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

const HintPanel = memo(function HintPanel({ disabled, hintLevel, hintRights, onReveal, player }) {
  const buttonLabel = hintLevel === 0 ? "Ülkeyi Göster" : "Kulübü Göster";
  const hintTitle = hintRights <= 0 ? "İpucu hakkın kalmadı" : buttonLabel;

  return (
    <div className="mt-4 flex items-center gap-2 transition duration-300 ease-out">
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 text-sm">
        <HintMetric isVisible={hintLevel >= 1} label="Ülke" value={player.nationality} />
        <HintMetric isVisible={hintLevel >= 2} label="Kulüp" value={player.club} />
      </div>

      <button
        type="button"
        onClick={onReveal}
        disabled={disabled}
        className="sticker-cut grid size-12 shrink-0 place-items-center rounded-xl text-[#17345a] transition duration-300 ease-out hover:rotate-[-2deg] active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={hintLevel >= 2 ? "İpucu tamamlandı" : hintTitle}
        title={hintLevel >= 2 ? "İpucu tamamlandı" : hintTitle}
      >
        <BadgeInfo className="size-5" />
      </button>
    </div>
  );
});

const HintMetric = memo(function HintMetric({ isVisible, label, value }) {
  return (
    <div className="sticker-cut min-w-0 rotate-[-0.5deg] rounded-xl px-3 py-2 transition duration-300 ease-out">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#c73031]">{label}</p>
      <p className={`mt-0.5 truncate font-display text-base font-black tracking-wide transition duration-300 ease-out ${isVisible ? "text-[#17345a]" : "text-[#8b7a4f]"}`}>
        {isVisible ? value : "Kilitli"}
      </p>
    </div>
  );
});

function IconActionButton({ children, className = "", disabled, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`sticker-cut absolute grid size-12 place-items-center rounded-xl text-[#17345a] transition duration-300 ease-out hover:rotate-[-2deg] active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
    >
      {children}
    </button>
  );
}

function ShimmerButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="absolute bottom-0 left-1/2 inline-flex h-12 -translate-x-1/2 overflow-hidden rounded-xl bg-[#f4bd2e] px-4 font-display text-xs font-black tracking-wider text-[#17345a] shadow-[0_5px_0_#c73031] transition duration-300 ease-out active:translate-y-1 disabled:cursor-wait disabled:opacity-70"
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
        className={`relative w-full ${MAX_APP_WIDTH} overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.34),_rgba(6,78,59,0.22)_42%,_rgba(2,6,23,0.98)_82%)] p-6 text-center shadow-[0_0_90px_rgba(16,185,129,0.22)]`}
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

          <div className="mt-6 rounded-[28px] bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
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
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-white/[0.07] px-4 font-display text-sm font-black tracking-wider text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition duration-300 ease-out active:scale-95"
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
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(244,189,46,0.22),transparent_34%),radial-gradient(circle_at_50%_86%,rgba(199,48,49,0.16),transparent_34%)]" />
      <div className="absolute inset-x-7 top-32 h-48 rotate-[-1deg] rounded-[30px] bg-[#fff2c0]/12 shadow-[inset_0_0_0_2px_rgba(255,242,192,0.16)]" />
      <div className="absolute left-1/2 top-32 h-48 w-px -translate-x-1/2 rotate-[-1deg] bg-[#fff2c0]/18" />
      <div className="absolute left-1/2 top-44 size-20 -translate-x-1/2 rounded-full bg-[#fff2c0]/8 shadow-[inset_0_0_0_2px_rgba(255,242,192,0.16)]" />
      <div className="absolute -left-12 bottom-24 h-28 w-52 rotate-[-10deg] rounded-[28px] bg-[#c73031]/16" />
      <div className="absolute -right-10 bottom-32 h-24 w-48 rotate-[12deg] rounded-[28px] bg-[#f4bd2e]/16" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#10213d] via-[#10213d]/44 to-transparent" />
    </div>
  );
}

export default App;

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeInfo,
  ChevronRight,
  Eraser,
  Flame,
  Goal,
  RefreshCcw,
  Shield,
  Shuffle,
  Sparkles,
  Trophy,
} from "lucide-react";
import { PLAYER_DATA } from "./players";

const GAME_STATUS = {
  PLAYING: "playing",
  WRONG: "wrong",
  SUCCESS: "success",
  COMPLETE: "complete",
};

const WRONG_FEEDBACK_MS = 420;
const QUESTION_TRANSITION_MS = 240;
const SUCCESS_STAGGER_MS = 70;
const MAX_GUESS_COLUMNS = 7;
const MAX_LETTER_COLUMNS = 6;
const MIN_LETTER_COLUMNS = 4;
const MAX_APP_WIDTH = "max-w-[450px]";
const SPACE_TILE = { id: "space", letter: " ", isSpace: true };

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

function App() {
  const [players, setPlayers] = useState(() => fisherYatesShuffle(PLAYER_DATA));
  const [playerIndex, setPlayerIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [shuffledTiles, setShuffledTiles] = useState([]);
  const [status, setStatus] = useState(GAME_STATUS.PLAYING);
  const [hintVisible, setHintVisible] = useState(false);
  const [isChangingQuestion, setIsChangingQuestion] = useState(false);

  const currentPlayer = players[playerIndex];
  const isComplete = status === GAME_STATUS.COMPLETE;
  const isSuccess = status === GAME_STATUS.SUCCESS;
  const targetWord = currentPlayer?.name ?? "";

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

  useEffect(() => {
    if (!currentPlayer) {
      setStatus(GAME_STATUS.COMPLETE);
      return;
    }

    setSelectedTiles(createEmptyGuess(currentPlayer.name));
    setShuffledTiles(shuffleWord(currentPlayer.name));
    setHintVisible(false);
    setStatus(GAME_STATUS.PLAYING);
  }, [currentPlayer]);

  useEffect(() => {
    if (
      !targetWord ||
      status !== GAME_STATUS.PLAYING ||
      selectedTiles.length !== targetWord.length ||
      selectedTiles.some((tile) => tile === null)
    ) {
      return undefined;
    }

    if (guessedWord === targetWord) {
      setStatus(GAME_STATUS.SUCCESS);
      setScore((currentScore) => currentScore + 1);
      return undefined;
    }

    setStatus(GAME_STATUS.WRONG);
    const wrongTimer = window.setTimeout(() => setStatus(GAME_STATUS.PLAYING), WRONG_FEEDBACK_MS);
    return () => window.clearTimeout(wrongTimer);
  }, [guessedWord, selectedTiles, status, targetWord]);

  const handleTileSelect = useCallback(
    (tile) => {
      if (isSuccess || status === GAME_STATUS.WRONG) {
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

    setIsChangingQuestion(true);
    window.setTimeout(() => {
      setPlayerIndex((currentIndex) => {
        const nextIndex = currentIndex + 1;
        return nextIndex >= players.length ? players.length : nextIndex;
      });
      setIsChangingQuestion(false);
    }, QUESTION_TRANSITION_MS);
  }, [isChangingQuestion, isSuccess, players.length]);

  const handleRestart = useCallback(() => {
    setPlayers(fisherYatesShuffle(PLAYER_DATA));
    setPlayerIndex(0);
    setScore(0);
    setStatus(GAME_STATUS.PLAYING);
    setIsChangingQuestion(false);
  }, []);

  if (isComplete) {
    return <GameOver score={score} total={players.length} onRestart={handleRestart} />;
  }

  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-0 text-slate-100 sm:px-4">
      <section
        className={`relative flex h-dvh w-full ${MAX_APP_WIDTH} flex-col overflow-hidden border-x border-white/10 bg-slate-950/78 shadow-2xl shadow-emerald-950/30 backdrop-blur sm:h-[min(860px,100dvh)] sm:rounded-[28px] sm:border`}
      >
        <PitchBackdrop />

        <header className="relative z-10 flex shrink-0 items-center justify-between px-4 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-500/15 text-emerald-300 shadow-lg shadow-emerald-950/40">
              <Goal className="size-6" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-300">Anagram FC</p>
              <h1 className="text-xl font-black leading-none text-white">Futbol Anagram</h1>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-300/20 bg-indigo-500/12 px-3 py-2 text-right">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-indigo-200">
              <Trophy className="size-3.5" />
              Skor
            </div>
            <p className="text-2xl font-black leading-none text-white">{score}</p>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-3">
          <section
            className={`flex min-h-0 flex-1 flex-col justify-center transition duration-300 ${
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
              player={currentPlayer}
              hintVisible={hintVisible}
              onReveal={() => setHintVisible(true)}
              disabled={hintVisible || isSuccess}
            />
          </section>
        </div>

        <footer className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-slate-950/92 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_42px_rgba(2,6,23,0.72)] backdrop-blur-xl">
          <LetterBank
            tiles={shuffledTiles}
            selectedTileIds={selectedTileIds}
            disabled={isSuccess || status === GAME_STATUS.WRONG}
            onSelect={handleTileSelect}
          />

          <div className="mt-4 grid grid-cols-[1fr_1.4fr] gap-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={isSuccess || !hasSelectedLetters}
              className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-800/80 px-4 text-sm font-bold text-slate-200 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 text-sm font-black text-slate-950 shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-emerald-500/35 disabled:text-emerald-950/60"
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

const GuessBoard = memo(function GuessBoard({ selectedTiles, status, onSlotClear }) {
  const isSuccess = status === GAME_STATUS.SUCCESS;
  const isWrong = status === GAME_STATUS.WRONG;

  return (
    <div
      className={`grid gap-1.5 ${isWrong ? "animate-soft-shake" : ""}`}
      style={{ gridTemplateColumns: `repeat(${Math.min(selectedTiles.length, MAX_GUESS_COLUMNS)}, minmax(0, 1fr))` }}
      aria-label="Tahmin kutuları"
    >
      {selectedTiles.map((tile, index) => {
        if (tile?.isSpace) {
          return (
            <div
              key={`space-${index}`}
              className="grid aspect-square min-h-8 place-items-center text-lg font-black text-emerald-300/70"
              aria-hidden="true"
            >
              /
            </div>
          );
        }

        return (
          <button
            key={`${tile?.id ?? "empty"}-${index}`}
            type="button"
            onClick={() => onSlotClear(index)}
            disabled={!tile || isSuccess || isWrong}
            className={`aspect-square min-h-8 rounded-xl border text-base font-black transition active:scale-95 sm:text-lg ${
              isSuccess
                ? "border-emerald-300/70 bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/40"
                : tile
                  ? "border-indigo-300/50 bg-indigo-500/22 text-white"
                  : "border-dashed border-emerald-300/55 bg-emerald-500/[0.11] text-emerald-100 shadow-inner shadow-emerald-950/30"
            }`}
            style={isSuccess ? { animation: `success-bounce 520ms ${index * SUCCESS_STAGGER_MS}ms both` } : undefined}
            aria-label={tile ? `${tile.letter} harfini geri al` : `${index + 1}. boş kutu`}
          >
            {tile?.letter ?? ""}
          </button>
        );
      })}
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
      {tiles.map((tile) => {
        const isUsed = selectedTileIds.has(tile.id);

        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onSelect(tile)}
            disabled={disabled || isUsed}
            className="aspect-[1.08] rounded-xl border border-emerald-200/20 bg-gradient-to-br from-slate-800 to-slate-900 text-lg font-black text-emerald-100 shadow-lg shadow-slate-950/35 transition hover:border-emerald-300/50 hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-none disabled:bg-slate-900/45 disabled:text-slate-600 disabled:shadow-none"
            aria-label={`${tile.letter} harfini seç`}
          >
            {tile.letter}
          </button>
        );
      })}
    </div>
  );
});

const HintPanel = memo(function HintPanel({ player, hintVisible, onReveal, disabled }) {
  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.055] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
          <BadgeInfo className="size-4 text-emerald-300" />
          İpucu
        </div>
        <button
          type="button"
          onClick={onReveal}
          disabled={disabled}
          className="rounded-full border border-emerald-300/20 bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-200 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Göster
        </button>
      </div>

      {hintVisible ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <HintMetric label="Ülke" value={player.nationality} />
          <HintMetric label="Kulüp" value={player.club} />
        </div>
      ) : (
        <p className="text-sm font-medium text-slate-500">Ülke ve kulüp bilgisi kilitli.</p>
      )}
    </div>
  );
});

const HintMetric = memo(function HintMetric({ label, value }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-950/55 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
});

function ShimmerButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative inline-flex h-[52px] overflow-hidden rounded-2xl bg-emerald-500 px-4 text-sm font-black text-slate-950 shadow-xl shadow-emerald-950/50 transition hover:bg-emerald-400 active:scale-95 disabled:cursor-wait disabled:opacity-70"
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

function GameOver({ score, total, onRestart }) {
  return (
    <main className="flex h-dvh w-full items-center justify-center overflow-hidden px-4 text-slate-100">
      <section
        className={`relative w-full ${MAX_APP_WIDTH} overflow-hidden rounded-[30px] border border-white/10 bg-slate-950/88 p-6 text-center shadow-2xl shadow-emerald-950/40`}
      >
        <PitchBackdrop />
        <div className="relative z-10">
          <div className="mx-auto grid size-20 place-items-center rounded-[28px] bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-950/45">
            <Trophy className="size-10" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">Final Düdüğü</p>
          <h2 className="mt-2 text-3xl font-black text-white">Oyun Bitti</h2>
          <p className="mx-auto mt-3 max-w-xs text-sm font-medium leading-6 text-slate-400">
            {total} futbolcunun {score} tanesini doğru bildin. Yeni seri için kadro yeniden hazır.
          </p>

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.055] p-4">
            <div className="flex items-center justify-center gap-3">
              <Flame className="size-6 text-amber-300" />
              <span className="text-5xl font-black text-white">{score}</span>
              <span className="text-xl font-black text-slate-500">/ {total}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onRestart}
            className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-base font-black text-slate-950 shadow-xl shadow-emerald-950/45 transition hover:bg-emerald-400 active:scale-95"
          >
            <RefreshCcw className="size-5" />
            Yeniden Başla
          </button>
        </div>
      </section>
    </main>
  );
}

function PitchBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-6 top-28 h-48 rounded-[38px] border border-emerald-300/10 bg-emerald-500/[0.035]" />
      <div className="absolute left-1/2 top-28 h-48 w-px -translate-x-1/2 bg-emerald-200/10" />
      <div className="absolute left-1/2 top-44 size-20 -translate-x-1/2 rounded-full border border-emerald-200/10" />
      <div className="absolute -right-14 bottom-40 size-52 rounded-full border border-violet-300/10 bg-violet-500/[0.045]" />
    </div>
  );
}

export default App;

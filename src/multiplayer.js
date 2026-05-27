import { PLAYER_DATA } from "./players";
import { supabase } from "./supabaseClient";

export const ONLINE_QUESTION_COUNT = 10;
export const ONLINE_MATCH_SECONDS = 60;
export const QUESTION_WRONG_ATTEMPTS = 3;
export const INITIAL_PASS_RIGHTS = 2;

export const EMPTY_ONLINE_PLAYER = {
  name: "",
  score: 0,
  currentQuestionIndex: 0,
  remainingTime: ONLINE_MATCH_SECONDS,
  remainingWrongAttempts: QUESTION_WRONG_ATTEMPTS,
  isReady: false,
  isEliminated: false,
  isFinished: false,
  passRights: INITIAL_PASS_RIGHTS,
};

export function createRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function createOnlinePlayer(name) {
  return {
    ...EMPTY_ONLINE_PLAYER,
    name: name.trim() || "Oyuncu",
  };
}

export function createOnlineQuestionPool() {
  const easy = PLAYER_DATA.filter((player) => player.difficulty === "easy");
  const medium = PLAYER_DATA.filter((player) => player.difficulty === "medium");
  const hard = PLAYER_DATA.filter((player) => player.difficulty === "hard");
  const mixedPool = [
    ...fisherYatesShuffle(easy).slice(0, 4),
    ...fisherYatesShuffle(medium).slice(0, 4),
    ...fisherYatesShuffle(hard).slice(0, 2),
  ];

  return fisherYatesShuffle(mixedPool).slice(0, ONLINE_QUESTION_COUNT);
}

export function determineWinner(players) {
  const p1 = players.p1;
  const p2 = players.p2;

  if (!p1 || !p2) {
    return null;
  }

  if (p1.score !== p2.score) {
    return p1.score > p2.score ? "p1" : "p2";
  }

  if (p1.remainingTime !== p2.remainingTime) {
    return p1.remainingTime > p2.remainingTime ? "p1" : "p2";
  }

  if (p1.remainingWrongAttempts !== p2.remainingWrongAttempts) {
    return p1.remainingWrongAttempts > p2.remainingWrongAttempts ? "p1" : "p2";
  }

  return "draw";
}

export async function createOnlineRoom(playerName) {
  const roomCode = createRoomCode();
  const room = {
    id: roomCode,
    players: {
      p1: createOnlinePlayer(playerName),
      p2: null,
    },
    players_data: createOnlineQuestionPool(),
    game_status: "waiting",
    winner: null,
    started_at: null,
    finished_at: null,
  };

  const { data, error } = await supabase.from("rooms").insert(room).select().single();

  if (error) {
    throw error;
  }

  return data;
}

export async function joinOnlineRoom(roomCode, playerName) {
  const normalizedCode = roomCode.trim();
  const { data: room, error: readError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", normalizedCode)
    .single();

  if (readError) {
    throw readError;
  }

  if (!room || room.game_status !== "waiting" || room.players?.p2) {
    throw new Error("Bu oda dolu ya da başlamış.");
  }

  const players = {
    ...room.players,
    p2: createOnlinePlayer(playerName),
  };

  const { data, error } = await supabase
    .from("rooms")
    .update({ players })
    .eq("id", normalizedCode)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getOnlineRoom(roomId) {
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateOnlineRoom(roomId, patch) {
  const { data, error } = await supabase
    .from("rooms")
    .update(patch)
    .eq("id", roomId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export function subscribeToRoom(roomId, onRoomChange) {
  return supabase
    .channel(`room-${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        if (payload.new) {
          onRoomChange(payload.new);
        }
      },
    )
    .subscribe();
}

function fisherYatesShuffle(items) {
  const shuffled = [...items];

  for (let currentIndex = shuffled.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }

  return shuffled;
}

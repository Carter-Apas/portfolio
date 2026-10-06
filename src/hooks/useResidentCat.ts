import { useEffect, useState } from "react";
import { isWalkable, ROOM_DEPTH, ROOM_WIDTH, type Position } from "../roomData";
import type { Player } from "../realtime";

export const CAT_STEP_DURATION = 480;
const START = { x: 5, y: 8 };
const INITIAL_CAT: Player = {
  id: "resident-studio-cat",
  name: "Studio cat",
  animal: "cat",
  position: START,
  facing: "se",
};
const STEPS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];
const key = ({ x, y }: Position) => `${x},${y}`;

// Shortest four-direction path, keeping every step out of furniture and walls.
export function findCatPath(start: Position, goal: Position): Position[] {
  if (!isWalkable(start) || !isWalkable(goal)) return [];
  const queue = [{ position: start, path: [] as Position[] }];
  const visited = new Set([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const { position, path } = queue[i];
    if (key(position) === key(goal)) return path;
    for (const step of STEPS) {
      const next = { x: position.x + step.x, y: position.y + step.y };
      if (!isWalkable(next) || visited.has(key(next))) continue;
      visited.add(key(next));
      queue.push({ position: next, path: [...path, next] });
    }
  }
  return [];
}

const destinations = Array.from({ length: ROOM_DEPTH }, (_, y) =>
  Array.from({ length: ROOM_WIDTH }, (__, x) => ({ x, y })),
)
  .flat()
  .filter(isWalkable);

export default function useResidentCat() {
  const [cat, setCat] = useState(INITIAL_CAT);

  useEffect(() => {
    let position = START;
    let route: Position[] = [];
    let timer: number;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canWander = () => !reducedMotion.matches && !document.hidden;

    const rest = () => {
      if (!canWander()) return;
      timer = window.setTimeout(startWalk, 1800 + Math.random() * 3000);
    };
    const walkStep = () => {
      if (!canWander()) return;
      const next = route.shift();
      if (!next) {
        rest();
        return;
      }
      const dx = next.x - position.x;
      const dy = next.y - position.y;
      const facing = dx > 0 ? "se" : dx < 0 ? "nw" : dy > 0 ? "sw" : "ne";
      position = next;
      setCat({ ...INITIAL_CAT, position, facing });
      timer = window.setTimeout(walkStep, CAT_STEP_DURATION);
    };
    const startWalk = () => {
      if (!canWander()) return;
      const candidates = destinations.filter(
        (p) => Math.abs(p.x - position.x) + Math.abs(p.y - position.y) >= 2,
      );
      const goal = candidates[Math.floor(Math.random() * candidates.length)];
      route = goal ? findCatPath(position, goal).slice(0, 8) : [];
      if (route.length) walkStep();
      else rest();
    };
    const resumeOrPause = () => {
      window.clearTimeout(timer);
      route = [];
      rest();
    };

    rest();
    document.addEventListener("visibilitychange", resumeOrPause);
    reducedMotion.addEventListener("change", resumeOrPause);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resumeOrPause);
      reducedMotion.removeEventListener("change", resumeOrPause);
    };
  }, []);

  return cat;
}

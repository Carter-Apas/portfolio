import { useEffect, useState } from "react";
import { isWalkable, ROOM_DEPTH, ROOM_WIDTH, type Position } from "../roomData";
import { findCatPath } from "./useResidentCat";
import type { Player } from "../realtime";

export type ResidentVacuum = Omit<Player, "animal"> & { animal: "vacuum" };

export const VACUUM_STEP_DURATION = 700;
const START = { x: 5, y: 8 };
const INITIAL_VACUUM: ResidentVacuum = {
  id: "resident-studio-vacuum",
  name: "Robot vacuum",
  animal: "vacuum",
  position: START,
  facing: "se",
};
const destinations = Array.from({ length: ROOM_DEPTH }, (_, y) =>
  Array.from({ length: ROOM_WIDTH }, (__, x) => ({ x, y })),
)
  .flat()
  .filter(isWalkable);

export default function useResidentVacuum() {
  const [vacuum, setVacuum] = useState(INITIAL_VACUUM);

  useEffect(() => {
    let position = START;
    let route: Position[] = [];
    let timer: number;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const canWander = () => !reducedMotion.matches && !document.hidden;

    const rest = () => {
      if (!canWander()) return;
      timer = window.setTimeout(startWalk, 900 + Math.random() * 1200);
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
      setVacuum({ ...INITIAL_VACUUM, position, facing });
      timer = window.setTimeout(walkStep, VACUUM_STEP_DURATION);
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

  return vacuum;
}

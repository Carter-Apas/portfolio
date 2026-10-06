import { useEffect, useRef, useState } from "react";
import type { Facing, Position } from "../roomData";

type Props = {
  name: string;
  facing?: Facing;
  position: Position;
  walkDuration?: number;
};

// Four matching isometric directions; moving frames spin the side brush.
const DIRECTION_OFFSET: Record<Facing, number> = {
  sw: 4,
  nw: 8,
  ne: 12,
  se: 0,
};

function RobotVacuum({
  name,
  facing = "se",
  position,
  walkDuration = 280,
}: Props) {
  const [frame, setFrame] = useState(0);
  const [walking, setWalking] = useState(false);
  const previousPosition = useRef(`${position.x},${position.y}`);

  useEffect(() => {
    const positionKey = `${position.x},${position.y}`;
    if (positionKey === previousPosition.current) return;
    const start = window.setTimeout(() => {
      previousPosition.current = positionKey;
      setWalking(true);
    }, 0);
    const timeout = window.setTimeout(() => setWalking(false), walkDuration);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timeout);
    };
  }, [position.x, position.y, walkDuration]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let interval: number | undefined;
    const update = () => {
      window.clearInterval(interval);
      if (walking && !reducedMotion.matches) {
        interval = window.setInterval(
          () => setFrame((current) => (current + 1) % 4),
          100,
        );
      }
    };
    update();
    reducedMotion.addEventListener("change", update);
    return () => {
      window.clearInterval(interval);
      reducedMotion.removeEventListener("change", update);
    };
  }, [walking]);

  const frameX = (DIRECTION_OFFSET[facing] + (walking ? frame : 0)) * 128;

  return (
    <g className="vacuum-avatar">
      <ellipse cx="0" cy="8" rx="23" ry="8" fill="rgba(38, 31, 38, .20)" />
      <svg
        className="room-sprite studio-vacuum-sprite"
        x="-48"
        y="-53.202"
        width="96"
        height="96"
        viewBox={`${frameX} 0 128 128`}
      >
        <image
          href="/assets/residents/vacuum/studio-vacuum-spritesheet.png"
          width="2048"
          height="128"
        />
      </svg>
      <title>{name}</title>
    </g>
  );
}

export default RobotVacuum;

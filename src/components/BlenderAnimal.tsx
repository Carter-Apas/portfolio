import { useEffect, useRef, useState } from "react";
import type { AnimalKind, Facing, Position } from "../roomData";

export type BlenderAnimalProps = {
  kind: AnimalKind;
  name: string;
  facing?: Facing;
  position: Position;
  isCurrent?: boolean;
  walkDuration?: number;
};

// Blender renders eight frames per direction, with idle and walking rows.
const DIRECTION_OFFSET: Record<Facing, number> = {
  sw: 8,
  nw: 16,
  ne: 24,
  se: 0,
};

function BlenderAnimal({
  kind,
  name,
  facing = "se",
  position,
  isCurrent,
  walkDuration = 280,
}: BlenderAnimalProps) {
  const [frame, setFrame] = useState(0);
  const [walking, setWalking] = useState(false);
  const previousPosition = useRef(`${position.x},${position.y}`);

  useEffect(() => {
    const positionKey = `${position.x},${position.y}`;
    if (positionKey === previousPosition.current) return;
    // Record the move when playback starts so Strict Mode effect replays
    // cannot cancel the only scheduled walking frame during depth reordering.
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
      if (!reducedMotion.matches) {
        interval = window.setInterval(
          () => setFrame((current) => (current + 1) % 8),
          walking ? 60 : 240,
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

  const frameX = (DIRECTION_OFFSET[facing] + frame) * 128;

  return (
    <g className={`${kind}-avatar blender-animal-avatar`}>
      <ellipse cx="0" cy="8" rx="16" ry="5" fill="rgba(38, 31, 38, .20)" />
      <svg
        className="room-sprite studio-animal-sprite"
        x="-48"
        y="-62.802"
        width="96"
        height="96"
        viewBox={`${frameX} ${walking ? 128 : 0} 128 128`}
      >
        <image
          href={`/assets/animals/${kind}/studio-${kind}-spritesheet.png`}
          width="4096"
          height="256"
        />
      </svg>
      {isCurrent && <path d="M-7-66h14v5H-7z" fill="#f3c74f" />}
      <g className="nameplate">
        <rect
          x={-Math.max(31, name.length * 4.4)}
          y="17"
          width={Math.max(62, name.length * 8.8)}
          height="22"
          rx="8"
        />
        <text y="32" textAnchor="middle">
          {name}
        </text>
      </g>
    </g>
  );
}

export default BlenderAnimal;

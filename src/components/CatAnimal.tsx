import { useEffect, useRef, useState } from "react";
import type { Facing, Position } from "../roomData";

type Props = {
  name: string;
  facing?: Facing;
  position: Position;
  isCurrent?: boolean;
};

const DIRECTION_OFFSET: Record<Facing, number> = {
  sw: 4,
  nw: 12,
  ne: 20,
  se: 28,
};

function CatAnimal({
  name,
  facing = "se",
  position,
  isCurrent,
}: Props) {
  const [frame, setFrame] = useState(0);
  const [walking, setWalking] = useState(false);
  const previousPosition = useRef(`${position.x},${position.y}`);

  useEffect(() => {
    const positionKey = `${position.x},${position.y}`;
    if (positionKey === previousPosition.current) return;
    previousPosition.current = positionKey;
    const start = window.setTimeout(() => setWalking(true), 0);
    const timeout = window.setTimeout(() => setWalking(false), 280);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timeout);
    };
  }, [position]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setFrame((current) => (current + 1) % 4),
      walking ? 90 : 360,
    );
    return () => window.clearInterval(interval);
  }, [walking]);

  const frameX = (DIRECTION_OFFSET[facing] + frame) * 32;

  return (
    <g className="cat-avatar">
      <ellipse cx="0" cy="8" rx="24" ry="8" fill="rgba(38, 31, 38, .20)" />
      <svg
        className="room-sprite"
        x="-32"
        y="-56"
        width="64"
        height="64"
        viewBox={`${frameX} ${walking ? 32 : 0} 32 32`}
      >
        <image
          href="/assets/animals/cat/cat-spritesheet.png"
          width="1024"
          height="64"
        />
      </svg>
      {isCurrent && <path d="M-7-57h14v5H-7z" fill="#f3c74f" />}
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

export default CatAnimal;

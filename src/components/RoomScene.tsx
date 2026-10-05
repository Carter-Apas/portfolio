import { useEffect, useRef, useState } from "react";
import {
  ROOM_DEPTH,
  ROOM_WIDTH,
  STUDIO_SCENE,
  isWalkable,
  projectGrid,
  toIso,
  type Position,
} from "../roomData";
import type { Player } from "../realtime";
import CatAnimal from "./CatAnimal";
import PixelAnimal from "./PixelAnimal";

type Props = {
  currentPlayer: Player;
  players: Player[];
  entered: boolean;
  onMove: (position: Position) => void;
  onInspect: (spot: string) => void;
};

const tilePoints = ({ x, y }: Position) =>
  [
    projectGrid(x, y),
    projectGrid(x + 1, y),
    projectGrid(x + 1, y + 1),
    projectGrid(x, y + 1),
  ]
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

function StudioAvatar({
  player,
  isCurrent,
}: {
  player: Player;
  isCurrent: boolean;
}) {
  const target = toIso(player.position);
  const [point, setPoint] = useState(() => toIso(player.position));
  const visiblePoint = useRef(point);

  useEffect(() => {
    const from = visiblePoint.current;
    if (from.x === target.x && from.y === target.y) return;
    const started = performance.now();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : 260;
    let frame: number;
    const animate = (now: number) => {
      const progress =
        duration === 0
          ? 1
          : Math.max(0, Math.min(1, (now - started) / duration));
      const eased = 1 - (1 - progress) ** 3;
      const next = {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
      };
      visiblePoint.current = next;
      setPoint(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    // SVG draw-order changes cancel CSS transitions. A keyed component keeps
    // this animation running when React moves its node past furniture or peers.
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target.x, target.y]);

  return (
    <g
      className="avatar-position"
      data-player={player.id}
      data-position={`${player.position.x},${player.position.y}`}
      style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
    >
      <g transform="scale(1.3)" pointerEvents="none">
        {player.animal === "cat" ? (
          <CatAnimal
            name={player.name}
            facing={player.facing}
            position={player.position}
            isCurrent={isCurrent}
          />
        ) : (
          <PixelAnimal
            kind={player.animal}
            name={player.name}
            isCurrent={isCurrent}
          />
        )}
      </g>
    </g>
  );
}

function RoomScene({
  currentPlayer,
  players,
  entered,
  onMove,
  onInspect,
}: Props) {
  useEffect(() => {
    if (!entered) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          event.target.isContentEditable) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      const movement: Record<string, Position> = {
        ArrowUp: { x: 0, y: -1 },
        w: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        s: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        a: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const step = movement[event.key];
      if (!step) return;
      event.preventDefault();
      const next = {
        x: currentPlayer.position.x + step.x,
        y: currentPlayer.position.y + step.y,
      };
      if (isWalkable(next)) onMove(next);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPlayer.position, entered, onMove]);

  const tiles = Array.from({ length: ROOM_DEPTH }, (_, y) =>
    Array.from({ length: ROOM_WIDTH }, (__, x) => ({ x, y })),
  ).flat();
  // Full-frame renders share a camera projection. Sort visitors among the furniture.
  const layers = [
    ...STUDIO_SCENE.props.map((prop) => ({
      kind: "prop" as const,
      depth: prop.depth,
      prop,
    })),
    ...(entered ? [currentPlayer, ...players] : []).map((player) => ({
      kind: "player" as const,
      depth: player.position.x + player.position.y + 1,
      player,
    })),
  ].sort((a, b) => a.depth - b.depth);

  return (
    <svg
      className="room-scene rendered-room"
      viewBox="80 80 1460 1360"
      role="group"
      aria-label="Carter's isometric studio with a coding desk, 3D printer and surfboard"
      preserveAspectRatio="xMidYMid meet"
    >
      <image
        href="/assets/studio/background.png"
        width="1600"
        height="1600"
        pointerEvents="none"
      />
      <g className="floor">
        {tiles.filter(isWalkable).map((tile) => (
          <polygon
            key={`${tile.x},${tile.y}`}
            points={tilePoints(tile)}
            data-tile={`${tile.x},${tile.y}`}
            onClick={() => entered && onMove(tile)}
          >
            <title>{entered ? "Walk here" : "Enter the room to walk"}</title>
          </polygon>
        ))}
      </g>
      {layers.map((layer) => {
        if (layer.kind === "player") {
          const { player } = layer;
          return (
            <StudioAvatar
              key={player.id}
              player={player}
              isCurrent={player.id === currentPlayer.id}
            />
          );
        }
        const { prop } = layer;
        return (
          <g key={prop.id}>
            <image
              href={prop.src}
              width="1600"
              height="1600"
              pointerEvents="none"
            />
            {prop.inspectId && (
              <g
                className="interactive-object studio-hotspot"
                role="button"
                tabIndex={0}
                aria-label={`Explore ${prop.label}`}
                aria-haspopup="dialog"
                data-spot={prop.inspectId}
                onClick={() => onInspect(prop.inspectId!)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onInspect(prop.inspectId!);
                  }
                }}
              >
                <title>{prop.label} — click to explore</title>
                <polygon
                  className="prop-hit"
                  points={prop.polygon.map((p) => p.join(",")).join(" ")}
                />
                <g
                  className="hotspot-pin"
                  transform={`translate(${prop.anchor[0]},${prop.anchor[1]})`}
                >
                  <circle className="hotspot-touch-target" r="85" />
                  <circle className="pin-halo" r="23" />
                  <circle className="pin-dot" r="12" />
                  <path d="M-4 0h8M0-4v8" />
                  <g className="hotspot-label">
                    <rect
                      x="24"
                      y="-18"
                      width={prop.label!.length * 11 + 26}
                      height="36"
                      rx="10"
                    />
                    <text x="37" y="6">
                      {prop.label}
                    </text>
                  </g>
                </g>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
export default RoomScene;

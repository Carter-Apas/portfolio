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
import type { ChatMessage, Player } from "../realtime";
import BlenderAnimal from "./BlenderAnimal";
import useResidentVacuum, { VACUUM_STEP_DURATION, type ResidentVacuum } from "../hooks/useResidentVacuum";
import RobotVacuum from "./RobotVacuum";

import SpeechBubble from "./SpeechBubble";
import useSpeechBubbles from "../hooks/useSpeechBubbles";

type Props = {
  messages: ChatMessage[];
  currentPlayer: Player;
  players: Player[];
  entered: boolean;
  assistantThinking: boolean;
  onAddressAssistant: () => void;
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

function useAvatarPoint(position: Position, movementDuration = 260, isResident = false) {
  const target = toIso(position);
  const [point, setPoint] = useState(() => toIso(position));
  const visiblePoint = useRef(point);

  useEffect(() => {
    const from = visiblePoint.current;
    if (from.x === target.x && from.y === target.y) return;
    const started = performance.now();
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : movementDuration;
    let frame: number;
    const animate = (now: number) => {
      const progress =
        duration === 0
          ? 1
          : Math.max(0, Math.min(1, (now - started) / duration));
      const eased = isResident ? progress : 1 - (1 - progress) ** 3;
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
  }, [target.x, target.y, movementDuration, isResident]);

  return point;
}

function StudioAvatar({
  player,
  isCurrent,
  isResident = false,
  movementDuration = 260,
}: {
  player: Player | ResidentVacuum;
  isCurrent: boolean;
  isResident?: boolean;
  movementDuration?: number;
}) {
  const point = useAvatarPoint(player.position, movementDuration, isResident);

  return (
    <g
      className="avatar-position"
      data-player={isResident ? undefined : player.id}
      data-resident={isResident ? "vacuum" : undefined}
      aria-label={isResident ? "Resident robot vacuum" : undefined}
      data-position={`${player.position.x},${player.position.y}`}
      style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
    >
      <g transform="scale(1.3)" pointerEvents="none">
        {player.animal === "vacuum" ? (
          <RobotVacuum
            name={player.name}
            facing={player.facing}
            position={player.position}
            walkDuration={movementDuration + 20}
          />
        ) : (
          <BlenderAnimal
            kind={player.animal}
            name={player.name}
            facing={player.facing}
            position={player.position}
            isCurrent={isCurrent}
            walkDuration={movementDuration + 20}
          />
        )}
      </g>
    </g>
  );
}

function VisitorSpeech({ player, message }: { player: Player; message: ChatMessage }) {
  const point = useAvatarPoint(player.position);
  return (
    <g transform={`translate(${point.x},${point.y})`}>
      <SpeechBubble message={message} />
    </g>
  );
}

function RoomScene({
  messages,
  currentPlayer,
  players,
  entered,
  assistantThinking,
  onAddressAssistant,
  onMove,
  onInspect,
}: Props) {
  const residentVacuum = useResidentVacuum();
  const bubbles = useSpeechBubbles(messages);
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
  // Redraw masked furniture from the same artwork when it is in front of a visitor.
  const layers = [
    ...STUDIO_SCENE.props.map((prop) => ({
      kind: "prop" as const,
      depth: prop.depth,
      prop,
    })),
    ...[residentVacuum, ...(entered ? [currentPlayer, ...players] : [])].map(
      (player) => ({
        kind: "player" as const,
        depth: player.position.x + player.position.y + 1,
        player,
      }),
    ),
  ].sort((a, b) => a.depth - b.depth);

  return (
    <svg
      className="room-scene rendered-room"
      viewBox={STUDIO_SCENE.viewBox}
      role="group"
      aria-label="Carter's isometric studio with a coding desk, 3D printer, surfboard, university certificate and oak bedside drawers with a fern and Nest Mini"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {STUDIO_SCENE.props.map((prop) => (
          <mask
            id={`foreground-${prop.id}`}
            key={prop.id}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={STUDIO_SCENE.width}
            height={STUDIO_SCENE.height}
            style={{ maskType: "luminance" }}
          >
            <image
              href={prop.maskSrc}
              width={STUDIO_SCENE.width}
              height={STUDIO_SCENE.height}
            />
          </mask>
        ))}
      </defs>
      <image
        href={STUDIO_SCENE.background}
        width={STUDIO_SCENE.width}
        height={STUDIO_SCENE.height}
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
              isResident={player.id === residentVacuum.id}
              movementDuration={
                player.id === residentVacuum.id ? VACUUM_STEP_DURATION : 260
              }
            />
          );
        }
        const { prop } = layer;
        return (
          <g key={prop.id}>
            <image
              href={prop.src}
              width={STUDIO_SCENE.width}
              height={STUDIO_SCENE.height}
              mask={`url(#foreground-${prop.id})`}
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
                <title>{`${prop.label} — click to explore`}</title>
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
      {entered && (
        <g className={`studio-assistant ${assistantThinking ? "is-thinking" : ""}`}>
          <g
            role="button"
            tabIndex={0}
            aria-label="Talk to Assistant, the AI studio host"
            className="assistant-target"
            onClick={onAddressAssistant}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault(); onAddressAssistant();
              }
            }}
          >
            <title>Assistant — click to chat</title>
            <circle cx={STUDIO_SCENE.assistant.anchor[0]} cy={STUDIO_SCENE.assistant.anchor[1]} r="34" />
          </g>
          {assistantThinking && (
            <g pointerEvents="none" role="img" aria-label="Assistant is thinking">
              {STUDIO_SCENE.assistant.lights.map(([x, y], i) => (
                <circle className="assistant-light" cx={x} cy={y} r="0.7" key={i}
                  style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </g>
          )}
          {bubbles.assistant && (
            <g transform={`translate(${STUDIO_SCENE.assistant.anchor[0]},${STUDIO_SCENE.assistant.anchor[1] + 86})`}>
              <SpeechBubble message={bubbles.assistant.message} />
            </g>
          )}
        </g>
      )}
      {entered && [currentPlayer, ...players].map((player) => {
        const bubble = bubbles[player.id];
        return bubble ? (
          <VisitorSpeech key={player.id} player={player} message={bubble.message} />
        ) : null;
      })}
    </svg>
  );
}
export default RoomScene;

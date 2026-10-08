import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import RoomScene from "./components/RoomScene";
import { connectAssistant, type AssistantState } from "./assistant";
import { notifyOwner } from "./notifications";
import {
  ANIMALS,
  INTERACTIVE_SPOTS,
  STARTING_POSITION,
  type AnimalKind,
  type Facing,
  type Position,
} from "./roomData";
import {
  connectToRoom,
  type ChatMessage,
  type ConnectionMode,
  type Player,
  type RoomEvent,
} from "./realtime";

const createId = () => crypto.randomUUID();

const NAME_PREFIXES = [
  "Amber",
  "Breezy",
  "Cosmic",
  "Dapper",
  "Fuzzy",
  "Lucky",
  "Mellow",
  "Misty",
  "Pocket",
  "Sunny",
  "Velvet",
  "Wobbly",
] as const;

const NAME_SUFFIXES = [
  "Bean",
  "Comet",
  "Fern",
  "Mochi",
  "Moss",
  "Noodle",
  "Pebble",
  "Pixel",
  "Sprout",
  "Toast",
  "Waffle",
  "Whisker",
] as const;

const randomItem = <T,>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)]!;

const randomIdentity = (): { name: string; animal: AnimalKind } => {
  return {
    name: `${randomItem(NAME_PREFIXES)}${randomItem(NAME_SUFFIXES)}`,
    animal: randomItem(ANIMALS).id,
  };
};

function App() {
  const [entered, setEntered] = useState(false);
  const [identity, setIdentity] = useState(randomIdentity);
  const [position, setPosition] = useState<Position>(STARTING_POSITION);
  const [facing, setFacing] = useState<Facing>("se");
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      playerId: "studio",
      name: "Studio",
      text: "Welcome in. Click the glowing objects to explore Carter's work.",
      sentAt: Date.now(),
      system: true,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<ConnectionMode>("local");
  const [activeSpot, setActiveSpot] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [assistantState, setAssistantState] = useState<AssistantState>({ enabled: false, thinking: false, error: null });
  const assistantRef = useRef<ReturnType<typeof connectAssistant> | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const connectionRef = useRef<ReturnType<typeof connectToRoom> | null>(null);
  const playerId = useRef(createId());
  const positionRef = useRef(position);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const { name, animal } = identity;

  const currentPlayer: Player = {
    id: playerId.current,
    name: name.trim() || "Guest",
    animal,
    position,
    facing,
  };

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const handleRoomEvent = useCallback((event: RoomEvent) => {
    if (event.type === "snapshot") {
      setPlayers(
        event.players.filter((player) => player.id !== playerId.current),
      );
      return;
    }

    if (event.type === "message") {
      setMessages((current) => {
        if (current.some((message) => message.id === event.message.id)) {
          return current;
        }
        return [...current.slice(-49), event.message];
      });
      return;
    }

    setPlayers((current) => {
      if (event.player.id === playerId.current) return current;
      if (event.type === "leave") {
        return current.filter((player) => player.id !== event.player.id);
      }
      const withoutPlayer = current.filter(
        (player) => player.id !== event.player.id,
      );
      return [...withoutPlayer, event.player];
    });
  }, []);

  useEffect(() => {
    if (!entered) return;

    const connection = connectToRoom(currentPlayer, handleRoomEvent);
    connectionRef.current = connection;
    setMode(connection.mode);
    const assistant = connectAssistant(
      { id: currentPlayer.id, name: currentPlayer.name }, connection.mode,
      (message) => handleRoomEvent({ type: "message", message }), setAssistantState,
    );
    assistantRef.current = assistant;

    return () => {
      assistant.close();
      assistantRef.current = null;
      connection.close();
      connectionRef.current = null;
    };
    // Profile details are locked after entering. Movement is sent separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, handleRoomEvent]);

  useEffect(() => {
    if (!entered || !connectionRef.current) return;
    connectionRef.current.update({
      ...currentPlayer,
      position,
    });
    // Only position changes should publish movement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOpen, assistantState.thinking, assistantState.error]);

  useEffect(() => {
    if (!activeSpot || !detailRef.current) return;
    const previousFocus = document.activeElement;
    const dialog = detailRef.current;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>("button, a[href], [tabindex='0']"),
      );
    focusable()[0]?.focus();
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveSpot(null);
      }
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      window.removeEventListener("keydown", handleDialogKey);
      if (
        previousFocus instanceof HTMLElement ||
        previousFocus instanceof SVGElement
      ) {
        previousFocus.focus();
      }
    };
  }, [activeSpot]);

  const enterRoom = (event: FormEvent) => {
    event.preventDefault();
    setEntered(true);
  };

  const moveTo = (nextPosition: Position) => {
    const dx = nextPosition.x - positionRef.current.x;
    const dy = nextPosition.y - positionRef.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setFacing(dx > 0 ? "se" : "nw");
    } else if (dy !== 0) {
      setFacing(dy > 0 ? "sw" : "ne");
    }
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim().slice(0, 180);
    if (!text || !connectionRef.current) return;

    const message: ChatMessage = {
      id: createId(),
      playerId: playerId.current,
      name,
      text,
      sentAt: Date.now(),
    };
    setMessages((current) => [...current.slice(-49), message]);
    connectionRef.current.sendMessage(message);
    notifyOwner(message);
    assistantRef.current?.sendMessage(message);
    setDraft("");
  };

  const activeContent = INTERACTIVE_SPOTS.find(
    (spot) => spot.id === activeSpot,
  );

  return (
    <main className="studio-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveSpot("about")}>
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span>
            <b>Carter&apos;s studio</b>
            <small>Software engineer · Auckland</small>
          </span>
        </button>

        <div className="room-status">
          <span className="live-dot" />
          <span>{players.length + (entered ? 1 : 0)} in the room</span>
          <span className="status-divider">·</span>
          <span>{mode === "realtime" ? "online" : "local room"}</span>
        </div>

        <div className="topbar-actions">
          <a
            className="github-button"
            href="https://github.com/carter-apas"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <section className="room-stage" aria-label="Carter's virtual studio">
        <RoomScene
          messages={messages}
          currentPlayer={currentPlayer}
          players={players}
          entered={entered}
          onMove={moveTo}
          onInspect={setActiveSpot}
          assistantThinking={assistantState.thinking}
          onAddressAssistant={() => {
            setChatOpen(true);
            setDraft((current) => /^assistant\b/i.test(current) ? current : `Assistant, ${current}`);
            window.setTimeout(() => chatInputRef.current?.focus(), 0);
          }}
        />

        <div className="room-hint">
          <span className="mouse-icon" aria-hidden="true" />
          Click a floor tile to walk
          <span className="hint-divider">·</span>
          WASD / arrows
        </div>

        <aside className={`chat-panel ${chatOpen ? "is-open" : ""}`}>
          <div className="chat-heading">
            <div>
              <span className="eyebrow">Room chat</span>
              <strong>Say hello</strong>
            </div>
            <button
              className="chat-close"
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <div
                className={`message ${message.system ? "system-message" : ""} ${message.assistant ? "assistant-message" : ""}`}
                key={message.id}
              >
                {!message.system && (
                  <span
                    className="message-avatar"
                    style={{
                      background:
                        message.assistant ? "#b7d5c1" : message.playerId === playerId.current
                          ? "#f4b942"
                          : "#b6a4ff",
                    }}
                  >
                    {message.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <p>
                  <b>{message.name}{message.assistant && <small className="ai-badge">AI</small>}</b>
                  <span>{message.text}</span>
                </p>
              </div>
            ))}
            {assistantState.thinking && <p className="assistant-status" role="status">Assistant is thinking<span aria-hidden="true">…</span></p>}
            {assistantState.error && <p className="assistant-status" role="status">{assistantState.error}</p>}
            {entered && !assistantState.enabled && <p className="assistant-status">Assistant is offline.</p>}
            <div ref={chatEndRef} />
          </div>

          {assistantState.enabled && <p className="assistant-disclosure">Assistant is AI. Room messages are sent to OpenAI to decide when to reply.</p>}
          <form className="chat-form" onSubmit={sendMessage}>
            <input
              ref={chatInputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={entered ? "Type a message…" : "Enter the room first"}
              disabled={!entered}
              aria-label="Chat message"
              maxLength={180}
            />
            <button
              disabled={!entered || !draft.trim()}
              aria-label="Send message"
            >
              ↑
            </button>
          </form>
        </aside>

        <button
          className="mobile-chat-button"
          onClick={() => setChatOpen(true)}
        >
          Chat
          {messages.length > 1 && <span>{messages.length - 1}</span>}
        </button>
      </section>

      {!entered && (
        <div className="entry-layer">
          <form className="entry-card" onSubmit={enterRoom}>
            <div className="entry-badge">ONE ROOM · OPEN DOOR</div>
            <div className="entry-copy">
              <span className="eyebrow">Welcome to</span>
              <h1>Carter&apos;s little corner of the internet.</h1>
              <p>
                We&apos;ve picked you a creature and a room name. Step inside
                and have a wander—there are projects tucked all around.
              </p>
            </div>

            <div className="identity-card">
              <div className="identity-preview">
                <img
                  className="animal-identity-preview"
                  src={`/assets/animals/${animal}/studio-${animal}-preview.png`}
                  alt=""
                  aria-hidden="true"
                />
                <span>
                  <small>Your room identity</small>
                  <strong>{name}</strong>
                  <em>
                    {ANIMALS.find((option) => option.id === animal)?.label}
                  </em>
                </span>
              </div>
              <button
                className="shuffle-button"
                type="button"
                onClick={() => setIdentity(randomIdentity())}
              >
                ↻ <span>Reroll</span>
              </button>
            </div>

            <button className="enter-button">
              Enter the room <span aria-hidden="true">→</span>
            </button>
            <small className="privacy-note">
              No account needed. Be kind in here.
            </small>
          </form>
        </div>
      )}

      {activeContent && (
        <div className="detail-layer" onMouseDown={() => setActiveSpot(null)}>
          <article
            ref={detailRef}
            className="detail-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            aria-describedby="detail-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="detail-close"
              onClick={() => setActiveSpot(null)}
              aria-label="Close"
            >
              ×
            </button>
            <span className="eyebrow">{activeContent.kicker}</span>
            <h2 id="detail-title">{activeContent.title}</h2>
            <p id="detail-description">{activeContent.description}</p>
            {"credentials" in activeContent && (
              <ul className="credential-list">
                {activeContent.credentials.map((credential) => (
                  <li key={credential.qualification}>
                    <strong>{credential.issuer}</strong>
                    {"location" in credential && (
                      <span className="credential-location">{credential.location}</span>
                    )}
                    {"period" in credential && (
                      <span className="credential-period">{credential.period}</span>
                    )}
                    <p>{credential.qualification}</p>
                    {"detail" in credential && <p>{credential.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
            {"tags" in activeContent && activeContent.tags && (
              <div className="tag-list">
                {activeContent.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}
            {activeContent.href && (
              <a href={activeContent.href} target="_blank" rel="noreferrer">
                {activeContent.linkLabel ?? "Take a look"}{" "}
                <span aria-hidden="true">↗</span>
              </a>
            )}
          </article>
        </div>
      )}
    </main>
  );
}

export default App;

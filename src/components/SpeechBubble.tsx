import type { ChatMessage } from "../realtime";

function wrapSpeech(text: string) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.match(/\S{1,26}/gu) ?? []) {
    if (line && line.length + word.length + 1 > 26) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  if (lines.length > 4) {
    lines.length = 4;
    lines[3] = lines[3].slice(0, 23) + "…";
  }
  return lines;
}

export default function SpeechBubble({ message }: { message: ChatMessage }) {
  const lines = wrapSpeech(message.text);
  const width = Math.max(120, Math.max(...lines.map((line) => line.length)) * 12 + 32);
  const height = lines.length * 26 + 24;
  return (
    <g
      className="speech-bubble"
      data-speaker={message.playerId}
      role="img"
      aria-label={`${message.name} says: ${message.text}`}
      transform={`translate(0, ${-110 - height})`}
      pointerEvents="none"
    >
      <title>{message.text}</title>
      <rect x={-width / 2} width={width} height={height} rx="16" />
      <path d={`M-10 ${height - 1} L0 ${height + 12} L10 ${height - 1}`} />
      <text textAnchor="middle">
        {lines.map((line, i) => <tspan x="0" y={30 + i * 26} key={i}>{line}</tspan>)}
      </text>
    </g>
  );
}

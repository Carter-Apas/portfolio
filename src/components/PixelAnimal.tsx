import type { AnimalKind } from "../roomData";

type Props = {
  kind: AnimalKind;
  name: string;
  isCurrent?: boolean;
};

const palettes: Record<
  AnimalKind,
  { main: string; dark: string; light: string; accent: string }
> = {
  fox: { main: "#e97832", dark: "#743b32", light: "#fff0d5", accent: "#272535" },
  cat: { main: "#68657c", dark: "#393746", light: "#d9d2d0", accent: "#f0ad54" },
  bunny: { main: "#e8dfd7", dark: "#8f7b86", light: "#fffaf3", accent: "#e99aa5" },
  frog: { main: "#78b957", dark: "#376b43", light: "#d7df68", accent: "#233e32" },
};

function PixelAnimal({ kind, name, isCurrent }: Props) {
  const colors = palettes[kind];
  const isBunny = kind === "bunny";
  const isFrog = kind === "frog";

  return (
    <g className="pixel-avatar">
      <ellipse cx="0" cy="8" rx="27" ry="10" fill="rgba(38, 31, 38, .20)" />
      <g className="avatar-bob" shapeRendering="crispEdges">
        {isBunny && (
          <>
            <rect x="-20" y="-64" width="12" height="31" fill={colors.dark} />
            <rect x="-18" y="-62" width="8" height="27" fill={colors.main} />
            <rect x="8" y="-64" width="12" height="31" fill={colors.dark} />
            <rect x="10" y="-62" width="8" height="27" fill={colors.main} />
          </>
        )}
        {!isBunny && !isFrog && (
          <>
            <path d="M-28-40v-22l19 14z" fill={colors.dark} />
            <path d="M28-40v-22L9-48z" fill={colors.dark} />
            <path d="M-24-42v-13l12 10z" fill={colors.accent} />
            <path d="M24-42v-13L12-45z" fill={colors.accent} />
          </>
        )}
        {isFrog && (
          <>
            <rect x="-25" y="-49" width="15" height="15" fill={colors.dark} />
            <rect x="10" y="-49" width="15" height="15" fill={colors.dark} />
            <rect x="-22" y="-47" width="10" height="10" fill={colors.light} />
            <rect x="12" y="-47" width="10" height="10" fill={colors.light} />
          </>
        )}
        <rect x="-24" y="-43" width="48" height="32" rx="8" fill={colors.dark} />
        <rect x="-21" y="-46" width="42" height="31" rx="7" fill={colors.main} />
        <rect x="-17" y="-17" width="34" height="24" rx="6" fill={colors.dark} />
        <rect x="-14" y="-17" width="28" height="20" fill={colors.main} />
        <rect x="-16" y="-31" width="7" height="7" fill={colors.accent} />
        <rect x="9" y="-31" width="7" height="7" fill={colors.accent} />
        {!isFrog && (
          <rect x="-8" y="-21" width="16" height="9" fill={colors.light} />
        )}
        <rect x="-3" y="-18" width="6" height="5" fill={colors.accent} />
        <rect x="-15" y="1" width="11" height="7" fill={colors.dark} />
        <rect x="4" y="1" width="11" height="7" fill={colors.dark} />
        {isCurrent && <path d="M-7-54h14v5H-7z" fill="#f3c74f" />}
      </g>
      <g className="nameplate">
        <rect x={-Math.max(31, name.length * 4.4)} y="17" width={Math.max(62, name.length * 8.8)} height="22" rx="8" />
        <text y="32" textAnchor="middle">
          {name}
        </text>
      </g>
    </g>
  );
}

export default PixelAnimal;

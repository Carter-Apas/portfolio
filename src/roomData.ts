import studioScene from "../public/assets/studio/organic-scene.json";

export type AnimalKind = "fox" | "cat" | "bunny" | "frog" | "kiwi";

export type Position = {
  x: number;
  y: number;
};

export type Facing = "ne" | "nw" | "se" | "sw";

export const STUDIO_SCENE = studioScene;
export const ROOM_WIDTH = studioScene.gridWidth;
export const ROOM_DEPTH = studioScene.gridDepth;
export const STARTING_POSITION = { x: 7, y: 6 };

export const ANIMALS: { id: AnimalKind; label: string }[] = [
  { id: "fox", label: "Fox" },
  { id: "cat", label: "Cat" },
  { id: "bunny", label: "Bunny" },
  { id: "frog", label: "Frog" },
  { id: "kiwi", label: "Kiwi" },
];

export const BLOCKED_TILES = new Set(studioScene.blocked);

export const INTERACTIVE_SPOTS = [
  {
    id: "about",
    kicker: "About the resident",
    title: "Hey, I’m Carter.",
    description:
      "I’m a software engineer in Auckland, currently building useful AI products at ElementX. I like small teams, difficult systems problems, and software with a point of view.",
    tags: ["TypeScript", "React", "AI systems", "Product engineering"],
    href: "https://www.elementx.ai/",
    linkLabel: "Visit ElementX",
  },
  {
    id: "work",
    kicker: "Selected work · 2026",
    title: "Things I’ve been building",
    description:
      "The desk is where experiments turn into products: agentic workflows, dependable interfaces, and prototypes that make complicated technology feel obvious.",
    tags: ["Agents", "Full-stack", "Prototyping", "Developer experience"],
    href: "https://github.com/carter-apas",
    linkLabel: "Browse the code",
  },
  {
    id: "contact",
    kicker: "Leave a note",
    title: "Let’s make something good.",
    description:
      "The studio door is open. If you’re working on a thoughtful product, an unusual technical problem, or just want to compare notes, come say hello.",
    href: "https://github.com/carter-apas",
    linkLabel: "Find me on GitHub",
  },
  {
    id: "computer",
    kicker: "At the desk · ElementX",
    title: "Building AI that people use.",
    description:
      "At ElementX, I build AI products for real-world use. My focus is system architecture, scalability, observability, and fault-tolerant design: building services that handle growing demand, are easy to monitor, and recover when things go wrong.",
    tags: ["JavaScript", "Python", "Kubernetes", "AWS", "Azure"],
    href: "https://www.elementx.ai/",
    linkLabel: "Explore ElementX",
  },
  {
    id: "printer",
    kicker: "On the workbench · Maker’s lab",
    title: "Still tinkering. Still making.",
    description:
      "In my spare time, I still tinker with electronics and mechatronics. This is my little maker’s lab: a place to experiment with circuits, build prototypes, and turn ideas into physical things.",
    tags: ["Electronics", "Mechatronics", "3D printing", "Prototyping"],
    href: "",
    linkLabel: "",
  },
  {
    id: "education",
    kicker: "On the wall · Education & certifications",
    title: "Engineering foundations. Cloud credentials.",
    description:
      "From mechatronics at the University of Auckland to cloud architecture, these are the foundations behind my work.",
    credentials: [
      {
        issuer: "University of Auckland",
        location: "Auckland, New Zealand",
        period: "Feb. 2017 – 2020",
        qualification: "Bachelor of Engineering (Honours) · Mechatronics",
        detail: "Graduated with First Class Honours.",
      },
      {
        issuer: "Amazon Web Services",
        qualification: "AWS Certified Solutions Architect – Associate",
      },
    ],
    href: "",
    linkLabel: "",
  },
  {
    id: "surfboard",
    kicker: "Away from the screen · Surfing",
    title: "A little more ocean, a little less screen.",
    description:
      "When I am not coding or making things, I like getting outside and finding a wave.",
    tags: ["Surfing", "Outdoors", "Auckland"],
    href: "",
    linkLabel: "",
  },
] as const;

// Floor corners come from the same Blender camera as the render and masks.
export const projectGrid = (x: number, y: number) => {
  const u = x / ROOM_WIDTH;
  const v = y / ROOM_DEPTH;
  const [a, b, c, d] = studioScene.floorCorners;
  const blend = (axis: number) =>
    (1 - u) * (1 - v) * a[axis] +
    u * (1 - v) * b[axis] +
    u * v * c[axis] +
    (1 - u) * v * d[axis];
  return { x: blend(0), y: blend(1) };
};
export const toIso = ({ x, y }: Position) => projectGrid(x + 0.5, y + 0.5);

export const isWalkable = ({ x, y }: Position) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  x < ROOM_WIDTH &&
  y >= 0 &&
  y < ROOM_DEPTH &&
  !BLOCKED_TILES.has(`${x},${y}`);

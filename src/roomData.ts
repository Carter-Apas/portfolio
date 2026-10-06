import studioScene from "../public/assets/studio/organic-scene.json";

export type AnimalKind = "fox" | "cat" | "bunny" | "frog";

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
    href: "https://elx.ai",
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
    kicker: "At the desk · Coding",
    title: "Ideas, code, and late-night experiments.",
    description:
      "This is where I build web apps, explore AI tools, and turn small ideas into working software. Placeholder for coding projects, favourite tools, and what I am learning next.",
    tags: ["React", "TypeScript", "AI experiments"],
    href: "https://github.com/carter-apas",
    linkLabel: "Browse my code",
  },
  {
    id: "printer",
    kicker: "On the workbench · Making",
    title: "From a sketch to something you can hold.",
    description:
      "The A1 mini is my little prototyping corner: useful desk accessories, experimental parts, and the occasional print just for fun. Placeholder for 3D printing projects and hobby notes.",
    tags: ["3D printing", "Prototyping", "Bambu Lab A1 mini"],
    href: "",
    linkLabel: "",
  },
  {
    id: "education",
    kicker: "On the wall · Education",
    title: "Engineering at the University of Auckland.",
    description:
      "The engineering roots behind the projects in this room: curiosity, problem solving, and turning ideas into things that work.",
    tags: ["Engineering", "University of Auckland"],
    href: "https://www.auckland.ac.nz/en/engineering.html",
    linkLabel: "Explore engineering at UoA",
  },
  {
    id: "surfboard",
    kicker: "Away from the screen · Surfing",
    title: "A little more ocean, a little less screen.",
    description:
      "When I am not coding or making things, I like getting outside and finding a wave. Placeholder for surf trips, favourite spots, and other hobbies around Auckland.",
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

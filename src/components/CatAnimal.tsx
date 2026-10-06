import BlenderAnimal, { type BlenderAnimalProps } from "./BlenderAnimal";

// Keep the saved cat available to callers while sharing the sprite playback.
function CatAnimal(props: Omit<BlenderAnimalProps, "kind">) {
  return <BlenderAnimal {...props} kind="cat" />;
}

export default CatAnimal;

import "@testing-library/jest-dom";
import { setStrictTileArt } from "../view/missingTile";

// A card with no tile art is a bug, never something to paper over (issue #120): tests throw. A test of the placeholder turns this off.
setStrictTileArt(true);

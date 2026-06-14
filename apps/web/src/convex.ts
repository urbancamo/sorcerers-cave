import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string;
if (!url) throw new Error("VITE_CONVEX_URL is not set — run `pnpm --filter web convex` once.");

export const convex = new ConvexReactClient(url);

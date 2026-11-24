import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// Rate-limit counters are only read while their window is open; clear out the old ones.
crons.interval("sweep rate-limit counters", { hours: 1 }, internal.rateLimits.sweep, {});
export default crons;

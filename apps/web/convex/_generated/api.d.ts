/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminUsers from "../adminUsers.js";
import type * as analytics from "../analytics.js";
import type * as analyticsLib from "../analyticsLib.js";
import type * as auth from "../auth.js";
import type * as bugReport from "../bugReport.js";
import type * as bugReportIssue from "../bugReportIssue.js";
import type * as endpointClient from "../endpointClient.js";
import type * as game from "../game.js";
import type * as gameStats from "../gameStats.js";
import type * as highScores from "../highScores.js";
import type * as http from "../http.js";
import type * as inviteToken from "../inviteToken.js";
import type * as invites from "../invites.js";
import type * as multiplayer from "../multiplayer.js";
import type * as passwords from "../passwords.js";
import type * as roles from "../roles.js";
import type * as strangerDecision from "../strangerDecision.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminUsers: typeof adminUsers;
  analytics: typeof analytics;
  analyticsLib: typeof analyticsLib;
  auth: typeof auth;
  bugReport: typeof bugReport;
  bugReportIssue: typeof bugReportIssue;
  endpointClient: typeof endpointClient;
  game: typeof game;
  gameStats: typeof gameStats;
  highScores: typeof highScores;
  http: typeof http;
  inviteToken: typeof inviteToken;
  invites: typeof invites;
  multiplayer: typeof multiplayer;
  passwords: typeof passwords;
  roles: typeof roles;
  strangerDecision: typeof strangerDecision;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

# Admin Panel

The application needs an administration panel to perform a number of admin tasks. 
In order to implement this we will need to integrate authentication, but this should be hidden from the main
screen and driven off an alternative URL, such as `/login'`

Convex now support an Authentication version 2.0 model which you should use, and I am happy to use their built in
username/password implementation, no need at this stage for anything fancy like OAuth2.

## Authentication

Provide a login form on an unpublished URL '/login' that requests a username and password. This should use the Convex
2.0 authentication mechanism, backed by a users table. We don't need to implement account recovery or password
change at this point.

## Authentication

The users table should implement RBAC, and at this stage we need: `SYSTEM`, `USER`, 
`ANALYTICS` and `TEST`.

Access to the tabs on the admin panel should be restricted based on the authentication rights.

## Admin Panel

This panel will expand with additional functionality, but should include the following core functions, broken down into
tabbed panes, and accessed by users with the given 

1. System Administration: `SYSTEM`
2. User Administration: `USER`
3. Game Analytics: `ANALYTICS`
4. Testing: `TEST`

Initially, we will only implement the `Game Analytics` and `Testing` panels.

## Game Analytics

To include the following:

1. a historical table of games
2. information on live games in progress
3. an analytics panel showing statistics covering all games that have been played

Based on your knowledge of the kind of statistics that are of interest, the best visualisation methods,
and the game itself design the game analytics panel to present this information.

## Testing

This panel should replace the testing functionality available on the main screen, and we should replace the 
unique UUID access mechanism with the `TEST` user authorization mechanism. It can be quite basic at this stage,
we will expand on the available functionality moving forward.


## Convex Auth 2.0

This is the email I received about Convex Auth 2.0:
Today we’re launching Convex Auth 2.0, a new stable authentication foundation for your applications.

Auth lives in your Convex backend, so there’s no separate service, no webhook syncing, and one source of truth for your user data. To get started, run:

npm i @convex-dev/auth@2

What’s included

Multiple sign-in methods
Passkeys, email + password (with verification and password resets), Google, GitHub, and Apple.

Types all the way down
Every sign-in method comes with typed functions and React hooks, so you (and your coding agent) can authenticate fearlessly.

Instant sign out everywhere
Revoke a session and any app still using it signs out immediately. No sitting around waiting for a token to expire.

Credentials stay out of your code
Password hashes and passkey credentials live in their own isolated components, and anyone guessing passwords hits a rate limit.

You own the users table
It’s a regular Convex table, and Convex Auth doesn’t store anything in it or make assumptions about its shape, so add whatever fields and indexes you like.
2.0 is the foundation we’ll keep building on, with more sign-in methods and features on the way. Tell us what your app needs next.
Convex Auth is free and included on all plans, with no per-user pricing.
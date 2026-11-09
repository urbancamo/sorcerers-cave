# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-11-09-bug-report-tool/spec.md

> Created: 2026-11-09
> Status: Implemented, pending manual verification and PR

## Tasks

- [x] 1. Report storage and GitHub issue creation (Convex)
  - [x] 1.1 Write tests for the issue builder and retry policy (`convex/bugReportIssue.test.ts`)
  - [x] 1.2 Write convex-test tests for `submit` and `createIssue` with `fetch` mocked (`convex/bugReport.test.ts`)
  - [x] 1.3 Add the `bugReports` table; share the log helper (`gameLog`) with `game.log`
  - [x] 1.4 Implement `bugReportIssue.ts` and `bugReport.ts`
  - [x] 1.5 Verify all tests pass

- [x] 2. Title bar icon and report modal
  - [x] 2.1 Write tests for the `TitleBar` bug icon and `BugReportModal`
  - [x] 2.2 Add the `bug` glyph and `onBug`/`bugOpen` to `TitleBar`; wire `GameScreen`
  - [x] 2.3 Implement `BugReportModal` and styles; inject `VITE_BUILD_ID` in `vite.config.ts`
  - [x] 2.4 Verify all tests pass

- [x] 3. Manual and documentation
  - [x] 3.1 Add the `bug-report` manual topic and update the title-bar descriptions
  - [x] 3.2 Document the env vars and labels in `OPTIONS.md`; extend the manual test checklist

- [ ] 4. Go live
  - [ ] 4.1 Create the six labels in the repository
  - [ ] 4.2 Set `GITHUB_ISSUES_TOKEN` on the Convex deployment
  - [ ] 4.3 File one real report from a Test Mode game and close the issue

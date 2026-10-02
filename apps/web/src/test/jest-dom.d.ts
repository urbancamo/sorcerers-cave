import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// vitest 5 changed Assertion to <R, T>; jest-dom's own augmentation still uses
// <T = any>, so it no longer merges. Re-declare it with the new signature.
declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<any, any> {}
}

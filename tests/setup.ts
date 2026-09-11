import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library's automatic cleanup is not registered for us.
// Without this, every render stacks up and queries find duplicates.
afterEach(() => {
  cleanup();
});

import { vi } from 'vitest';

const mockSdk = {
  app: {
    onConfigure: vi.fn(),
    getParameters: vi.fn().mockReturnValueOnce({}),
    setReady: vi.fn(),
    getCurrentState: vi.fn(),
  },
  window: {
    startAutoResizer: vi.fn(),
  },
  dialogs: {
    openCurrent: vi.fn(),
  },
  ids: {
    app: 'test-app',
    entry: 'test-entry',
    environment: 'master',
    space: 'vvbytozt5evi',
  },
};

export { mockSdk };

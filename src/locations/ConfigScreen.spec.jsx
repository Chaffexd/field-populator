import React from 'react';
import ConfigScreen from './ConfigScreen';
import { render, screen } from '@testing-library/react';
import { mockSdk } from '../../test/mocks';
import { vi } from 'vitest';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
}));

vi.mock('../lib/contentful', () => ({
  cmaSDK: () => ({
    locale: {
      getMany: vi.fn().mockResolvedValue({ items: [] }),
    },
  }),
}));

vi.mock('../lib/rateLimiter', () => ({
  callCMA: (fn) => fn(),
}));

describe('Config Screen component', () => {
  it('renders the main heading without crashing', async () => {
    render(<ConfigScreen />);

    expect(
      await screen.findByText('Locale Populator — Configuration')
    ).toBeInTheDocument();
  });
});

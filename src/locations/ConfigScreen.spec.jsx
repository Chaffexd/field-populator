import React from 'react';
import ConfigScreen from './ConfigScreen';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSdk } from '../../test/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The shared mock SDK has no setParameters — this screen saves through it.
mockSdk.app.setParameters = vi.fn().mockResolvedValue(undefined);

const localeGetMany = vi.fn();
const cmaSDKMock = vi.fn(() => ({ locale: { getMany: localeGetMany } }));

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
}));

vi.mock('../lib/contentful', () => ({
  cmaSDK: (...args) => cmaSDKMock(...args),
}));

vi.mock('../lib/rateLimiter', () => ({
  callCMA: (fn) => fn(),
}));

describe('Config Screen component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSdk.app.getParameters.mockResolvedValue({});
    mockSdk.app.getCurrentState.mockResolvedValue({});
    mockSdk.app.setParameters.mockResolvedValue(undefined);
    localeGetMany.mockResolvedValue({ items: [] });
    cmaSDKMock.mockReturnValue({ locale: { getMany: localeGetMany } });
  });

  it('renders the main heading without crashing', async () => {
    render(<ConfigScreen />);

    expect(
      await screen.findByText('Locale Populator — Configuration')
    ).toBeInTheDocument();
  });

  describe('management token', () => {
    it('warns and skips the locale fetch when no token is saved', async () => {
      render(<ConfigScreen />);

      await waitFor(() => expect(mockSdk.app.setReady).toHaveBeenCalled());
      expect(screen.getByText(/No token saved yet/i)).toBeInTheDocument();
      expect(cmaSDKMock).not.toHaveBeenCalled();
      expect(localeGetMany).not.toHaveBeenCalled();
    });

    it('fetches locales with the saved token on load', async () => {
      mockSdk.app.getParameters.mockResolvedValue({ cmaToken: 'cfpat-saved' });

      render(<ConfigScreen />);

      await waitFor(() => expect(localeGetMany).toHaveBeenCalled());
      expect(cmaSDKMock).toHaveBeenCalledWith(mockSdk, 'cfpat-saved');
      expect(screen.queryByText(/No token saved yet/i)).not.toBeInTheDocument();
    });

    it('persists the entered token when configuration is saved', async () => {
      render(<ConfigScreen />);
      await waitFor(() => expect(mockSdk.app.setReady).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Contentful Management token'), {
        target: { value: '  cfpat-typed  ' },
      });
      fireEvent.click(screen.getByText('Save configuration'));

      await waitFor(() => expect(mockSdk.app.setParameters).toHaveBeenCalled());
      expect(mockSdk.app.setParameters.mock.calls[0][0]).toMatchObject({
        cmaToken: 'cfpat-typed',
      });
    });

    it('surfaces an invalid token as an error instead of an empty locale list', async () => {
      mockSdk.app.getParameters.mockResolvedValue({ cmaToken: 'cfpat-bad' });
      localeGetMany.mockRejectedValue({ status: 401 });

      render(<ConfigScreen />);

      await waitFor(() =>
        expect(screen.getByText(/Authentication failed \(401\)/i)).toBeInTheDocument()
      );
    });
  });
});

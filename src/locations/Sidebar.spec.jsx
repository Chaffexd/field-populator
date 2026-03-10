import React from 'react';
import Sidebar from './Sidebar';
import { fireEvent, render, screen } from '@testing-library/react';
import { mockCma, mockSdk } from '../../test/mocks';
import { vi } from 'vitest';

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
  useCMA: () => mockCma,
}));

describe('Sidebar component', () => {
  it('starts the auto resizer and opens the dialog with entry context', () => {
    render(<Sidebar />);

    expect(mockSdk.window.startAutoResizer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open Dialog' }));

    expect(mockSdk.dialogs.openCurrent).toHaveBeenCalledWith({
      title: 'Locale Populator',
      width: '1400px',
      minHeight: '800px',
      parameters: {
        entryId: 'test-entry',
        environmentId: 'master',
        spaceId: 'vvbytozt5evi',
      },
    });
  });
});

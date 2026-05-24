'use client';

import React from 'react';
import { UIProvider } from '../context/UIContext';
import { TelemetryProvider } from '../context/TelemetryContext';

export default function Providers({ children }) {
  return (
    <UIProvider>
      <TelemetryProvider>
        {children}
      </TelemetryProvider>
    </UIProvider>
  );
}

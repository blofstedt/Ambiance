/**
 * @file Entry point. Chooses App vs DreamView.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { DreamView } from './DreamView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isDreamMode } from './lib/native';
import { migrateLegacyStorage } from './lib/storage';
import './index.css';

// Carry forward settings written by earlier versions before anything reads them.
migrateLegacyStorage();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root was not found in index.html');
}

// AND-06: the screensaver renders a read-only view with no networking.
const Root = isDreamMode() ? DreamView : App;

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installLegacyReviewSnapshotStorageGuard } from './lib/legacyReviewSnapshotStorage.ts'

installLegacyReviewSnapshotStorageGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

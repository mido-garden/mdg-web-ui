import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { StoreProvider } from './store.jsx'
import { ConfirmProvider } from './components/ConfirmDialog.jsx'
import { applyTheme, savedTheme } from './theme.js'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import './styles.css'

applyTheme(savedTheme())

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
)

import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ProjectProvider } from '@/lib/ProjectContext'
import App from './App'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <ProjectProvider>
      <App />
    </ProjectProvider>
  </HashRouter>,
)
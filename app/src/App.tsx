import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import QuotePage from './pages/QuotePage'
import SavedQuotesPage from './pages/SavedQuotesPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/quote" element={<QuotePage />} />
      <Route path="/saved-quotes" element={<SavedQuotesPage />} />
    </Routes>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import HomePage from './pages/HomePage'
import App from './App.jsx'
import CascadeAnalysis from './pages/CascadeAnalysis'
import ProbabilisticMarginAnalysis from './pages/ProbabilisticMarginAnalysis'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/mvm" element={<App />} />
        <Route path="/cascade" element={<CascadeAnalysis />} />
        <Route path="/pma" element={<ProbabilisticMarginAnalysis />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

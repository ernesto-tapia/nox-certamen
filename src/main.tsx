import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import GameApp from '../components/game-app';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(<StrictMode><GameApp /></StrictMode>);

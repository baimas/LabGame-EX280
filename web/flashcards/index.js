// Baralhos de flashcards das duas trilhas.
import { CARDS_280 } from './ex280.js';
import { CARDS_180 } from './ex180.js';

export const CARDS = [...CARDS_280, ...CARDS_180];
export const cardsDa = (trilha, cap = null) => CARDS.filter((c) => c.trilha === trilha && (!cap || c.cap === cap));

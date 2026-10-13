// Bilim bazasining boshlang'ich to'plami — ikki fayldan yig'iladi.
// Server har ishga tushganda bazaga yoziladi (kb.ts → syncSeed).

import type { SeedArticle } from './kbTypes';
import { KB_SEED_CORE } from './kbSeedCore';
import { KB_SEED_SETUP } from './kbSeedSetup';

export const KB_SEED: SeedArticle[] = [...KB_SEED_CORE, ...KB_SEED_SETUP];

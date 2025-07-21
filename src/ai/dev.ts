import { config } from 'dotenv';
config();

import '@/ai/flows/suggest-data-updates.ts';
import '@/ai/flows/summarize-data-differences.ts';
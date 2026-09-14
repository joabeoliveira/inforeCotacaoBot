import fs from 'node:fs/promises';
import path from 'node:path';
import normalizeSerperShopping from '../normalizers/serperNormalizer.js';
import { BraveSearchClient } from '../brave/client.js';

export async function consumeSerperJsonFile(filePath: string, braveClient?: BraveSearchClient) {
  const raw = await fs.readFile(filePath, { encoding: 'utf8' });
  // Extract JSON code block from the playground markdown if present
  const jsonMatch = raw.match(/```json([\s\S]*?)```/);
  const payload = jsonMatch ? jsonMatch[1].trim() : raw;
  const obj = JSON.parse(payload);
  const shopping = obj.shopping ?? [];
  return normalizeSerperShopping(shopping, braveClient);
}

export default consumeSerperJsonFile;

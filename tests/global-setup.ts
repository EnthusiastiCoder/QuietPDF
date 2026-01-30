import { generateLarge } from '../scripts/make-fixtures.ts';

/**
 * Playwright globalSetup: builds the large `.gen/` fixtures
 * (tests/fixtures/.gen/, gitignored) when they are missing. The small
 * fixtures are committed; regenerate them with `npm run fixtures`.
 */
export default async function globalSetup(): Promise<void> {
  await generateLarge();
}

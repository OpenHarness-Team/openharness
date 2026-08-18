/**
 * Internal type helpers for the published-cordis declaration graph.
 * @module dsh-plugin-desktop/internal/context
 */

import type { Service } from '@deepseek-ai/cordis';

/**
 * The Cordis Context type extracted from `Service`'s constructor. The
 * published cordis declaration graph surfaces two nominal identities for
 * Context (the `lib/types/index` re-export versus `lib/types/context`), so
 * annotating constructor parameters with this extracted type keeps the
 * `super()` call site identity-correct. Other library boundaries
 * (e.g. dsh-settings) cite this type in a documented cast.
 */
export type CordisContext = ConstructorParameters<typeof Service>[0];

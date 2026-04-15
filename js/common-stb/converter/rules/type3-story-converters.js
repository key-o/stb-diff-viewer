/**
 * Type3: Story Attribute Conversions
 * Functions for converting StbStory attributes between STB versions
 */

import logger from '../utils/converter-logger.js';
import { getStbRoot } from '../utils/xml-helper.js';

/**
 * Convert StbStory attributes from v2.0.2 to v2.1.0
 * Note: This requires special handling for level_name generation
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertStoryAttributesTo210(stbRoot) {
  const root = getStbRoot(stbRoot);
  const stories = root?.[0]?.['StbModel']?.[0]?.['StbStories']?.[0]?.['StbStory'];
  if (!stories) return;

  let count = 0;
  stories.forEach((story) => {
    const attrs = story['$'];
    if (!attrs) return;

    // Add level_name based on height if not present
    if (!attrs['level_name'] && attrs['height']) {
      attrs['level_name'] = `FL+${attrs['height']}`;
      count++;
    }

    // Add kind with default value
    if (!attrs['kind']) {
      attrs['kind'] = 'GENERAL';
      count++;
    }
  });

  if (count > 0) {
    logger.info(`StbStory: Added ${count} new attributes`);
  }
}

/**
 * Convert StbStory attributes from v2.1.0 to v2.0.2
 * @param {object} stbRoot - ST-Bridge root element
 */
export function convertStoryAttributesTo202(stbRoot) {
  const root = getStbRoot(stbRoot);
  const stories = root?.[0]?.['StbModel']?.[0]?.['StbStories']?.[0]?.['StbStory'];
  if (!stories) return;

  let count = 0;
  stories.forEach((story) => {
    const attrs = story['$'];
    if (!attrs) return;

    // Remove v2.1.0 specific attributes
    ['level_name', 'kind', 'strength_concrete'].forEach((key) => {
      if (attrs[key] !== undefined) {
        delete attrs[key];
        count++;
      }
    });
  });

  if (count > 0) {
    logger.info(`StbStory: Removed ${count} v2.1.0 attributes`);
  }
}

/**
 * Tag Service
 *
 * Handles tag management and error-tag relationships.
 */

import { createLogger } from '@automaker/utils';
import { getDatabase } from '../database/connection.js';
import type { TagCategory, TagRecord, TagRow } from '../types.js';

const logger = createLogger('MemoryLayer:TagService');

/**
 * Convert database row to TagRecord
 */
function rowToTagRecord(row: TagRow): TagRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category as TagCategory | null,
  };
}

/**
 * Create a new tag
 */
export function createTag(name: string, category?: TagCategory): TagRecord {
  const db = getDatabase();
  const normalizedName = name.toLowerCase().trim();

  const result = db
    .prepare(
      `
    INSERT INTO tags (name, category)
    VALUES (?, ?)
  `
    )
    .run(normalizedName, category || null);

  const tagId = Number(result.lastInsertRowid);

  logger.debug(`Created tag: ${normalizedName} (id: ${tagId})`);

  return {
    id: tagId,
    name: normalizedName,
    category: category || null,
  };
}

/**
 * Get a tag by name
 */
export function getTagByName(name: string): TagRecord | null {
  const db = getDatabase();
  const normalizedName = name.toLowerCase().trim();

  const row = db
    .prepare(
      `
    SELECT * FROM tags WHERE name = ?
  `
    )
    .get(normalizedName) as TagRow | undefined;

  if (!row) {
    return null;
  }

  return rowToTagRecord(row);
}

/**
 * Get a tag by ID
 */
export function getTagById(id: number): TagRecord | null {
  const db = getDatabase();

  const row = db
    .prepare(
      `
    SELECT * FROM tags WHERE id = ?
  `
    )
    .get(id) as TagRow | undefined;

  if (!row) {
    return null;
  }

  return rowToTagRecord(row);
}

/**
 * Get or create tags by names
 * Returns existing tags or creates new ones
 */
export function getOrCreateTags(names: string[], category?: TagCategory): TagRecord[] {
  const db = getDatabase();
  const results: TagRecord[] = [];

  for (const name of names) {
    const normalizedName = name.toLowerCase().trim();
    if (!normalizedName) continue;

    // Try to get existing tag
    let tag = getTagByName(normalizedName);

    if (!tag) {
      // Create new tag
      tag = createTag(normalizedName, category);
    }

    results.push(tag);
  }

  return results;
}

/**
 * Get all tags
 */
export function getAllTags(): TagRecord[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM tags
    ORDER BY name ASC
  `
    )
    .all() as TagRow[];

  return rows.map(rowToTagRecord);
}

/**
 * Get tags by category
 */
export function getTagsByCategory(category: TagCategory): TagRecord[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM tags
    WHERE category = ?
    ORDER BY name ASC
  `
    )
    .all(category) as TagRow[];

  return rows.map(rowToTagRecord);
}

/**
 * Get tags for an error
 */
export function getTagsByErrorId(errorId: number): TagRecord[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT t.* FROM tags t
    INNER JOIN error_tags et ON t.id = et.tag_id
    WHERE et.error_id = ?
    ORDER BY t.name ASC
  `
    )
    .all(errorId) as TagRow[];

  return rows.map(rowToTagRecord);
}

/**
 * Add tags to an error
 */
export function addTagsToError(errorId: number, tagIds: number[]): void {
  const db = getDatabase();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO error_tags (error_id, tag_id)
    VALUES (?, ?)
  `);

  for (const tagId of tagIds) {
    insert.run(errorId, tagId);
  }
}

/**
 * Remove tags from an error
 */
export function removeTagsFromError(errorId: number, tagIds: number[]): void {
  const db = getDatabase();

  const remove = db.prepare(`
    DELETE FROM error_tags
    WHERE error_id = ? AND tag_id = ?
  `);

  for (const tagId of tagIds) {
    remove.run(errorId, tagId);
  }
}

/**
 * Set tags for an error (replaces existing tags)
 */
export function setErrorTags(errorId: number, tagIds: number[]): void {
  const db = getDatabase();

  // Remove all existing tags
  db.prepare(
    `
    DELETE FROM error_tags WHERE error_id = ?
  `
  ).run(errorId);

  // Add new tags
  if (tagIds.length > 0) {
    addTagsToError(errorId, tagIds);
  }
}

/**
 * Get errors with a specific tag
 */
export function getErrorIdsByTag(tagId: number): number[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT error_id FROM error_tags
    WHERE tag_id = ?
  `
    )
    .all(tagId) as Array<{ error_id: number }>;

  return rows.map((r) => r.error_id);
}

/**
 * Get errors with any of the specified tags
 */
export function getErrorIdsByTags(tagIds: number[]): number[] {
  if (tagIds.length === 0) {
    return [];
  }

  const db = getDatabase();
  const placeholders = tagIds.map(() => '?').join(', ');

  const rows = db
    .prepare(
      `
    SELECT DISTINCT error_id FROM error_tags
    WHERE tag_id IN (${placeholders})
  `
    )
    .all(...tagIds) as Array<{ error_id: number }>;

  return rows.map((r) => r.error_id);
}

/**
 * Get popular tags (by usage count)
 */
export function getPopularTags(limit: number = 20): Array<TagRecord & { usageCount: number }> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT t.*, COUNT(et.error_id) as usage_count
    FROM tags t
    LEFT JOIN error_tags et ON t.id = et.tag_id
    GROUP BY t.id
    ORDER BY usage_count DESC
    LIMIT ?
  `
    )
    .all(limit) as Array<TagRow & { usage_count: number }>;

  return rows.map((row) => ({
    ...rowToTagRecord(row),
    usageCount: row.usage_count,
  }));
}

/**
 * Update tag category
 */
export function updateTagCategory(id: number, category: TagCategory | null): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    UPDATE tags SET category = ? WHERE id = ?
  `
    )
    .run(category, id);

  return result.changes > 0;
}

/**
 * Delete a tag (also removes from all errors)
 */
export function deleteTag(id: number): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    DELETE FROM tags WHERE id = ?
  `
    )
    .run(id);

  return result.changes > 0;
}

/**
 * Get total tag count
 */
export function getTagCount(): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM tags
  `
    )
    .get() as { count: number };

  return result.count;
}

/**
 * Search tags by name prefix
 */
export function searchTags(prefix: string, limit: number = 10): TagRecord[] {
  const db = getDatabase();
  const searchTerm = prefix.toLowerCase().trim() + '%';

  const rows = db
    .prepare(
      `
    SELECT * FROM tags
    WHERE name LIKE ?
    ORDER BY name ASC
    LIMIT ?
  `
    )
    .all(searchTerm, limit) as TagRow[];

  return rows.map(rowToTagRecord);
}

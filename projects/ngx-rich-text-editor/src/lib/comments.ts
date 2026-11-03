/**
 * Author of a comment or of a reply: the `currentUser` input.
 *
 * @example
 * ```ts
 * user: RteUser = { id: 'u42', name: 'Pierre Hanauer', color: '#3b6cf6' };
 * ```
 * @since 0.5.0
 */
export interface RteUser {
  /** Stable identifier of the user: decides who may delete a comment or a reply. */
  id: string;
  /** Name shown on the comments. */
  name: string;
  /** Color of the user's avatar (any CSS color); derived from `id` when omitted. */
  color?: string;
}

/**
 * Reply in the thread of a comment.
 *
 * @since 0.5.0
 */
export interface RteCommentReply {
  /** Unique identifier of the reply. */
  id: string;
  /** Who wrote the reply (a copy of `currentUser` at that time). */
  author: RteUser;
  /** When the reply was written, ISO 8601 (`new Date().toISOString()`). */
  date: string;
  /** Plain text of the reply (line breaks are kept, HTML is shown as text). */
  text: string;
}

/**
 * Comment on a part of the text, with its thread of replies — an item of the `comments` model.
 *
 * The commented text is marked in the HTML with `<span data-comment="{id}">` (several spans when
 * the text spans several blocks); everything else lives here, so the comments can be stored apart
 * from the content and the HTML can be published without them.
 *
 * @example
 * ```json
 * {
 *   "id": "3f1c…",
 *   "author": { "id": "u42", "name": "Pierre" },
 *   "date": "2026-11-03T20:15:00.000Z",
 *   "text": "Source ?",
 *   "resolved": false,
 *   "replies": [{ "id": "9ab2…", "author": { "id": "u7", "name": "Léa" }, "date": "…", "text": "Ajoutée." }]
 * }
 * ```
 * @since 0.5.0
 */
export interface RteComment {
  /** Unique identifier, also written in the `data-comment` attribute of the marked text. */
  id: string;
  /** Who started the thread (a copy of `currentUser` at that time). */
  author: RteUser;
  /** When the comment was written, ISO 8601 (`new Date().toISOString()`). */
  date: string;
  /** Plain text of the comment (line breaks are kept, HTML is shown as text). */
  text: string;
  /** Resolved threads are no longer highlighted; they stay in the data and can be reopened. */
  resolved: boolean;
  /** Replies, oldest first. */
  replies: RteCommentReply[];
}

/** Unique identifier for comments and replies. */
export function commentId(): string {
  const crypto = globalThis.crypto as Crypto | undefined;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Avatar color of a user: its own color, or one derived from its id. */
export function userColor(user: RteUser): string {
  if (user.color) return user.color;
  let hash = 0;
  for (const char of user.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}

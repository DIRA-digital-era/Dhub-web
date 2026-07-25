import * as SQLite from 'expo-sqlite';
import { ChatMessage } from '../types';

export const db = SQLite.openDatabaseSync('dhub_chat.db');

// Initialize tables safely
db.execSync(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT,
    sender_id TEXT,
    receiver_id TEXT,
    message TEXT,
    is_read INTEGER,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS pending (
    id TEXT PRIMARY KEY,
    thread_id TEXT,
    sender_id TEXT,
    receiver_id TEXT,
    message TEXT,
    created_at TEXT
  );
`);

// Save delivered message
export async function saveMessageLocal(msg: {
  id: string;
  threadId: string;
  senderId: string;
  receiverId: string;
  message: string;
  is_read: boolean;
  created_at: string;
}) {
  await db.runAsync(
    `
      INSERT OR REPLACE INTO messages
      (id, thread_id, sender_id, receiver_id, message, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      msg.id,
      msg.threadId,
      msg.senderId,
      msg.receiverId,
      msg.message,
      msg.is_read ? 1 : 0,
      msg.created_at,
    ]
  );
}

// Fetch delivered messages
export async function fetchLocalMessages(threadId: string, limit: number): Promise<ChatMessage[]> {
  const rows = await db.getAllAsync(
    `
      SELECT * FROM messages
      WHERE thread_id = ?
      ORDER BY datetime(created_at) ASC
      LIMIT ?
    `,
    [threadId, limit]
  );

  return rows.map((r: any) => ({
    id: r.id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    message: r.message,
    read: Boolean(r.is_read),
    created_at: r.created_at,
    threadId,
  }));
}

// Save unsent message
export async function savePendingMessage(msg: ChatMessage) {
  await db.runAsync(
    `
      INSERT OR REPLACE INTO pending
      (id, thread_id, sender_id, receiver_id, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      msg.id,
      msg.threadId,
      msg.senderId,
      msg.receiverId,
      msg.message,
      msg.created_at,
    ]
  );
}

// Read unsent messages
export async function fetchPendingMessages(threadId: string) {
  return db.getAllAsync(
    `SELECT * FROM pending WHERE thread_id = ? ORDER BY datetime(created_at) ASC`,
    [threadId]
  );
}

// Remove pending after send
export async function removePendingMessage(id: string) {
  await db.runAsync(`DELETE FROM pending WHERE id = ?`, [id]);
}

// Local mark as read
export async function markMessagesReadLocal(threadId: string, userId: string) {
  await db.runAsync(
    `
      UPDATE messages
      SET is_read = 1
      WHERE thread_id = ?
      AND receiver_id = ?
      AND is_read = 0
    `,
    [threadId, userId]
  );
}

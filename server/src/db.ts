// server/src/db.ts
// MongoDB connection singleton.
// Exports the two collections used by the RAG pipeline:
//   - chunks     : stores PDF text chunks + their vector embeddings
//   - schemes    : stores scheme metadata (display info, colors, etc.)

import { MongoClient, Db, Collection } from "mongodb";
import dotenv from "dotenv";
import type { Scheme, Chunk } from "./types.js";
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI as string;
const client = new MongoClient(MONGODB_URI);
let db: Db;

export async function connectDB(): Promise<Db> {
  if (db) return db;
  await client.connect();
  db = client.db("nitisetu");
  console.log("✅ Connected to MongoDB Atlas");
  return db;
}

export async function getChunksCollection(): Promise<Collection<Chunk>> {
  const database = await connectDB();
  return database.collection<Chunk>("chunks");
}

export async function getSchemesCollection(): Promise<Collection<Scheme>> {
  const database = await connectDB();
  return database.collection<Scheme>("schemes");
}

export async function getProfilesCollection(): Promise<Collection<any>> {
  const database = await connectDB();
  return database.collection<any>("profiles");
}

// ── Atlas Vector Search Index Definition ───────────────────────────
// IMPORTANT: Updated numDimensions to 384 to match local all-MiniLM-L6-v2
// Run this ONCE in MongoDB Atlas UI → Search → Create Index
// Collection: chunks   Index name: vector_index
//
// {
//   "fields": [
//     {
//       "type": "vector",
//       "path": "embedding",
//       "numDimensions": 384,
//       "similarity": "cosine"
//     },
//     {
//       "type": "filter",
//       "path": "schemeId"
//     }
//   ]
// }
// server/src/rag/retriever.ts
import { getChunksCollection } from "../db.js";
import { pipeline } from "@xenova/transformers";
import dotenv from "dotenv";
import type { FarmerProfile, Chunk } from "../types.js";

dotenv.config();

const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

async function embedText(text: string): Promise<number[]> {
  const result = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(result.data as number[]);
}

export function profileToQuery(profile: FarmerProfile, schemeName: string): string {
  const parts: string[] = [];
  if (profile.landSize !== undefined) parts.push(`land size ${profile.landSize} ha`);
  if (profile.income !== undefined) parts.push(`income ${profile.income} INR`);
  if (profile.govtJob) parts.push(`is government employee`);
  return `Eligibility criteria for ${schemeName}. Farmer profile: ${parts.join(", ")}. Identify specific exclusion and inclusion rules.`;
}

export async function retrieveChunks(query: string, schemeId: string, topK = 5): Promise<Chunk[]> {
  try {
    const queryEmbedding = await embedText(query);
    const chunksCol = await getChunksCollection();

    const aggregationPipeline = [
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: topK * 10,
          limit: topK,
          filter: { schemeId },
        },
      },
      {
        $project: {
          _id: 0,
          schemeId: 1,
          schemeName: 1,
          text: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    return await chunksCol.aggregate<Chunk>(aggregationPipeline).toArray();
  } catch (err) {
    console.error("❌ Retrieval failed:", err);
    return [];
  }
}

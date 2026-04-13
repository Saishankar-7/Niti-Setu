// server/src/rag/ragChain.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { retrieveChunks, profileToQuery } from "./retriever.js";
import type { FarmerProfile, Scheme, RAGResult, SchemeResult } from "../types.js";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));


const SYSTEM_PROMPT = `You are "Niti-Setu AI", an expert on Indian government schemes for farmers.
Determine eligibility based ONLY on provided PDF excerpts.

FORMAT: Respond with a valid JSON object:
{
  "eligible": boolean,
  "confidence": "high" | "medium" | "low",
  "proof": [{ "label": "string", "msg": "string", "citation": "string" }],
  "reasons": [{ "label": "string", "msg": "string", "citation": "string" }],
  "aiExplanation": "A friendly 2-3 sentence summary for the farmer.",
  "retrievedSnippet": "A single direct quote from the text that supports the decision."
}`;

export async function runRAGChain(profile: FarmerProfile, scheme: Scheme, retries = 2): Promise<RAGResult> {
  const query = profileToQuery(profile, scheme.fullName);
  const chunks = await retrieveChunks(query, scheme.id, 6);

  if (!chunks || chunks.length === 0) {
    return {
      eligible: null,
      reasons: [{ label: "Data Missing", msg: "No PDF data found." }],
      aiExplanation: `I haven't processed the documents for ${scheme.name} yet.`,
    };
  }

  const context = chunks.map((c) => c.text).join("\n\n---\n\n");
  const userPrompt = `FARMER PROFILE: ${JSON.stringify(profile)}
SCHEME: ${scheme.fullName}

CONTEXT FROM OFFICIAL DOCUMENTS:
${context}

Analyze the farmer against the scheme criteria. Respond ONLY in the requested JSON format.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: "application/json" },
    });

    const text = result.response.text();
    return {
      ...JSON.parse(text),
      chunksUsed: chunks.length,
      topChunkScore: chunks[0]?.score ?? 0,
    };
  } catch (err: any) {
    const errorMsg = err.message || "";
    
    // Handle 429 Too Many Requests with a retry
    if (retries > 0 && (errorMsg.includes("429") || errorMsg.includes("Too Many Requests"))) {
      console.warn(`⚠️ Rate limit hit for ${scheme.name}. Retrying in 2s... (${retries} retries left)`);
      await delay(2000);
      return runRAGChain(profile, scheme, retries - 1);
    }

    console.error(`❌ Gemini reasoning failed for ${scheme.name}:`, errorMsg);
    return {
      eligible: null,
      aiExplanation: "I encountered an error while analyzing your eligibility. Please try again later.",
    };
  }
}

export async function runRAGChainAll(profile: FarmerProfile, schemes: Scheme[]): Promise<SchemeResult[]> {
  const results: SchemeResult[] = [];
  
  console.log(`\n⏳ Processing ${schemes.length} schemes sequentially...`);
  
  for (const scheme of schemes) {
    try {
      const res = await runRAGChain(profile, scheme);
      results.push({ scheme, ...res });
      // Small stagger to stay within free-tier burst limits (500ms)
      await delay(500); 
    } catch (err) {
      results.push({ 
        scheme, 
        eligible: null, 
        aiExplanation: "Analysis failed unexpectedly." 
      });
    }
  }
  
  return results;
}
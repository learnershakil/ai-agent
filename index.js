import axios from "axios";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import dotenv from "dotenv";
import { ChromaClient } from "chromadb";

dotenv.config();

const openai = new OpenAI();
const chromaClient = new ChromaClient({ path: 'http://localhost:8000' });
chromaClient.heartbeat();

const WEB_COLLECTION = "WEB_SCAPED_DATA_COLLECTION-1";

async function scrapewebpage(url = "") {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const pageHead = $("head").html();
  const pageBody = $("body").html();

  const internalLinks = new Set();
  const externalLinks = new Set();

  $("a").each((_, el) => {
    const link = $(el).attr("href");
    if (link === "/" || link === "#" || link === "") return;
    if (link.startsWith("http") || link.startsWith("https")) {
      externalLinks.add(link);
    } else {
      internalLinks.add(link);
    }
  });

  return { head: pageHead, body: pageBody, internalLinks: Array.from(internalLinks), externalLinks: Array.from(externalLinks) };
}

async function generateVectorEmbeddings({ text }) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });
  return embedding.data[0].embedding;
}

async function insertIntoDB({ embedding, url, body = '', head }){
  const collection = await chromaClient.getOrCreateCollection({
  name: WEB_COLLECTION,
  });
  collection.add({
  ids: [url],
  embeddings: [embedding],
  metadatas: [{ url, body, head }],
  })
}

async function ingest(url = "") {
  console.log(`👾 Ingesting ${url} 👾`);
  const { head, body, internalLinks } = await scrapewebpage(url);
  const bodyChunks = chunkText(body, 1000);
  
  const headEmbedding = await generateVectorEmbeddings({ text: head });
  await insertIntoDB({ embedding: headEmbedding, url });

  for (const chunk of bodyChunks){
      const bodyEmbedding = await generateVectorEmbeddings({ text: chunk });
      await insertIntoDB({ embedding: bodyEmbedding, url, head, body: chunk });
    }

    // for(const link of internalLinks){
    //   const _url = `${url}${link}`;
    //   await ingest(_url);
    // }
    console.log(`👾 Ingesting Success ${url} 👾`);
}

// ingest("https://learnershakil.me");

async function chat(question = '') {
  const questionEmbedding = await generateVectorEmbeddings({ text: question });

  const collection = chromaClient.getOrCreateCollection({name: WEB_COLLECTION, })

  const collectionResult = await collection.query({
    nRessults: 3,
    queryEmbedding: questionEmbedding,
  })

  const body = collectionResult.metadatas.map((result) => result.body).filter(value => value.trim() !== '' && !!value);
  console.log(body);

  const url = collectionResult.metadatas.map((result) => result.url).filter(value => value.trim() !== '' && !!value);
  console.log(url);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are AI support agent expert in providing support to users on behalf of webpage." },
      { role: "user", content: `
        Query: ${question}\n\n
        URLs: ${url.join(", ")}
        Retrived Context: ${body.join(", ")}
        ` },
    ],
  });
  console.log({
    message: `👾: ${response.choices[0].message.content}`,
    url: url[0],
  })
}

chat("What is this website?");

function chunkText(text, chunkSize) {
  if (!text || chunkSize <= 0) return [];

  const words = text.split(/\s+/);
  const chunks = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

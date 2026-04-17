---
id: rag-agents
order: 04
title: RAG & Agents
subtitle: Embeddings, retrieval, tool-use, agent planning — the foundations of applied LLM systems
topic: rag-agents
difficulty: intermediate
estimatedReadMinutes: 51
hero: true
primitives:
  - vector-search
  - agent-loop
  - tool-tracer
citations:
  - { book: huyen-aie, chapters: "Ch. 6", topic: "RAG architecture and agents" }
  - { book: iusztin-labonne-handbook, chapters: "RAG + retrieval chapters", topic: "production RAG" }
  - { book: bouchard-production, chapters: "RAG + agents", topic: "reliability and production" }
  - { book: hands-on-llms, chapters: "retrieval chapters", topic: "embeddings + semantic search" }
tags: [rag, agents, retrieval, embeddings, tool-use]
updatedAt: 2026-04-17
---

## The running example: a support-docs assistant

To keep every concept in this topic grounded in something concrete, imagine you are building **Acme Support Copilot** — an internal assistant that answers customer-support agents' questions using the company's documentation. The corpus includes ~12,000 help-center articles, ~40,000 resolved-ticket threads, a product changelog, and a handful of runbook PDFs. Queries look like "why does invoice export fail when the currency is JPY" or "what's the difference between plan A and plan B for SSO enforcement." Agents want an answer in under two seconds, with citations back to the source doc, and they will escalate to engineering if the bot confidently hallucinates. This example reappears throughout the topic — every retrieval decision, every embedding choice, every agent-vs-RAG trade-off will be revisited against it.

Hold that system in your head as you read. When I describe a chunking strategy, picture how it cuts the Acme help articles. When I describe a re-ranker, picture which passages it would surface for "SSO enforcement." The abstractions mean little without the application they serve.

## The problem RAG solves

A language model is a frozen snapshot of its training distribution. Three hard constraints follow from that fact, and retrieval-augmented generation exists because of each of them[^1].

The first is the **knowledge cutoff**. A model trained in year N cannot answer questions about events in year N+1 without external information. Fine-tuning closes the gap but is expensive, slow, and has to be repeated every time the world changes. Retrieval is cheaper: you swap documents in the index without touching weights[^2]. For Acme Support Copilot, this matters daily — every product release, every new billing policy, every changed SSO provider changes the correct answer. Fine-tuning weekly is not a serious proposal; re-embedding new articles nightly is trivial.

The second is **specificity**. Even within the training window, models memorize popular facts and hallucinate rare ones. Private corpora — a company's support tickets, a team's internal wiki, yesterday's product updates — were never seen during pre-training at all. No amount of prompt engineering summons facts that do not exist in the weights. They have to be injected at inference time. The Acme help center is not on the open web; there is no version of GPT-4 or Claude that has read it. Without retrieval, the model is guessing.

The third is **context economics**. Modern context windows reach into the millions of tokens, but longer prompts still cost more, run slower, and degrade in quality as the model spreads attention across irrelevant material[^1][^3]. Packing all 12,000 Acme articles into every request is technically feasible on a long-context model and almost always wrong. Cost scales with the prompt; quality scales with precision.

RAG is the architectural response: store knowledge in a searchable index, retrieve only what the query needs, and splice those passages into the prompt. The model keeps its general reasoning ability, the corpus stays fresh without retraining, and the cost scales with the top-k retrieved rather than the size of the knowledge base. It is the single most deployed pattern in applied LLM systems — not because it is elegant, but because the three constraints above are universal.

The foundational paper is Lewis et al., 2020, which formalized RAG as jointly training a retriever and a generator on open-domain QA[^4]. The production version most teams ship today is simpler — a frozen retriever, a frozen LLM, and a lot of engineering in between — but the architectural insight is the same: retrieve, then generate.

### Anatomy of a minimal RAG request

Before diving deeper, it helps to see the full shape of what a RAG system actually does on one query. For Acme Support Copilot, the minimal flow is:

1. **Ingest (offline).** Split the Acme help articles into chunks. Embed each chunk. Store `(chunk_id, text, embedding, metadata)` in a vector store. Re-run nightly on changed articles.
2. **Retrieve (online).** User types "how do I export invoices for JPY". Embed the query. Optionally, run BM25 in parallel. Retrieve the top-50 candidate chunks.
3. **Re-rank (online).** Score each (query, chunk) pair with a cross-encoder. Keep the top-5.
4. **Augment (online).** Construct a prompt like: "You are Acme Support Copilot. Answer the user's question using ONLY the passages below. Cite sources by passage number. If the passages do not contain the answer, say so. [passages]. User question: [query]."
5. **Generate (online).** Send the prompt to the LLM. Return the answer with citations to the user.

Every section that follows breaks this flow open and looks at the choices inside each step. The production quality of an Acme RAG system comes from the accumulated discipline across steps 1–5, not from any single clever component.

<VectorSearchDemo />

## Embeddings in depth

Before retrieval can rank anything, you need a representation of text that captures meaning. For Acme Support Copilot, when someone types "invoice export fails for JPY," you want their query to land close to the article titled "Currency-specific export errors (JPY, CNY, KRW)" — even though almost no words overlap. That closeness is what embeddings produce.

### What an embedding actually is, geometrically

An embedding is a fixed-dimensional vector — typically 384, 768, 1024, 1536, or 3072 floats — that positions a piece of text in a space where geometric proximity approximates semantic relatedness. "Proximity" is usually measured by **cosine similarity**, the cosine of the angle between two vectors, equal to the dot product divided by the product of their norms[^5].

For normalized vectors (where every embedding has unit length), cosine similarity reduces to plain dot product. That's the reason so many embedding pipelines L2-normalize at indexing time: you pay the normalization cost once and then every similarity calculation becomes a single dot product — fast, cache-friendly, and exactly equivalent to cosine.

Why does this geometry encode meaning? Because the embedding model was trained to make it so. The training objective arranges the space such that sentences that say similar things end up pointing in similar directions. A model that never saw "JPY" and "Japanese Yen" in paired data might place them far apart; one trained on a corpus where they co-occur as synonyms will place them nearby. The geometry is not magic — it is a compression of co-occurrence patterns from training data[^5][^6].

### The training objective: contrastive with negatives

Modern sentence embedding models descend from the **sentence-transformers** lineage, introduced by Reimers and Gurevych (2019) as Sentence-BERT[^7]. The core trick is **contrastive learning**: given a query and a relevant passage, the loss pulls their embeddings together and pushes unrelated passages away.

In pseudocode the training step looks like this:

```python
# For each training example (query, positive_passage):
q_emb = encoder(query)
pos_emb = encoder(positive_passage)

# Negatives: usually other passages in the batch, or explicitly mined hard negatives
neg_embs = [encoder(p) for p in negative_passages]

# Similarity scores
pos_sim = cosine(q_emb, pos_emb)
neg_sims = [cosine(q_emb, n) for n in neg_embs]

# InfoNCE / contrastive loss: softmax over (pos + negs), target = positive
logits = torch.stack([pos_sim] + neg_sims) / temperature
loss = cross_entropy(logits, target_index=0)
```

Three details make or break embedding quality:

1. **Negative mining.** Random negatives are easy to separate — the loss saturates. **Hard negatives** — passages that look topically similar but are actually wrong answers — force the model to learn fine distinctions. DPR (Karpukhin et al., 2020) uses BM25 to mine hard negatives, demonstrating that dual-encoder dense retrieval beats BM25 on open-domain QA only when training data and hard negatives are done right[^8].

2. **Batch size.** In-batch negatives are free — every other query-passage pair in the batch becomes a negative. Bigger batches give you more negatives per step, which is why serious embedding training runs use batches in the thousands.

3. **Paired data.** You need (query, relevant-passage) pairs. Public datasets (MS MARCO, Natural Questions) give general web/QA competence. Domain-specific pairs — for Acme, (ticket-title, resolution-doc) pairs — give domain competence. More on this in "Domain adaptation" below.

### The lineage: Sentence-BERT → SGPT → E5 → Instructor → OpenAI/Cohere

Embedding models have evolved along a fairly legible path:

- **Sentence-BERT (2019).** Bi-encoder BERT fine-tuned on NLI. Established the recipe: encode two sentences independently, pool to a single vector, compare with cosine[^7].
- **MS MARCO bi-encoders (2019-2021).** Trained on passage-retrieval pairs; became the practical baseline for search-oriented embeddings.
- **E5 family (2022, Microsoft).** Weakly supervised pretraining on a massive curated "text pairs" corpus (EmbT5/E5), then fine-tuning on labeled data. Strong general retrieval without task-specific fine-tuning[^6].
- **Instructor (2022).** Instruction-conditioned embeddings — you prepend a task instruction ("represent the query for retrieval") to steer the vector. Same model, different usage for retrieval vs clustering vs classification.
- **OpenAI `text-embedding-3-small` / `-large` (2024).** Closed-source, matryoshka-trained, strong on MTEB, 1536/3072 dimensions with configurable truncation.
- **Cohere Embed v3, Voyage, Jina, Nomic.** Commercial and open competitors, each with their own domain strengths.

The practical takeaway for Acme: start with a strong general model (OpenAI `text-embedding-3-small`, Cohere Embed v3, or open-source BGE/E5), measure on your eval set, and only specialize if the numbers demand it.

### Bi-encoder vs late-interaction (ColBERT) vs cross-encoder

Three architectures encode the query-document relationship differently, and each sits at a different point on the speed/quality curve:

- **Bi-encoder.** Encode query and document independently into one vector each. Compare with cosine. Fast — documents can be pre-embedded and stored in a vector index. This is what "embedding models" usually means. Coarse: per-token semantics collapse into a single pooled vector.
- **Late-interaction (ColBERT).** Encode query and document into many vectors — one per token. At query time, compute max-similarity between each query token and all document tokens, then sum. Preserves fine-grained matches; costs roughly `query_tokens × doc_tokens` comparisons and `doc_tokens × dim` storage per document. Introduced by Khattab and Zaharia (2020)[^9].
- **Cross-encoder.** Encode query and document *together* in one transformer pass, producing a single relevance score. Most accurate, cannot be indexed — you run it at query time for every candidate. Introduced for retrieval re-ranking by Nogueira and Cho (2019)[^10].

The pragmatic stack: bi-encoder for first-pass retrieval at scale (fast, indexable), late-interaction or cross-encoder for precision on the top-k (slow, accurate). Acme Support Copilot would use a bi-encoder over all 12,000 articles, then re-rank the top-50 with a cross-encoder before passing top-5 to the LLM.

### Domain adaptation — usually the highest-leverage move

Off-the-shelf embeddings trained on web text and general QA will underperform on legal, biomedical, code, finance, or narrow technical corpora. "Underperform" here means: the right document is in the corpus, but it is ranked outside the top-10.

Options in order of effort:

1. **Pick a domain-specialized model.** The MTEB leaderboard tracks retrieval performance across many tasks; domain-specific models (BioBERT, CodeBERT derivatives, FinLang) often ship pre-trained for a vertical.
2. **Fine-tune a general model on your corpus.** Generate synthetic (query, passage) pairs with an LLM, mine hard negatives with BM25 or the base model, train with contrastive loss for a few hundred steps. Iusztin and Labonne walk through this explicitly in LLM Engineer's Handbook — it is the single highest-leverage intervention for a production RAG system that feels "almost right"[^2].
3. **Train from scratch.** Rarely worth it outside enormous domain corpora. Skip unless you have both the data and the infrastructure.

For Acme, step 2 is the likely win: generate (question, resolution) pairs from solved tickets, mine negatives from topically similar but wrong-answer tickets, fine-tune for a few epochs on BGE or E5-base. Expect a meaningful bump in recall@10 on the held-out query set.

### Dimensionality — a real cost knob

Dimensionality trades storage and compute for ranking quality. A few reference points:

- **384-dim** (MiniLM, BGE-small): ~1.5 KB per vector at fp32. Cheap to store, fast to search. Within a few points of the larger models on MTEB for most tasks.
- **768-dim** (BERT-base embedding models): ~3 KB per vector. Common middle ground.
- **1024-dim** (BGE-large, E5-large): ~4 KB per vector.
- **1536-dim** (OpenAI `text-embedding-3-small`): ~6 KB per vector.
- **3072-dim** (OpenAI `text-embedding-3-large`): ~12 KB per vector.

For 1 million vectors, the storage cost ranges from ~1.5 GB (384-dim fp32) to ~12 GB (3072-dim fp32). Quantizing to int8 cuts that by 4×; to binary by 32×, with varying recall loss. On high-volume workloads (Acme Support Copilot plans for 50k queries/day), the serving cost difference between 384 and 3072 is real money — sometimes more than the LLM inference cost.

**Matryoshka Representation Learning** changes this calculus. A matryoshka-trained model produces embeddings where the first k dimensions are usable on their own. You can index at 3072, search at 256 for speed, and re-rank the top-100 using the full 3072. OpenAI's `text-embedding-3-*` family supports this via the `dimensions` parameter — useful when you are unsure what dimensionality you actually need.

For Acme: if the corpus is 12k articles plus 40k ticket threads, you are nowhere near a scale where dimensionality dominates. Pick a strong off-the-shelf model, index the full dimension, and revisit only if cost becomes a problem.

## Vector indexes properly

Once every article in the Acme corpus is a vector, you need a data structure that takes a query vector and returns the k nearest neighbors. The brute-force approach is simple: compare the query to every stored vector, sort, and take the top k. That works up to a point. Past that point, you need approximate nearest neighbor (ANN) structures — indexes that trade exactness for speed.

### Flat, IVF, HNSW — when to use which

**Flat index.** Exact O(N) search per query. Correct by construction. Workable up to roughly 100k–1M vectors depending on dimensionality and query budget. For Acme at 52k vectors, flat is entirely viable and worth starting with — you remove an entire layer of complexity (no index parameters to tune, no recall degradation to chase) and keep the door open to graduate later.

**IVF (Inverted File Index).** Partitions vectors into `nlist` clusters via k-means at indexing time. At query time, identify the `nprobe` nearest cluster centroids and search only vectors in those clusters. Trades recall for speed by the ratio `nprobe / nlist`. Simple, memory-efficient, handles updates reasonably well. Good choice for corpora in the 1M–100M range with moderate recall targets.

**HNSW (Hierarchical Navigable Small Worlds).** A multi-layer proximity graph. Each vector is inserted with random level sampling; higher layers are sparser and act as long-range expressways. Queries descend from top to bottom, greedily moving toward the nearest neighbor at each step. Described by Malkov and Yashunin (2016)[^11].

HNSW has three parameters worth understanding:

- **M**: how many neighbors each node connects to (typical: 16–64). Higher M = better recall, more memory, slower builds.
- **efConstruction**: search breadth during insertion (typical: 100–500). Higher = better graph quality, longer indexing.
- **efSearch**: search breadth at query time (typical: 50–500). Higher = better recall, higher query latency.

HNSW dominates most public benchmarks for read-heavy ANN workloads[^12]. Costs: more memory than IVF, painful with frequent deletions (deleted nodes fragment the graph), and rebuilds are non-trivial for hot corpora.

**Decision rule for Acme-scale and beyond:**

| Corpus size | Update pattern | Recommended |
|---|---|---|
| < 1M vectors | Any | Flat, or HNSW if you want one query path |
| 1M–100M | Batch or nightly | HNSW |
| 1M–100M | Frequent updates/deletes | IVF with rebuilds, or hybrid |
| > 100M | Cost-sensitive | IVF-PQ (product quantization) |
| > 100M | Quality-sensitive | HNSW + ANN service (Vespa, Weaviate, Qdrant, pgvector-HNSW) |

Start with what your vector store already does well. pgvector (Postgres) ships HNSW and IVFFlat; Weaviate defaults to HNSW; Qdrant offers HNSW with good deletion handling; Pinecone abstracts the choice entirely. The right index is usually "whatever your existing data platform supports unless the numbers force a migration."

### A tiny HNSW intuition, in pseudocode

For intuition, here is a skeletal HNSW query — not the real implementation, but enough to understand why it is fast:

```python
def hnsw_search(query_vec, graph, entry_point, ef_search, k):
    # Start at the top layer, descend to layer 0
    current = entry_point
    for level in range(graph.max_level, 0, -1):
        # Greedy: at each level, walk to the neighbor closest to query
        while True:
            neighbors = graph.neighbors(current, level)
            closest = min(neighbors, key=lambda n: distance(query_vec, n))
            if distance(query_vec, closest) >= distance(query_vec, current):
                break
            current = closest

    # At layer 0, run a bounded beam search with ef_search candidates
    candidates = [current]
    visited = {current}
    top_k = []
    while candidates:
        c = min(candidates, key=lambda n: distance(query_vec, n))
        candidates.remove(c)
        if len(top_k) >= ef_search and distance(query_vec, c) > worst(top_k):
            break
        for n in graph.neighbors(c, level=0):
            if n not in visited:
                visited.add(n)
                candidates.append(n)
                top_k = keep_top(top_k + [n], ef_search)
    return top_k[:k]
```

The upper layers let you skip 99% of the corpus in log-time; layer 0 does the careful final search. No exact guarantees — the greedy descent can get stuck at local minima — but in practice, recall@10 stays above 95% with modest ef_search.

### k selection — more is not better

How large should k be? The right answer is "as small as possible without hurting downstream quality."

- For Acme with a cross-encoder re-ranker: retrieve top-50 with the bi-encoder, re-rank, pass top-5 to the LLM.
- Without re-ranker: retrieve top-10, pass top-5 after MMR or deduplication.
- For generation: 3–8 passages in the prompt is the sweet spot for most tasks. More than 10 and quality degrades (see "RAG failure taxonomy").

The temptation to crank k up is real — it feels safer to give the model more context. It isn't. Long contexts spread attention, amplify conflicting passages, and increase the chance the model latches onto a plausible-but-wrong distractor[^3]. Tune k by measuring end-to-end task success, not retrieval recall in isolation.

### Query-time expansion and filtering

Vector search plays poorly with metadata filters if you bolt filtering on naively. Pre-filtering (apply metadata filter, then search in the filtered set) is exact but defeats the index. Post-filtering (search, then filter results) is fast but can leave you with zero hits. Good vector stores support *integrated* filtering — the index walks the graph while respecting the filter, maintaining recall without sacrificing speed.

For Acme, metadata matters: `product_area=billing`, `locale=en-US`, `plan_tier=enterprise`. Users (support agents) know these facts about the ticket before they query. Surfacing them as filter pills and passing them to the retriever is worth more than any single-digit ranking improvement.

## Retrieval algorithms

Retrieval splits into two families with different inductive biases, and a hybrid that usually beats both.

**Dense retrieval** represents queries and documents as vectors in a learned embedding space and ranks by cosine similarity (or dot product, when embeddings are unnormalized). The canonical academic reference is DPR, which showed that dual-encoder dense retrieval beats BM25 on open-domain QA when training data exists[^8]. Dense retrieval captures semantic similarity — "car" and "automobile" land near each other — which is exactly what sparse methods miss.

**Sparse retrieval** represents documents as weighted bags of terms. **BM25** is the durable baseline: a probabilistic extension of TF-IDF that weights terms by their frequency in the document, their rarity across the corpus, and a length normalization factor[^13]. It has no training requirement, handles rare tokens (names, codes, identifiers) gracefully, and remains competitive or superior to dense methods when the query contains domain-specific literals the embedding model has not seen[^2].

The BM25 score for a document D given query Q is, roughly:

```text
BM25(D, Q) = sum over terms q in Q of:
    IDF(q) * (f(q, D) * (k1 + 1)) /
             (f(q, D) + k1 * (1 - b + b * |D| / avgdl))
```

where `f(q, D)` is term frequency, `IDF(q)` is inverse document frequency, `|D|` is document length, `avgdl` is average document length, and `k1` and `b` are tuning parameters (typical: k1=1.2–2.0, b=0.75). The math is less important than the behavior: BM25 rewards rare terms and long terms, penalizes long documents, and is unreasonably effective on well-tokenized corpora.

**Hybrid retrieval** runs both and fuses scores — typically via **reciprocal rank fusion (RRF)** — to capture semantic recall from dense and lexical precision from sparse. RRF is almost comically simple:

```python
def reciprocal_rank_fusion(rank_lists, k=60):
    scores = defaultdict(float)
    for ranks in rank_lists:
        for rank, doc_id in enumerate(ranks, start=1):
            scores[doc_id] += 1.0 / (k + rank)
    return sorted(scores.items(), key=lambda x: -x[1])
```

Each document's final score is the sum of `1 / (k + rank)` across rankers. No tuning, no normalization, works well on heterogeneous score distributions. In production, hybrid is the default for most corpora; pure dense retrieval underperforms on queries containing SKUs, error codes, or proper nouns, and pure sparse struggles with paraphrase[^1][^2].

For Acme Support Copilot, hybrid is mandatory. Queries routinely include product names ("SSO v3 handshake"), error codes ("ERR_BILLING_4021"), and proper nouns ("Stripe webhook"). Pure dense retrieval misses these with maddening frequency. BM25 catches them, dense catches paraphrase, RRF merges the results, and the combination beats either in isolation on the eval set.

## Chunking deep

Chunking is where theory meets embarrassment. The field has not settled on a universal strategy. The honest version: chunking interacts with embedding model, retrieval algorithm, and downstream task, and the right answer for your system is found empirically[^2].

To make this concrete, here is a single paragraph from a hypothetical Acme help article:

> "To export invoices in JPY, open the Billing dashboard, select the invoice batch, and choose Export → CSV. Note that JPY export uses the three-letter ISO currency code and does not include decimal places, unlike USD and EUR exports. If you see the error ERR_BILLING_4021, the batch contains mixed-currency invoices and must be split before export. For partial exports, use the API endpoint `/v1/invoices/export` with the `currency_filter` query parameter."

We will chunk this same paragraph four ways.

### Fixed-size chunking

Split by character or token count with a fixed overlap. Cheap, fast, and often the first thing you ship.

For a 256-token window with 20% overlap (≈51 tokens), the paragraph might become:

- **Chunk 1:** "To export invoices in JPY, open the Billing dashboard, select the invoice batch, and choose Export → CSV. Note that JPY export uses the three-letter ISO currency code and does not include decimal places, unlike USD and EUR exports. If you see the error ERR_BILLING_4021, the batch contains mixed-"
- **Chunk 2:** "...does not include decimal places, unlike USD and EUR exports. If you see the error ERR_BILLING_4021, the batch contains mixed-currency invoices and must be split before export. For partial exports, use the API endpoint `/v1/invoices/export` with the `currency_filter` query parameter."

Pros: trivial to implement, no parsing, cheap. Cons: mid-sentence splits ("mixed-"), no respect for structure, the error code and its explanation can land in different chunks.

The overlap math matters. With chunk size C and overlap O:

```text
chunks_per_doc ≈ max(1, ceil((N - O) / (C - O)))
total_chunks ≈ doc_count × chunks_per_doc
storage_cost ≈ total_chunks × dim × bytes_per_dim
```

Overlap of 10–20% is the common starting point. Too little overlap and concepts straddling chunk boundaries get lost. Too much overlap and you inflate the index and pay embedding costs to store the same text multiple times.

### Sentence-based chunking

Split on sentence boundaries, then pack N sentences per chunk. Respects the natural unit of meaning. For the Acme paragraph split at ~2 sentences per chunk:

- **Chunk 1:** "To export invoices in JPY, open the Billing dashboard, select the invoice batch, and choose Export → CSV. Note that JPY export uses the three-letter ISO currency code and does not include decimal places, unlike USD and EUR exports."
- **Chunk 2:** "If you see the error ERR_BILLING_4021, the batch contains mixed-currency invoices and must be split before export. For partial exports, use the API endpoint `/v1/invoices/export` with the `currency_filter` query parameter."

Pros: no mid-sentence splits, better semantic coherence. Cons: sentence boundaries are heuristic (what counts as a sentence in code blocks? in bullet lists?), chunk sizes are variable.

### Semantic chunking

Embed every sentence, compute similarity between adjacent sentences, and split at the points where similarity drops below a threshold — the semantic seams in the document.

For the Acme paragraph, a semantic chunker might produce:

- **Chunk 1 (how-to):** "To export invoices in JPY, open the Billing dashboard, select the invoice batch, and choose Export → CSV. Note that JPY export uses the three-letter ISO currency code and does not include decimal places, unlike USD and EUR exports."
- **Chunk 2 (error-handling):** "If you see the error ERR_BILLING_4021, the batch contains mixed-currency invoices and must be split before export."
- **Chunk 3 (API alternative):** "For partial exports, use the API endpoint `/v1/invoices/export` with the `currency_filter` query parameter."

Pros: chunks align with topic shifts, better retrieval precision. Cons: more expensive to compute (one embedding per sentence), tuning the threshold is fiddly, small sentences can fragment.

### Structure-aware / markdown-aware chunking

For well-formatted corpora — markdown, HTML, confluence, code — use the document's own structure. Split on headers (`##`, `###`), list items, code blocks. Retain the header path as metadata.

For Acme: help articles have `##` sections ("Troubleshooting", "API reference"), ticket threads have explicit customer/agent boundaries, changelog entries are bullet lists. Chunking that respects this structure outperforms fixed-size for the same budget, because retrieval now sees "Troubleshooting > JPY export > ERR_BILLING_4021" as a coherent unit.

### Parent-child chunking (retrieve small, show large)

The chunk you index is often not the chunk you want the LLM to read. A 256-token chunk is precise enough to retrieve on, but the LLM may need the full 1000-token section for context.

The pattern:

1. Chunk each document hierarchically: whole document → sections → paragraphs → sentences.
2. Index the smallest meaningful unit (paragraph or sentence-group).
3. When a chunk matches a query, retrieve its **parent** — the containing section or document — and pass the parent to the LLM.
4. Deduplicate at the parent level so repeated child hits do not produce repeated parent passages.

For Acme: index paragraph-level chunks, retrieve matches, expand to the containing help-article section (or the full article for short articles), deduplicate, and pass to the model. Retrieval precision stays high, generation context stays coherent. This is the single highest-value chunking upgrade in most production RAG stacks.

### Hierarchical retrieval

An extension of parent-child: search at multiple granularities. First retrieve candidate *documents* (using document-level summaries), then within the top documents, retrieve candidate *chunks*. Cuts the search space, concentrates attention on the most relevant articles, and makes citation attribution cleaner.

Useful for Acme when the corpus grows — past 100k documents, two-stage retrieval keeps both latency and quality stable.

### Practical defaults

If you are starting Acme today and have no eval set yet:

- 512-token chunks with 20% overlap
- Sentence-based or markdown-aware, not pure fixed-size
- Parent-child with paragraph children and section parents
- Retain metadata: `doc_id`, `section_path`, `updated_at`, `product_area`
- Revisit after you have 50+ labeled queries

## Retrieval optimization

A naive RAG system retrieves top-k on the raw user query and stops. Everything in this section is how production systems claw back recall and precision they lose at that step.

### Query rewriting and HyDE

**Query rewriting** fixes the mismatch between how users phrase questions and how documents phrase answers. An Acme support agent types "invoice broken for japan" — the canonical article is titled "Currency-specific export errors (JPY, CNY, KRW)." Few terms overlap.

**HyDE** (Hypothetical Document Embeddings), introduced by Gao et al. (2022)[^14], asks the LLM to generate a plausible *answer* to the query, then embeds that answer and searches for real passages similar to it. The generated answer is usually closer in vector space to the target documents than the question itself, because both are in "answer-shaped" text.

The flow:

```python
def hyde_retrieve(query, llm, embedder, vector_index, k=5):
    # 1. Ask the LLM to hallucinate a plausible answer
    hypo = llm.generate(f"Write a short passage answering: {query}")
    # 2. Embed the hypothetical answer (not the query)
    hypo_emb = embedder.embed(hypo)
    # 3. Search real passages with that embedding
    return vector_index.search(hypo_emb, k=k)
```

Trade: one extra LLM call per query, meaningfully higher recall on ambiguous or underspecified queries. For Acme, HyDE helps on vague tickets ("something is wrong with billing") more than on specific ones ("ERR_BILLING_4021").

**Multi-query generation** runs k rewrites in parallel and unions (or RRF-fuses) results. Helpful when the query has multiple valid framings — "cancel subscription" vs "end membership" vs "stop billing" — and you want coverage across them.

### Re-ranking with cross-encoders

Re-ranking with cross-encoders is the single most reliable upgrade to first-pass retrieval[^10]. A cross-encoder takes (query, passage) jointly, scores them with full self-attention, and produces far better ranking than the bi-encoder that retrieved them — at the cost of linear runtime in top-k.

The standard pattern:

```python
def retrieve_then_rerank(query, k_retrieve=50, k_final=5):
    # Stage 1: fast bi-encoder retrieval
    candidates = bi_encoder_index.search(embed(query), k=k_retrieve)
    # Stage 2: cross-encoder scores each (query, candidate) pair
    scores = cross_encoder.predict([(query, c.text) for c in candidates])
    # Stage 3: re-rank by cross-encoder score
    ranked = sorted(zip(candidates, scores), key=lambda x: -x[1])
    return [c for c, _ in ranked[:k_final]]
```

Common cross-encoder choices: BAAI/bge-reranker-base, Cohere Rerank, sentence-transformers/ms-marco-MiniLM. Latency: roughly 50–200 ms for 50 candidates on a modern GPU or cloud rerank API. For Acme at 2-second latency budget, this fits comfortably[^2][^15].

::callout{type="warning"}
**Re-ranking is not optional at scale.** Teams routinely ship bi-encoder-only RAG systems and then blame the LLM when answers are wrong. First-stage retrieval at top-5 is noisy; adding a cross-encoder over top-50 is the cheapest quality gain in the stack.
::

### Maximal Marginal Relevance (MMR) for diversity

Ten near-duplicate passages about the same point are worse than five passages covering different angles. MMR penalizes candidates by similarity to already-selected results:

```text
MMR = argmax over candidates d:
    λ * sim(d, query) - (1 - λ) * max over selected s: sim(d, s)
```

With λ=1, pure relevance. With λ=0, pure diversity. λ=0.7 is a common default. Useful for corpora with heavy topical redundancy — ticket threads are a classic example, where the same resolution may appear in hundreds of near-identical tickets.

### Chunk-to-parent / hierarchical indexing

Covered in the chunking section above, but worth reiterating here: decouple what you search from what you return. Index paragraph-level chunks, return section-level parents. Solves the common failure where a retrieved 256-token chunk lacks the context needed to actually answer the question.

### What actually works in practice versus what is paper-only

Hybrid retrieval + cross-encoder re-ranking + chunk-to-parent is the durable production stack — every one of those interventions is cheap, debuggable, and compounds. Graph RAG, agentic retrieval loops, and learned-to-retrieve pipelines are promising but operationally expensive.

The field disagrees on when graph RAG is worth the complexity over vector + metadata filtering. Microsoft's GraphRAG paper argues for it on global-summary queries over large corpora; skeptics point out that well-tuned hybrid + re-ranking matches graph RAG on most benchmarks at a fraction of the engineering cost[^1]. Default to vector + hybrid + re-ranking; reach for graph structures when your queries genuinely require multi-hop reasoning the simpler stack cannot support.

Qualitatively, these are the interventions that reliably move quality, in rough order of impact:

1. Add hybrid retrieval (BM25 + dense + RRF). Big recall win on literal queries.
2. Add cross-encoder re-ranker. Big precision win everywhere.
3. Add parent-child chunking. Big coherence win for generation.
4. Add domain-adapted embeddings. Big precision win on domain-specific queries.
5. Add HyDE or multi-query. Modest recall win on ambiguous queries.
6. Add MMR. Modest diversity win, mostly invisible to users.

Do (1)–(3) before anything else. Measure. Then decide whether (4)–(6) are worth the complexity.

## RAG failure taxonomy

Most broken RAG systems fail in one of six ways, and the fixes are different for each. Here is the diagnostic playbook.

### 1. Retrieval miss

**Symptom:** User asks a question the corpus can answer; the system says "I don't know" or gives a wrong answer.

**Diagnose:** Construct a labeled eval set of (query, correct-passage-id) pairs. Run the retriever. Compute recall@k. If recall@10 is below ~0.8, you have a retrieval miss problem.

**Fix order of typical impact:**

1. Add hybrid retrieval (BM25 + dense).
2. Add cross-encoder re-ranking.
3. Add query rewriting (HyDE, multi-query).
4. Adjust chunking — larger chunks for rare queries, smaller for specific.
5. Fine-tune the embedder on in-domain pairs.

For Acme: ERR_BILLING_4021 queries were missing the canonical article before hybrid was enabled, because pure dense retrieval placed error-code-heavy articles below paraphrase matches.

### 2. Context stuffing hurting quality

**Symptom:** You retrieved the right passages, but the generation is hedging, wrong, or contradicts itself.

**Diagnose:** Does the answer quality improve when you pass fewer, higher-ranked passages? If yes, you are stuffing.

**Fix:** Reduce k. Pass 3–5 passages instead of 10–20. Add MMR to cut near-duplicates. Re-rank aggressively. Counterintuitive but reliable — more context is not better[^3].

### 3. Stale embeddings

**Symptom:** Documents were updated, but retrieved chunks reflect the old version. Answers drift from current reality.

**Diagnose:** Pick a sample of documents, check `updated_at` on the source vs. indexed chunk. If they diverge by more than your SLA, you have a staleness problem.

**Fix:** Change-data-capture pipeline from source to vector store. Delete and re-insert chunks on document update (not just insert — duplicates are worse than staleness). Monitor with a freshness metric: `time_since_last_reindex` per document. For Acme, nightly reindex of changed articles plus tickets is usually fine; aggressive SLAs require event-driven pipelines.

### 4. Query-document mismatch

**Symptom:** Users phrase questions differently than the corpus phrases answers. Low retrieval scores across the board.

**Diagnose:** Query log analysis. Look at failed queries vs. the true top-1 passage. How far apart are they in vector space?

**Fix:**

- HyDE — embed a hypothetical answer instead of the query.
- Multi-query — try several phrasings, union results.
- Fine-tune the embedder on (user-phrasing, doc-phrasing) pairs if you have them.
- Curate a small FAQ of canonical query/answer pairs, indexed separately and checked first.

### 5. Narrow queries — retrieval works, coverage is wrong

**Symptom:** Question is "compare plan A and plan B"; retrieval returns five chunks about plan A and zero about plan B.

**Diagnose:** Look at retrieved passages. Do they cover all entities in the query?

**Fix:** Query decomposition — break multi-entity queries into sub-queries, retrieve independently, combine. Or explicitly prompt the retriever with per-entity queries in parallel. For Acme, "SSO differences between Okta and Azure AD" needs two retrieval passes, one per provider, then merged.

### 6. Hallucinations despite evidence

**Symptom:** Correct passages in context, but the model ignores them and generates from its prior.

**Diagnose:** Faithfulness evaluation — does the answer's claims trace back to the passages? Tools: RAGAS, TruLens, or simple LLM-as-judge checks.

**Fix:**

- Stronger grounding prompts ("Answer only using the passages. If the passages do not contain the answer, say so.").
- Citation requirements — force the model to quote the source.
- Smaller, more explicit system prompts. Avoid long role-play preambles that the model blends with retrieved content.
- Consider a more instruction-following model — some base models ground harder than others.

::callout{type="warning"}
**A broken answer is rarely the LLM's fault first.** The failure is almost always upstream: retrieval missed the passage, context stuffed it with noise, or embeddings were stale. Debug in order: retrieval → chunking → generation. Inverting this order wastes days.
::

## Agents — the concept

An agent is a loop: the model proposes an action, something external executes the action, the result feeds back into the model's context, and the loop repeats until the model decides it is done. RAG retrieves once and generates. Agents iterate, branch, and call external systems. The difference is not cosmetic — it unlocks tasks that require gathering information dynamically, but it also introduces failure modes that static pipelines do not have[^1].

For Acme Support Copilot, the RAG version answers "how do I export a JPY invoice." An agentic version could: look up the user's account tier, check whether their plan has JPY export enabled, query the billing system for their most recent export attempt, and if it failed, read the error log and summarize the fix. Each of those steps is a *decision* the model makes at runtime based on what it learned in the previous step.

### ReAct — reasoning + acting, with a full trace

The foundational pattern is **ReAct** (Reasoning + Acting), introduced by Yao et al. in 2022[^16]. The loop interleaves explicit reasoning steps with actions and observations. The explicit reasoning trace improves tool selection and reduces hallucinated actions; the interleaving gives the model a way to recover from failed calls.

A complete ReAct trace for a simple Acme query:

```text
User: Why did my JPY invoice export fail? My account ID is acct_789.

Thought: I need to find this user's recent export attempts and check the error.
         I have two tools: search_docs and query_billing_system.

Action: query_billing_system
Action Input: {"account_id": "acct_789", "resource": "invoice_exports", "limit": 5}

Observation: [
  {"id": "exp_443", "currency": "JPY", "status": "failed",
   "error": "ERR_BILLING_4021", "timestamp": "2026-04-16T14:22:00Z"},
  {"id": "exp_442", "currency": "USD", "status": "succeeded", ...}
]

Thought: Their most recent export failed with ERR_BILLING_4021.
         I should look up what that error means in the docs.

Action: search_docs
Action Input: {"query": "ERR_BILLING_4021 JPY export"}

Observation: "Error ERR_BILLING_4021 occurs when an export batch contains
              mixed-currency invoices. The batch must be split by currency
              before export. See /help/mixed-currency-exports."

Thought: I have what I need. The export failed because the batch contained
         mixed currencies. The user needs to split the batch by currency.

Final Answer: Your JPY export (exp_443) failed with ERR_BILLING_4021, which
means the batch contained invoices in more than one currency. Split the batch
so all invoices are JPY, then retry. Reference: /help/mixed-currency-exports.
```

Four things to notice:

1. **The thought is not decoration.** It shapes which tool the model selects next. Without the "I need to find this user's recent exports" line, the model might have searched docs first and missed the account-specific context.
2. **The observation is structured.** JSON back from the tool, not free text. The model can parse it reliably.
3. **The loop terminates deliberately.** The model emits "Final Answer" when it has enough information — not when it runs out of tokens.
4. **The trace is debuggable.** Every step is logged and re-readable. When the agent gets it wrong, you can see where.

ReAct is not the only agent pattern, but it is the simplest one that works, and most production agents are ReAct variants with better tool schemas, structured output, and step budgets.

### Tool schemas as a contract

Tools are how the agent interacts with the world. Good tools have clear, narrow, stable contracts. Bad tools are vague, overlapping, or have surprising side effects.

A clean tool schema for Acme:

```json
{
  "name": "query_billing_system",
  "description": "Look up billing records for a specific account. Returns recent invoice exports, subscription status, or billing errors. Use when the user's question references their account or a specific billing event.",
  "parameters": {
    "type": "object",
    "properties": {
      "account_id": {
        "type": "string",
        "description": "The acct_* identifier. Required."
      },
      "resource": {
        "type": "string",
        "enum": ["invoice_exports", "subscriptions", "billing_errors"],
        "description": "Which resource to query."
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 50,
        "default": 10
      }
    },
    "required": ["account_id", "resource"]
  }
}
```

The description is the part that actually drives selection — the model reads it and decides "is this the right tool for what I need?" If two tools have overlapping descriptions, expect the model to mix them up.

**Tool design rules for Acme and everywhere else:**

- Narrow inputs — prefer `enum` over free-form strings where possible.
- Deterministic outputs — same inputs give the same shape of result.
- Idempotent by default — calling twice should not double-charge, double-email, or double-ticket.
- Side effects gated — writes require explicit confirmation or a separate `confirm=True` flag.
- Error messages actionable — "account not found" is better than "error", and "account not found; check the acct_ prefix" is better still.

**Early tool-use work.** Toolformer (Schick et al., 2023) showed models could learn to call external APIs with self-supervised training, teaching the model to predict when and how to call which tool from very few demonstrations[^17]. Modern foundation models treat tools as first-class through structured function-calling interfaces (OpenAI's `tools` API, Anthropic's `tool_use` blocks) — the mechanism is different, but the lesson stands: the model is only as useful as its tool set is well-designed.

### Planning vs reactive loops

ReAct is a *reactive* loop — at each step, the model decides what to do next based on the current observation. This works for tasks up to maybe 5–10 steps. Past that, it drifts.

**Planning** extends the loop: before acting, the model produces an explicit plan ("1. Look up account. 2. Check recent exports. 3. If failure, look up error. 4. Summarize fix."), then executes step by step. Plan-and-execute architectures, plan-then-solve, and similar variants are all flavors of the same idea.

Planning helps on hard, multi-step tasks by reducing wasted tool calls on branch exploration. It hurts on easy tasks by adding latency and opportunities to derail. For Acme, planning is overkill for the common case ("one tool call, one search, done"); it earns its keep on complex tickets that span billing, support history, and product configuration.

### Reflection — re-reading your own work

**Reflection** re-reads prior actions and results to notice mistakes. "I searched for X and got nothing; maybe X is the wrong term — let me try Y." Reflexion (Shinn et al., 2023) formalized this as self-evaluation after each attempt, with reflections stored in memory for next time.

Reflection is easier to describe than to ship reliably. It adds latency and an extra LLM call per step. It tends to help on hard tasks where silent failure is expensive; it tends to hurt on easy tasks where the first answer is already correct. For Acme, reflection on low-confidence answers (below some threshold) before returning them to the agent is worth it; reflection on every answer is not[^1][^3].

### The basic agent loop, fully instrumented

Here is the skeletal loop that sits underneath almost every production agent. It exists to be read and modified, not to be used verbatim.

```python
def run_agent(query, tools, model, max_steps=10, max_tokens_per_step=4000):
    messages = [
        {"role": "system", "content": system_prompt(tools)},
        {"role": "user", "content": query},
    ]
    trace = []

    for step in range(max_steps):
        # 1. Ask the model what to do next
        response = model.chat(
            messages=messages,
            tools=tool_schemas(tools),
            max_tokens=max_tokens_per_step,
        )
        trace.append({"step": step, "response": response})

        # 2. If the model produced a final answer, we're done
        if response.stop_reason == "end_turn":
            return {"answer": response.text, "trace": trace}

        # 3. Otherwise it asked to use a tool — validate, execute, append result
        for tool_call in response.tool_calls:
            if not validate_schema(tool_call, tools):
                observation = {"error": f"Invalid tool call: {reason}"}
            else:
                try:
                    observation = tools[tool_call.name](**tool_call.args)
                except Exception as e:
                    observation = {"error": str(e)}

            messages.append({"role": "assistant", "content": response.raw})
            messages.append({
                "role": "tool",
                "tool_use_id": tool_call.id,
                "content": compact(observation),
            })

    # 4. Hit the step budget — return what we have
    return {"answer": None, "trace": trace, "status": "step_budget_exceeded"}
```

Four pieces of discipline are non-negotiable in this loop:

1. **`max_steps` is set before any code.** Not a safety net bolted on later — the loop cannot exist without it.
2. **Every tool call is schema-validated before execution.** Invalid calls become observations, not crashes; the model can correct on the next turn.
3. **Tool failures become observations too.** A `try/except` wraps execution so an exception from the billing API surfaces to the model as a readable error, not an unhandled traceback that kills the session.
4. **The full trace is retained.** Every step — model response, tool call, observation — is logged for offline analysis. Agents that do not log their trajectories cannot be debugged.

### Agents in practice: open source and closed frameworks

You rarely write this loop from scratch in production. The ecosystem has converged on a handful of frameworks that give you sensible defaults for the hard parts (retries, streaming, observability, memory). As of 2026:

- **LangChain / LangGraph.** The original Python framework, now split: LangChain for the building blocks, LangGraph for stateful agent graphs. Flexible, widely adopted, sometimes over-abstracted.
- **LlamaIndex.** RAG-first, strong on data ingestion and hybrid retrieval; increasingly capable for agentic retrieval patterns.
- **Haystack.** Pipeline-oriented, strong retrieval primitives, less trendy but stable.
- **DSPy.** Stanford's programming-not-prompting framework. Treats prompts as compilable programs that can be optimized with labeled data.
- **OpenAI Assistants API, Anthropic's tool use, Google's function calling.** First-party agent primitives. Less flexible than frameworks, but stable and maintained. For Acme with a small team, starting here and graduating to a framework when you hit limits is often the right path.

The framework choice matters less than the discipline inside the loop. A well-instrumented bare-metal agent beats a sloppy LangGraph agent every time.

Agents differ from pipelines in a structural way: a pipeline has a fixed graph, an agent has a graph chosen at runtime by the model. That flexibility is the point, and it is also the source of every problem in the next section.

<AgentLoopStepper />

## Agent failure taxonomy

Agents fail in patterned ways. Here is the diagnostic playbook.

### 1. Infinite loops

**Symptom:** Agent calls a tool, gets a result it does not understand, calls the same tool again with a slight variation, and repeats forever.

**Diagnose:** Log every (thought, action, action_input) tuple. If you see the same action repeated with near-identical inputs, you are looping.

**Fix:**

- Hard step budget (`max_steps=10`). Return a graceful "I couldn't complete this" instead of crashing.
- Action-history deduplication — if the same action was called with equivalent inputs in this session, warn or abort.
- "You have already tried X, consider Y" prompting on loop detection.
- Better observations — if the tool returns errors, the error message should tell the model what to do differently.

### 2. Wrong-tool selection

**Symptom:** Agent picks `search_docs` when it should have picked `query_billing_system`, or vice versa. With a large tool catalog, this compounds.

**Diagnose:** Compare the agent's chosen tool against what a human would have chosen on a labeled set. Where are the disagreements?

**Fix:**

- Shrink the tool set. 5 well-described tools beat 20 overlapping ones.
- Improve descriptions. Make it obvious from the description alone when to use each tool.
- Scope per task — give the agent only the tools relevant to the current query category.
- Tool retrieval — for very large tool catalogs (100+), retrieve the top-k relevant tools before the model sees them, based on query similarity to tool descriptions.

### 3. Context window exhaustion

**Symptom:** Long-running agents work fine for the first 5 steps, then start hallucinating or forgetting what they already tried.

**Diagnose:** Measure prompt length at each step. If it grows linearly and you pass some threshold (80% of window), quality will degrade even on long-context models.

**Fix:**

- **Observation summarization** — condense tool outputs before feeding them back into context. A 2000-token billing response becomes a 200-token summary.
- **Explicit context compaction** every N steps — summarize the conversation so far, replace the turn-by-turn history with the summary plus the last few steps verbatim.
- **Separate working memory from long-term context** — keep the tool schemas and the original query in every turn, but recycle intermediate steps.
- **Smaller, denser tool outputs** — design tools to return structured summaries, not raw dumps.

### 4. Hallucinated tool calls

**Symptom:** The model emits a call with wrong arguments, missing required fields, or fabricated IDs (like `acct_42` when the user never mentioned one).

**Diagnose:** Validation failures at the tool boundary. Count how often tool calls are rejected by schema validation.

**Fix:**

- **Strict schema validation at the tool boundary.** Reject invalid calls immediately with a clear error, feed the error back as an observation.
- **Structured output modes.** Use the model's native tool-calling API, not "parse JSON out of free text."
- **Clear error messages.** "Field 'account_id' is required and must start with 'acct_'. You provided '42'." The model reads this and corrects.
- **Constrain with available values.** If the user's account ID is known, pass it into the prompt so the model does not have to guess.

### 5. Undertrained tool-use

**Symptom:** The model is strong at language but weak at calling tools — misses required parameters, ignores available tools, tries to answer from memory.

**Diagnose:** Does the model call tools at all? What fraction of queries result in a tool call versus a direct answer?

**Fix:**

- Pick a model with better tool-use training. Frontier models from OpenAI, Anthropic, and Google are trained explicitly on tool-use traces; smaller or older models are not.
- Few-shot examples in the prompt — show 2–3 full ReAct traces in the system prompt before the user query.
- For open-source models, consider instruction-tuned variants (Hermes, Functionary, Mistral with tool-use fine-tuning) over base models.

### 6. Evaluation difficulty — the hardest failure mode

Agents have non-deterministic trajectories, so the same task can succeed one run and fail the next without any code change. End-to-end task success is the cleanest metric; per-step evaluation requires tracing infrastructure. The field has not converged on a standard; expect to build your own[^3]. More on this in the evaluation section below.

::callout{type="warning"}
**Always cap agent steps.** An uncapped agent loop can burn through a model's rate limit or a tool's quota in minutes. Set `max_steps` before the first line of loop code, not after the first incident.
::

<ToolTracer />

## Memory for agents

Agents without memory start from scratch every turn. That is fine for one-shot tasks; it is a disaster for multi-turn support conversations where the agent needs to remember what the user already said.

There are three levels of memory to reason about.

### Short-term memory: the conversation window

The simplest form: include the prior turns of the conversation in every prompt. Straightforward until the window fills up.

**Sliding window.** Keep the last N turns verbatim, drop older ones. Cheap, no LLM calls, works for short conversations. Fails when the first turn contains the key information and the sliding window has forgotten it.

**Summarization.** Periodically compress older turns into a summary, keep recent turns verbatim. Preserves the gist of older context at the cost of detail. Risky if the summary drops a crucial fact.

**Hybrid (most common).** Keep the system prompt + tool schemas + a running summary + the last K turns verbatim. Rebuild the summary every N turns. Budget: the summary grows but grows slowly; the verbatim tail stays bounded.

For Acme, where support conversations average 3–5 turns, sliding window alone is fine. Longer investigative sessions (an engineer debugging a customer issue with the bot's help) need hybrid.

### Long-term memory: across sessions

Persistent memory that survives across separate conversations. The user mentions their product in session 1; session 2 remembers it without being told.

**Vector memory.** Store past conversation turns (or summaries of them) as embeddings in a vector index keyed by user or session. On each new turn, retrieve the top-k most relevant past memories and inject into the prompt. Effectively RAG over the user's own history.

**Structured memory.** Key-value facts explicitly extracted from prior conversations: `{user.name: "Alice", preferred_currency: "JPY", escalation_threshold: "immediate"}`. Updated by a separate extraction step, read directly from the prompt. More reliable than vector memory for specific facts; weaker for conversational nuance.

**Hybrid.** Both — vector memory for episodic recall, structured memory for reliable key facts.

For Acme internal agents, long-term memory is modest: remember which products and features this agent has worked with recently so retrieval can scope accordingly. For consumer-facing agents, long-term memory raises serious privacy and retention questions. Design accordingly.

### Tool-result caching

A pragmatic form of memory specifically for expensive or slow tool calls. If the agent asks `query_billing_system` for the same account twice in a single session, cache the result. If it asks `search_docs` for the same query twice, cache. Saves latency, saves cost, and reduces the chance of the agent re-querying in a loop.

Keys: `(tool_name, canonicalized_args)`. TTL: short enough that stale data does not mislead (minutes for billing, hours for docs). Scope: per-session by default, per-user for longer TTLs.

For Acme, tool-result caching is the quickest memory win. No LLM involvement, straightforward cache eviction, immediate latency improvement on any session that touches the same resource twice.

### A note on memory as a moat

Memory is where agent systems start to feel like products rather than demos. A stateless RAG bot is a clever autocomplete. A bot that remembers what you already tried, what your preferences are, and what worked last time becomes genuinely useful over a sustained relationship.

The honest tradeoff: memory is both the highest-leverage feature and the source of the subtlest failure modes. A memory that remembers wrong is worse than no memory. Summarization drops the detail that mattered. Vector memory retrieves the wrong episode and confuses the model. Structured memory gets out of sync with source-of-truth systems.

For Acme: start with the conversation window. Add tool-result caching when latency complaints surface. Add structured memory (user account, product tier, known issues) when the same information keeps being re-derived. Add vector memory last, and only if conversations are long enough and recurrent enough that episodic recall pays for the engineering.

::callout{type="warning"}
**Every memory layer needs an invalidation strategy.** Cached tool results go stale. User preferences change. Summaries drift from the original context. A memory system without explicit TTLs, reset paths, and audit trails becomes a source of confidently wrong answers that are harder to debug than missing context.
::

## When RAG vs when agents vs when both

The decision comes down to three questions. Answer them in order.

### Question 1: Does the task require dynamic information gathering?

If the model can answer from a fixed set of retrieved passages — "what is plan A", "how do I export invoices", "what does ERR_BILLING_4021 mean" — you want **RAG**. One retrieval, one generation. Stable graph, predictable cost, easy to evaluate. Ship RAG when you need factual answers over specific material[^1].

If the task requires multiple rounds of gathering, where each round depends on the previous — "find this user's recent failed exports, then look up the error for each, then summarize" — you need **agents**. The graph is built at runtime based on what the model learns step by step.

### Question 2: Does the task require action?

Actions have side effects: writing a database, sending an email, creating a ticket, refunding a charge. Pure RAG never takes actions — it answers questions about a corpus. Agents can take actions because they can call tools.

If the task is "answer a question", RAG. If the task is "do a thing", agents. If the task is "answer a question that requires doing several things first", agents.

### Question 3: What is the cost and risk budget?

Agents are 5–20× more expensive per user interaction than RAG (multiple LLM calls, multiple tool invocations, longer traces) and much harder to evaluate. Agents can fail unboundedly — a looping agent burns tokens fast. RAG has a predictable cost ceiling per query; agents do not, without explicit guardrails.

If the task can be done with RAG, do it with RAG. The failure mode of the field right now is over-agenticizing tasks that are one-shot retrieval in disguise.

### The decision tree

```text
Start
  |
  +-- Does the task require actions (writes, side effects)?
  |     |
  |     +-- Yes --> AGENT
  |     +-- No --> continue
  |
  +-- Does the task require multi-hop reasoning over external systems?
  |     |
  |     +-- Yes --> AGENT (or AGENTIC RAG)
  |     +-- No --> continue
  |
  +-- Is the answer in a stable corpus?
  |     |
  |     +-- Yes --> RAG
  |     +-- No --> AGENT (or escalate to human)
```

Walk the tree with real Acme queries:

- *"What does ERR_BILLING_4021 mean?"* → No actions needed. No multi-hop. Answer is in the help corpus. **RAG.**
- *"Compare SSO enforcement on Okta vs Azure AD for enterprise plans"* → No actions. Multi-hop (two providers, one plan tier). Each hop is still a corpus lookup. **RAG with query decomposition**, not full agent.
- *"Why did this specific user's recent JPY export fail?"* → No write actions, but needs lookup in billing system *then* docs. **Agentic RAG.**
- *"Process this refund for the customer."* → Write action. **Full agent** with approval gate.
- *"Our docs say to enable JPY but the product doesn't support it — is this a doc bug?"* → Ambiguous. Probably escalate to a human, because the source of truth is contested.

### Three concrete patterns

**Pure RAG (Acme v1).** "How do I export JPY invoices?" → retrieve top-5 articles → generate answer with citations. One LLM call. Predictable. 90% of Acme queries fit here.

**Agentic RAG (Acme v2).** "Why did my JPY invoice export fail?" → agent decides: look up this user's recent exports, then look up the error code in docs, then summarize. Retrieval is one of several tools the agent has. 8% of Acme queries benefit from this pattern.

**Full agent (Acme v3).** "My customer needs a refund for their failed JPY invoices — can you handle it?" → agent checks permissions, looks up invoices, verifies refund eligibility, initiates refund, logs the action, drafts a customer-facing summary. Multiple side effects. Strict approval gates required. 2% of Acme queries, 50% of the engineering complexity.

These tiers map to familiar product stages. V1 is what you ship in a week to prove the corpus has answers. V2 is what you ship in a month to handle real support traffic. V3 is what you spend a quarter on once the first two are stable, and you treat it as a contained product with its own approval flows, audit logs, and rollback paths. Trying to ship V3 before V1 works is the single most common way teams waste two quarters.

Start with pure RAG. Graduate to agentic RAG when users have to phrase queries unnaturally, when follow-ups fail, or when the task legitimately requires multi-hop work. Skip straight to full agents only when the task is fundamentally about actions, not answers.

::callout{type="warning"}
**Do not build an agent when RAG would do.** Agents are expensive, hard to evaluate, and more prone to unbounded failure. Over-agenticizing one-shot retrieval is the most common design mistake in this space.
::

## Evaluation for RAG and agents

Retrieval quality and agent reliability are both evaluation problems before they are architecture problems. You cannot improve what you cannot measure, and in LLM systems you need to measure both *components* and the *end-to-end* experience — because either can fail in ways the other hides.

### Retrieval metrics

The retrieval stage is measurable the traditional IR way. Given a labeled eval set — (query, list of relevant document IDs) — you can compute:

- **Recall@k.** Of the relevant documents, what fraction appear in the top-k retrieved? The most important metric for retrieval. If recall@10 is below 0.8, nothing downstream will save you.
- **Mean Reciprocal Rank (MRR).** Average of `1 / rank_of_first_relevant` across queries. Rewards retrievers that put the right answer high; penalizes retrievers that scatter relevant docs across the tail.
- **Normalized Discounted Cumulative Gain (nDCG@k).** Generalizes MRR to graded relevance (some docs are "very relevant", others "somewhat relevant"). Useful when you have multi-level labels, often overkill when you only have binary relevance.
- **Precision@k.** Of the top-k retrieved, what fraction are relevant? Less useful in RAG where k is small and noise from irrelevant passages is the real cost.

For Acme, the eval set is built by sampling real user queries, having support engineers label which Acme articles actually answer each one, and running the retriever against this set on every change. Recall@10 is the headline number. MRR is the secondary number. nDCG is for the eval team to brag about.

### Generation metrics

Retrieval is correct is necessary but not sufficient. The model has to actually use the retrieved content — faithfully, relevantly, helpfully. These metrics are harder to automate and noisier to measure.

- **Faithfulness / groundedness.** Do the claims in the answer trace back to the retrieved passages? Or did the model make things up? Measured by LLM-as-judge or tools like RAGAS and TruLens. This is the single most important generation metric for RAG — hallucinations despite evidence kill user trust faster than any other failure.
- **Answer relevance.** Does the answer actually address the question? Separate from faithfulness — a grounded answer to the wrong question is still wrong.
- **Context relevance.** Are the retrieved passages actually useful for answering this query? Measurable by asking "does this passage contain information relevant to the query?" across each retrieved passage.
- **Helpfulness.** Does the answer help the user complete their task? The hardest to measure automatically, most accurately measured by user behavior (did they escalate? did they return to the docs? did they click a citation?).

For Acme, the live-fire metric is "did the support agent escalate to engineering?" — a proxy for bot failure that correlates with every subcomponent metric above.

### Component eval vs end-to-end eval

Both are necessary. Use component eval to debug; use end-to-end eval to decide.

- **Component eval.** Retrieval in isolation (recall@k on labeled pairs). Generation in isolation (grounded? relevant?). Re-ranker in isolation (top-5 precision before and after). Tells you which part is broken.
- **End-to-end eval.** The full user-facing flow: query in, final answer out, measured for overall quality. Tells you whether the system is shipping the right answer.

The mistake teams make: they optimize one component metric and the end-to-end experience gets worse. Cranking k up improves recall@k but hurts answer quality through context stuffing. Adding a second re-ranking pass improves ranking precision but blows the latency budget and users switch off the feature. Always sanity-check component improvements against end-to-end quality before celebrating.

### Agent evaluation

Agents make this harder. They have non-deterministic trajectories, multi-step traces, and tool calls with external dependencies. A handful of metrics help:

- **Task success rate.** For a fixed set of tasks with known correct outcomes, what fraction does the agent complete correctly? The cleanest top-line metric. Requires labeled outcomes, which are expensive to produce.
- **Steps to completion.** How many agent steps did it take? Shorter is better, assuming quality is held constant. Blow-ups here indicate looping or planning failures.
- **Tool call precision.** For a labeled set of (query, correct-tool, correct-args), what fraction does the agent call correctly?
- **Trajectory plausibility.** Even when the final answer is correct, is the path sensible? LLM-as-judge works here, but noisily.

For Acme agents, the target is end-to-end task success on a frozen eval set of ~50–100 labeled tickets. Every change — new tool, new prompt, new model — is evaluated against the set. Regressions gate the rollout.

### Tooling

- **RAGAS.** Python library for RAG evaluation. Computes faithfulness, answer relevance, context relevance. LLM-as-judge under the hood.
- **TruLens.** Observability + evaluation framework. Traces calls, computes feedback functions, supports human and LLM judging.
- **LangSmith, Phoenix, Braintrust.** Commercial tracing and evaluation platforms. Good for production observability, less essential for offline eval.
- **Custom LLM-as-judge.** Sometimes the simplest approach — write a clear judging prompt, run it against eval outputs, aggregate scores. Cheap, flexible, requires calibration against human labels.

The meta-lesson: evaluation infrastructure is not a phase you do at the end. It is infrastructure you build alongside the system. Every iteration needs a number to move or break.

### Building an eval set without overcomplicating it

For Acme, the first eval set should take a day, not a quarter. The shape that works:

1. **Sample 100 real queries** from the support-bot query log, across product areas and query types.
2. **Have 2 support engineers label each query** with (a) the correct answer in plain text, and (b) the IDs of the Acme articles that should be retrieved to produce that answer.
3. **Disagreements are data** — where engineers disagree on the right article, write a short note on why. These are the ambiguous queries where the system will struggle too.
4. **Freeze the set.** Do not edit labels after the fact to make numbers look better. If labels are wrong, version the eval set and note why.
5. **Run the set on every change.** Retrieval score and generation quality both. A regression on either gates the rollout.

A 100-query eval set gives you enough signal to distinguish real changes from noise without drowning in labeling work. Scale it later if you need more granularity, but start here.

### LLM-as-judge, calibrated

Automated judging with an LLM is the scalable option for generation metrics, but it is noisy unless you calibrate it:

- **Write the judging prompt with the same discipline as a production prompt.** Clear criteria, examples, explicit rubric.
- **Run the judge against a human-labeled subset** first. If the judge disagrees with humans more than 20% of the time, the judge is not calibrated yet — fix the rubric.
- **Prefer comparative judging over absolute scores.** "Which answer is better, A or B?" is more reliable than "Score A from 0 to 10." Humans and LLMs both.
- **Separate judges per metric.** One judge for faithfulness, one for relevance, one for helpfulness. Shared judges conflate failure modes.

For Acme, an LLM-as-judge for faithfulness — "do the claims in this answer trace to these passages? return yes / partial / no" — is a high-leverage automated signal. Calibrated against 50 human labels, it costs pennies per eval run and catches hallucinations that would otherwise slip through.

## What's next

You now have the vocabulary and the patterns to reason about both RAG and agents, with a worked example — Acme Support Copilot — that grounds every abstraction in something shippable. The next topic, **Production**, covers the reliability engineering that turns a working demo into a system that stays working: caching strategies, fallback models, cost control, monitoring and observability, rate limiting, and the operational surface area that RAG and agents introduce when they meet real traffic.

The topic after that, **Evaluation**, expands the last section above into a full methodology — how to build eval sets, how to calibrate LLM-as-judge, how to do human eval cheaply, how to decide when a regression is real versus noise. Both are less glamorous than embedding models and agent loops, and both are what separate systems that work in production from systems that work in demos.

## Sources

[^1]: Huyen, *AI Engineering*, Ch. 6.
[^2]: Iusztin & Labonne, *LLM Engineer's Handbook*, RAG and retrieval chapters.
[^3]: Bouchard, *Building LLMs for Production*, RAG and agents chapters.
[^4]: Lewis et al., 2020. "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks." *NeurIPS*.
[^5]: Alammar & Grootendorst, *Hands-On Large Language Models*, retrieval and embeddings chapters.
[^6]: Wang et al., 2022. "Text Embeddings by Weakly-Supervised Contrastive Pre-training" (E5). arXiv:2212.03533.
[^7]: Reimers & Gurevych, 2019. "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks." *EMNLP*.
[^8]: Karpukhin et al., 2020. "Dense Passage Retrieval for Open-Domain Question Answering." *EMNLP*.
[^9]: Khattab & Zaharia, 2020. "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT." *SIGIR*.
[^10]: Nogueira & Cho, 2019. "Passage Re-ranking with BERT." arXiv:1901.04085.
[^11]: Malkov & Yashunin, 2016. "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs." arXiv:1603.09320.
[^12]: Alammar & Grootendorst, *Hands-On Large Language Models*, semantic search chapter.
[^13]: Robertson & Zaragoza, 2009. "The Probabilistic Relevance Framework: BM25 and Beyond." *Foundations and Trends in Information Retrieval*.
[^14]: Gao et al., 2022. "Precise Zero-Shot Dense Retrieval without Relevance Labels" (HyDE). arXiv:2212.10496.
[^15]: Iusztin & Labonne, *LLM Engineer's Handbook*, re-ranking and production RAG chapters.
[^16]: Yao et al., 2022. "ReAct: Synergizing Reasoning and Acting in Language Models." arXiv:2210.03629.
[^17]: Schick et al., 2023. "Toolformer: Language Models Can Teach Themselves to Use Tools." arXiv:2302.04761.

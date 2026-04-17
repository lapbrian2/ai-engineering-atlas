---
id: rag-agents
order: 04
title: RAG & Agents
subtitle: Embeddings, retrieval, tool-use, agent planning — the foundations of applied LLM systems
topic: rag-agents
difficulty: intermediate
estimatedReadMinutes: 13
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

## The problem RAG solves

A language model is a frozen snapshot of its training distribution. Three hard constraints follow from that fact, and retrieval-augmented generation exists because of each of them [note: Huyen AIE Ch. 6].

The first is the knowledge cutoff. A model trained in year N cannot answer questions about events in year N+1 without external information. Fine-tuning closes the gap but is expensive, slow, and has to be repeated every time the world changes. Retrieval is cheaper: you swap documents in the index without touching weights [note: Iusztin/Labonne LLM Engineer's Handbook].

The second is specificity. Even within the training window, models memorize popular facts and hallucinate rare ones. Private corpora — a company's support tickets, a team's internal wiki, yesterday's product updates — were never seen during pre-training at all. No amount of prompt engineering summons facts that do not exist in the weights. They have to be injected at inference time.

The third is context economics. Modern context windows reach into the millions of tokens, but longer prompts still cost more, run slower, and degrade in quality as the model spreads attention across irrelevant material. Packing an entire corpus into every request is feasible and almost always wrong [note: Huyen AIE Ch. 6; Bouchard Building LLMs for Production].

RAG is the architectural response: store knowledge in a searchable index, retrieve only what the query needs, and splice those passages into the prompt. The model keeps its general reasoning ability, the corpus stays fresh without retraining, and the cost scales with the top-k retrieved rather than the size of the knowledge base. It is the single most deployed pattern in applied LLM systems — not because it is elegant, but because the three constraints above are universal.

<VectorSearchDemo />

## Retrieval algorithms

Retrieval splits into two families with different inductive biases, and a hybrid that usually beats both.

**Dense retrieval** represents queries and documents as vectors in a learned embedding space and ranks by cosine similarity (or dot product, when embeddings are unnormalized). The canonical academic reference is DPR (Karpukhin et al., 2020), which showed that dual-encoder dense retrieval beats BM25 on open-domain QA when training data exists [note: Karpukhin et al. 2020, DPR]. Dense retrieval captures semantic similarity — "car" and "automobile" land near each other — which is exactly what sparse methods miss.

**Sparse retrieval** represents documents as weighted bags of terms. BM25 is the durable baseline: a probabilistic extension of TF-IDF that weights terms by their frequency in the document, their rarity across the corpus, and a length normalization factor [note: Robertson & Zaragoza, "The Probabilistic Relevance Framework"]. It has no training requirement, handles rare tokens (names, codes, identifiers) gracefully, and remains competitive or superior to dense methods when the query contains domain-specific literals the embedding model has not seen [note: Iusztin/Labonne].

**Hybrid retrieval** runs both and fuses scores — typically via reciprocal rank fusion (RRF) — to capture semantic recall from dense and lexical precision from sparse. In production, hybrid is the default for most corpora; pure dense retrieval underperforms on queries containing SKUs, error codes, or proper nouns, and pure sparse struggles with paraphrase [note: Huyen AIE Ch. 6; Iusztin/Labonne].

**Index structures** trade accuracy for speed at scale. A **flat** index computes exact similarity against every vector — O(N) per query, correct by construction, workable up to roughly a million vectors. **IVF** (inverted file) partitions vectors into clusters, searches only the nearest `nprobe` clusters, and trades recall for latency. **HNSW** (hierarchical navigable small worlds) builds a multi-layer proximity graph and navigates greedily; it dominates most benchmarks for read-heavy workloads but costs more memory and rebuilds poorly under frequent updates [note: Hands-On Large Language Models, retrieval chapters]. Pick based on corpus size and update pattern, not on what is fashionable.

**Chunking** is where theory meets embarrassment. The field has not settled on a universal chunk size. Common starting points are 256–512 tokens with 10–20% overlap, but the right answer depends on document structure, embedding model context length, and the granularity of questions. Iusztin and Labonne emphasize that chunking strategy interacts with the downstream application — Q&A over technical docs wants smaller, structure-aware chunks; summarization wants larger ones [note: Iusztin/Labonne]. The honest version: tune it empirically on your eval set.

## Embeddings in depth

An embedding is a fixed-dimensional vector that positions a piece of text in a space where geometric proximity approximates semantic relatedness. For retrieval, the useful question is not "what is an embedding" but "how was this one trained, and what does that training make it good at" [note: Hands-On Large Language Models].

Modern sentence embedding models descend from the **sentence-transformers** lineage — bi-encoders trained with contrastive objectives on paired data. Given a query and a relevant passage, the loss pulls their embeddings together and pushes unrelated passages away. The training data determines the model's inductive bias: a model trained on MS MARCO Q&A pairs will be strong on question-answer similarity; one trained on code pairs will be strong on code similarity; one trained on multilingual pairs will handle cross-language retrieval. General-purpose models trade depth for breadth [note: Hands-On LLMs; Iusztin/Labonne].

**Sentence-level vs token-level.** Bi-encoders produce a single pooled vector per passage — fast to index, fast to search, coarse per-token semantics collapsed. **Late-interaction** models like ColBERT keep per-token vectors and score at query time, preserving finer-grained matches at the cost of index size and query latency. The pragmatic split: bi-encoder for first-pass retrieval at scale, late-interaction or cross-encoder for precision on the top-k [note: Huyen AIE Ch. 6].

**Domain adaptation** matters more than most teams expect. Off-the-shelf embeddings trained on web text underperform on legal, biomedical, code, or narrow technical corpora. Options in order of effort: (1) pick a domain-specialized model from the Hugging Face leaderboards, (2) fine-tune a general model on your corpus with contrastive pairs you generate or label, (3) train from scratch (rarely worth it). Iusztin and Labonne walk through (2) explicitly — it is the highest-leverage intervention for a production RAG system that feels "almost right" [note: Iusztin/Labonne].

**Dimensionality** trades storage and compute for ranking quality. 384-d models (MiniLM family) are roughly 4× cheaper to store and search than 1536-d (OpenAI `text-embedding-3-small`), and within 1–3 points of MTEB for most tasks. Matryoshka representation learning trains a model so the first k dimensions remain usable, letting you truncate at serving time. For high-volume workloads, this is real money.

## Retrieval optimization

A naive RAG system retrieves top-k on the raw user query and stops. Everything in this section is how production systems claw back recall and precision they lose at that step.

**Query rewriting** fixes the mismatch between how users phrase questions and how documents phrase answers. HyDE (hypothetical document embeddings) asks the LLM to generate a plausible *answer* to the query, then embeds that answer and searches for real passages similar to it — the generated answer is usually closer in vector space to the target documents than the question itself [note: Huyen AIE Ch. 6]. Multi-query generation runs k rewrites in parallel and unions results. Both trade one extra LLM call for meaningfully higher recall on ambiguous or underspecified queries.

**Re-ranking with cross-encoders** is the single most reliable upgrade to first-pass retrieval. A cross-encoder takes (query, passage) jointly, scores them with full self-attention, and produces far better ranking than the bi-encoder that retrieved them — at the cost of linear runtime in top-k. The standard pattern: retrieve top-50 or top-100 with the bi-encoder, re-rank to top-5 or top-10 with the cross-encoder, pass those to the LLM [note: Iusztin/Labonne; Hands-On LLMs]. This is the highest-leverage change in most production RAG stacks.

**Maximal Marginal Relevance (MMR)** re-ranks for diversity. Ten near-duplicate passages about the same point are worse than five passages covering different angles. MMR penalizes candidates by similarity to already-selected results, tuning a lambda that trades relevance for diversity. Useful for corpora with heavy topical redundancy.

**Chunk-to-parent / hierarchical indexing** decouples what you search from what you return. Index small chunks for retrieval precision, but when a chunk matches, expand to its parent section or document before passing to the LLM. This solves the common failure where a retrieved 256-token chunk lacks the context needed to actually answer the question.

**What actually works in practice versus what is paper-only.** Hybrid retrieval + cross-encoder re-ranking + chunk-to-parent is the durable production stack — every one of those interventions is cheap, debuggable, and compounds. Graph RAG, agentic retrieval loops, and learned-to-retrieve pipelines are promising but operationally expensive. The field disagrees on when graph RAG is worth the complexity over vector + metadata filtering: Microsoft's GraphRAG paper argues for it on global-summary queries over large corpora, while skeptics point out that well-tuned hybrid + re-ranking matches graph RAG on most benchmarks at a fraction of the engineering cost [note: Huyen AIE Ch. 6 acknowledges the debate]. Default to vector + hybrid + re-ranking; reach for graph structures when your queries genuinely require multi-hop reasoning the simpler stack cannot support.

::callout{type="warning"}
**Re-ranking is not optional at scale.** Teams routinely ship bi-encoder-only RAG systems and then blame the LLM when answers are wrong. First-stage retrieval at top-5 is noisy; adding a cross-encoder over top-50 is the cheapest quality gain in the stack.
::

## RAG failure modes

Most broken RAG systems fail in one of four ways, and the fixes are different for each.

**Retrieval miss.** The right document exists in the corpus but the retrieval stage ranks it below the top-k. Diagnosed by running eval queries with ground-truth passage IDs and computing recall@k. Fixed by hybrid retrieval, re-ranking, query rewriting, or chunking changes — in that order of typical impact [note: Huyen AIE Ch. 6].

**Context stuffing hurting quality.** Retrieving top-20 instead of top-5 gives the model more to work with and often produces *worse* answers. Long contexts spread attention, amplify conflicting passages, and increase the chance the model latches onto a plausible-but-wrong distractor. The fix is usually fewer, better passages — not more [note: Bouchard Building LLMs for Production].

**Stale embeddings.** Documents updated, the index was not reindexed, and the model is retrieving against old vectors. Common when document stores and vector stores drift out of sync. Fix with change-data-capture pipelines or scheduled re-embedding; monitor by sampling (document, retrieved-chunk) pairs and checking freshness.

**User-query-mismatch.** Users ask "why is my invoice wrong" and the corpus contains "troubleshooting billing discrepancies." The embedding model handles some paraphrase, not all. Diagnosed via query log analysis; fixed by HyDE, multi-query, or — for high-value queries — a small curated FAQ indexed separately and checked first.

## Agents — the concept

An agent is a loop: the model proposes an action, something external executes the action, the result feeds back into the model's context, and the loop repeats until the model decides it is done. RAG retrieves once and generates. Agents iterate, branch, and call external systems. The difference is not cosmetic — it unlocks tasks that require gathering information dynamically, but it also introduces failure modes that static pipelines do not have [note: Huyen AIE Ch. 6].

The foundational pattern is **ReAct** (Reasoning + Acting), introduced by Yao et al. in 2022 [note: Yao et al. 2022, ReAct: Synergizing Reasoning and Acting in Language Models]. The loop interleaves explicit reasoning steps ("I need to find the current weather in Seattle") with actions ("call get_weather('Seattle')") and observations (the tool's return value). The explicit reasoning trace improves tool selection and reduces hallucinated actions; the interleaving gives the model a way to recover from failed calls.

**Tool-use primitives** are the vocabulary the agent operates with. Early work (Toolformer, Schick et al. 2023) showed models could learn to call external APIs with self-supervised training; modern foundation models treat tools as first-class through structured function-calling interfaces [note: Schick et al. 2023, Toolformer]. In practice, an agent is only as useful as its tool set is well-designed — descriptions matter, schemas matter, side effects matter. A vague tool description produces vague tool calls.

**Planning and reflection** extend the basic ReAct loop. Planning decomposes a task into sub-goals before acting, reducing wasted tool calls on the branch exploration. Reflection re-reads prior actions and results to notice mistakes — "I searched for X and got nothing; let me search for Y instead." Both are easier to describe than to ship reliably; they tend to help on hard tasks and hurt on easy ones by adding latency and opportunities to derail [note: Huyen AIE Ch. 6; Bouchard].

Agents differ from pipelines in a structural way: a pipeline has a fixed graph, an agent has a graph chosen at runtime by the model. That flexibility is the point, and it is also the source of every problem in the next section.

<AgentLoopStepper />

## Agent failure modes

**Infinite loops.** The model calls a tool, gets a result it does not understand, calls the same tool again with a slight variation, and repeats. Mitigate with hard step budgets, action-history deduplication, and "you have already tried X, consider Y" prompting on loop detection.

**Tool selection errors.** With a large tool catalog, the model picks the wrong tool or hallucinates a tool that does not exist. The fix is smaller, clearer tool inventories scoped per task, or a retrieval step that pre-filters tools before the model sees them [note: Huyen AIE Ch. 6].

**Context window exhaustion.** Every tool call appends input and output to the context. Long-running agents fill the window with stale observations and lose coherence. Mitigate with observation summarization, explicit context compaction between steps, or architectural moves that separate working memory from long-term context.

**Hallucinated tool calls.** The model emits a call with wrong arguments, missing required fields, or fabricated IDs. Fix with strict schema validation at the tool boundary, structured output modes, and clear error messages that feed back into the next model turn so it can correct.

**Evaluation difficulty.** This is the hardest one. Agents have non-deterministic trajectories, so the same task can succeed one run and fail the next without any code change. End-to-end task success is the cleanest metric; per-step evaluation requires tracing infrastructure. The field has not converged on a standard; expect to build your own [note: Bouchard Building LLMs for Production].

::callout{type="warning"}
**Always cap agent steps.** An uncapped agent loop can burn through a model's rate limit or a tool's quota in minutes. Set `max_steps` before the first line of loop code, not after the first incident.
::

<ToolTracer />

## When RAG vs when agents vs when both

RAG is the right answer when the task is "answer a question using a known corpus" — support bots, internal search, document Q&A. The corpus is stable, the retrieval is one-shot, the generation is grounded in what came back. Ship RAG when you need factual answers over specific material [note: Huyen AIE Ch. 6].

Agents are the right answer when the task requires *dynamic information gathering*, *multi-step reasoning over external systems*, or *action-taking in the world*. Browsing a website, navigating an API, filing a ticket, executing a workflow across three SaaS tools — none of these fit the one-shot retrieval pattern. Ship agents when the task involves decisions the model needs to make based on what it finds along the way.

Both, together, is increasingly standard. Agentic RAG uses retrieval as one tool among many — the agent decides when to search, can issue multiple queries with different framings, and can combine retrieved material with computation, API calls, or interactive clarification. This is more capable than static RAG and more grounded than pure tool-use agents, at the cost of the agent failure modes listed above [note: Iusztin/Labonne; Bouchard].

The honest heuristic: start with RAG. If users have to phrase queries unnaturally, if follow-ups fail, or if the task legitimately requires multi-hop work, upgrade to agentic RAG. Skip straight to agents only when the task is fundamentally about actions, not answers.

::callout{type="warning"}
**Do not build an agent when RAG would do.** Agents are 5–20× more expensive per user interaction, harder to evaluate, and more prone to unbounded failure. The failure mode of the field right now is over-agenticizing tasks that are one-shot retrieval in disguise.
::

## What's next

Retrieval quality and agent reliability are both evaluation problems before they are architecture problems. The next topic, **Evaluation**, covers how to measure what you just built — retrieval metrics (recall@k, MRR, nDCG), generation quality (faithfulness, groundedness), and agent trajectory evaluation. The topic after that, **Production**, covers the reliability engineering that turns a working demo into a system that stays working: caching, monitoring, cost control, and the operational surface area RAG and agents introduce.

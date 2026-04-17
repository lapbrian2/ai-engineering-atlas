<script setup lang="ts">
// Real vector search on a preloaded corpus of 40 AI-engineering doc snippets.
// BM25 (sparse) runs instantly; MiniLM embeddings (dense) lazy-load via
// transformers.js on first search — shows the tradeoff live.

const corpus = [
  { id: 'tk-1',  title: 'Byte-pair encoding',             text: 'BPE learns a vocabulary of subword units by iteratively merging the most frequent adjacent byte pairs in the training corpus. The result is a reversible tokenization where rare and novel words decompose into meaningful subwords.' },
  { id: 'tk-2',  title: 'Tokenizer vocabularies',         text: 'Vocabulary size trades sequence length against embedding matrix memory. Larger vocabularies give shorter token sequences but cost more in the embedding lookup and softmax.' },
  { id: 'at-1',  title: 'Attention mechanism',            text: 'Self-attention computes a weighted sum over all positions in a sequence. Each query vector is scored against every key vector via scaled dot product; weights are softmaxed then applied to values.' },
  { id: 'at-2',  title: 'Multi-head attention',           text: 'Splitting the attention computation into multiple heads lets different heads specialize on different relationships — previous tokens, punctuation sinks, induction patterns.' },
  { id: 'at-3',  title: 'KV cache in inference',          text: 'During autoregressive generation, the key and value tensors from past tokens can be cached and reused at every new-token step, turning a quadratic-cost decode into linear.' },
  { id: 'sm-1',  title: 'Temperature sampling',           text: 'Dividing logits by temperature before softmax reshapes the distribution. Low temperature sharpens toward the argmax; high temperature flattens toward uniform.' },
  { id: 'sm-2',  title: 'Top-p nucleus sampling',         text: 'Nucleus sampling keeps the smallest set of tokens whose cumulative probability exceeds p, then renormalizes over that set. Adaptive to the shape of the distribution.' },
  { id: 'sm-3',  title: 'Repetition penalty',             text: 'Post-logit adjustment that discounts tokens already present in the generated context, nudging the sampler away from loops without fully banning repetition.' },
  { id: 'pr-1',  title: 'Zero-shot prompting',            text: 'Describing the task in natural language with no examples. Works best when the task is close to something the model has seen in pretraining.' },
  { id: 'pr-2',  title: 'Few-shot prompting',             text: 'Placing a handful of input-output exemplars in the prompt before the real query. Order and selection of exemplars noticeably shift results.' },
  { id: 'pr-3',  title: 'Chain-of-thought prompting',     text: 'Prompting the model to show its reasoning step by step before committing to an answer. Consistently improves multi-step reasoning tasks but can hurt on simple classification.' },
  { id: 'pr-4',  title: 'Self-consistency',               text: 'Sample multiple chains of thought and vote on the final answer. Converts CoT from a single brittle reasoning trace into a majority-of-traces decision.' },
  { id: 'pr-5',  title: 'Prompt injection',               text: 'An attacker hides instructions in user input or retrieved context that hijack the model away from its original task. Primary LLM-app security concern.' },
  { id: 'ev-1',  title: 'Perplexity',                     text: 'Geometric mean of 1/p over held-out tokens; equivalently the exponential of cross-entropy. Meaningful for base LMs on a fixed corpus; misleading across tokenizers or on chat models.' },
  { id: 'ev-2',  title: 'AI as a judge',                  text: 'Using a stronger LLM to grade outputs of a weaker one against a rubric. Known biases: position, verbosity, self-preference. Sanity-check against human judgment before trusting.' },
  { id: 'ev-3',  title: 'Chatbot Arena',                  text: 'Head-to-head pairwise battles scored with a Bradley-Terry / Elo-style model. Captures preference signal across diverse users but not coverage or fairness.' },
  { id: 'ev-4',  title: 'BLEU and ROUGE',                 text: 'N-gram overlap metrics originally for machine translation and summarization. Fast, reproducible, and increasingly disconnected from human judgments of quality.' },
  { id: 'ra-1',  title: 'Retrieval-augmented generation', text: 'Retrieve relevant passages from a corpus and stitch them into the prompt so the model can ground its answer in current or private knowledge.' },
  { id: 'ra-2',  title: 'Dense retrieval',                text: 'Encode queries and documents into a shared vector space; nearest-neighbor search returns the most semantically similar passages. Typically via a bi-encoder trained with contrastive loss.' },
  { id: 'ra-3',  title: 'BM25 sparse retrieval',          text: 'Term-frequency-inverse-document-frequency scoring with saturation. Fast, interpretable, no training required, and still competitive especially on out-of-domain queries.' },
  { id: 'ra-4',  title: 'Hybrid retrieval',               text: 'Combine dense and sparse scores — typically reciprocal rank fusion — to capture both semantic similarity and exact-term match. Usually beats either alone on real queries.' },
  { id: 'ra-5',  title: 'Cross-encoder re-ranking',       text: 'After cheap first-pass retrieval, feed each query-document pair through a full transformer to score relevance. Slow per call but dramatically improves top-k precision.' },
  { id: 'ra-6',  title: 'Chunk size tradeoff',            text: 'Smaller chunks give higher recall on narrow facts but lose context. Larger chunks preserve context but dilute the embedding signal. Typical practical range: 200-1000 tokens with 10-20 percent overlap.' },
  { id: 'ag-1',  title: 'ReAct agent pattern',            text: 'Interleave reasoning and action: the model writes a thought, decides on a tool call, observes the result, then iterates. Simple but surprisingly capable scaffold for tool use.' },
  { id: 'ag-2',  title: 'Tool-use schemas',               text: 'JSON schemas describing available functions constrain the output format of a model. The model fills in arguments; a runtime harness dispatches the call.' },
  { id: 'ag-3',  title: 'Agent planning',                 text: 'Decompose a goal into subtasks, execute, observe, re-plan. Planning quality is the main determinant of whether an agent succeeds or loops.' },
  { id: 'ag-4',  title: 'Agent failure modes',            text: 'Infinite loops, wrong-tool selection, context-window exhaustion, and hallucinated tool calls. Evaluate end-to-end; individual steps look fine even when the system fails.' },
  { id: 'ft-1',  title: 'When to fine-tune',              text: 'Fine-tune to shape behavior (format, style, latency) or to inject small amounts of stable private knowledge. Fine-tune only after prompting and RAG have plateaued.' },
  { id: 'ft-2',  title: 'LoRA adapters',                  text: 'Freeze the base model and inject low-rank matrices A and B so the trainable update is ΔW = B @ A. A typical rank of 8 or 16 reaches most of the full-fine-tune quality at a fraction of the memory.' },
  { id: 'ft-3',  title: 'QLoRA 4-bit base',               text: 'Quantize the frozen base to 4-bit NF4, keep bf16 adapters. Makes fine-tuning 65B-scale models possible on a single 24 GB consumer GPU.' },
  { id: 'ft-4',  title: 'DPO direct preference optimization', text: 'Replaces RLHF with a closed-form objective over pairs of preferred and dispreferred completions. Simpler pipeline, comparable quality on many tasks.' },
  { id: 'in-1',  title: 'GPTQ quantization',              text: 'Post-training weight quantization to 4-bit using second-order information and a small calibration set. Ships a smaller model with minimal quality loss on many benchmarks.' },
  { id: 'in-2',  title: 'FlashAttention',                 text: 'Re-expresses attention as a tiled IO-aware kernel that avoids materializing the full N-by-N attention matrix. Big throughput win at longer context lengths.' },
  { id: 'in-3',  title: 'Continuous batching',            text: 'Iteration-level scheduling: whenever a request in a batch finishes, drop it and pull in a new one on the next token step. Keeps GPUs utilized across bursty workloads.' },
  { id: 'in-4',  title: 'Speculative decoding',           text: 'A small draft model proposes multiple tokens; the target model verifies them in parallel. Accepted prefix is taken; rejected positions fall back to target sampling.' },
  { id: 'in-5',  title: 'PagedAttention',                 text: 'Split the KV cache into fixed-size pages so multiple concurrent sequences can share memory without internal fragmentation. Underpins vLLM throughput.' },
  { id: 'ar-1',  title: 'Gateway and router',             text: 'A routing layer between app and models chooses which model gets each request based on cost, latency, or quality class. Also enforces rate limits and centralizes billing.' },
  { id: 'ar-2',  title: 'Semantic cache',                 text: 'Hash the embedding of a request; return a stored response if a past request was semantically similar. Cuts cost and latency aggressively on repetitive workloads.' },
  { id: 'ar-3',  title: 'Guardrails',                     text: 'Input guards filter prompt injection, PII, and out-of-scope requests; output guards check format, toxicity, and policy. Defense in depth, layered in front of and behind the model.' },
  { id: 'fb-1',  title: 'Explicit user feedback',         text: 'Thumbs up/down, star ratings, corrections. Low density and biased toward extreme experiences, but unambiguous in what it measures.' },
  { id: 'fb-2',  title: 'Implicit feedback',              text: 'Regenerate clicks, copy actions, abandonment, edit distance on model output. Higher density than explicit feedback; noisier, but correlates strongly with real preference.' }
]

const query = ref('')
const selectedMode = ref<'bm25' | 'dense' | 'hybrid'>('bm25')
const denseLoading = ref(false)
const denseReady = ref(false)

// ---------- BM25 ----------
const K1 = 1.5
const B = 0.75
const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean)

const docs = computed(() => corpus.map(d => ({
  ...d,
  tokens: tokenize(d.title + ' ' + d.text)
})))

const avgdl = computed(() => docs.value.reduce((s, d) => s + d.tokens.length, 0) / docs.value.length)

const idf = computed(() => {
  const df = new Map<string, number>()
  docs.value.forEach(d => {
    const seen = new Set<string>()
    d.tokens.forEach(t => {
      if (seen.has(t)) return
      seen.add(t)
      df.set(t, (df.get(t) || 0) + 1)
    })
  })
  const N = docs.value.length
  const map = new Map<string, number>()
  df.forEach((f, t) => {
    map.set(t, Math.log(1 + (N - f + 0.5) / (f + 0.5)))
  })
  return map
})

const bm25Score = (q: string[], d: { tokens: string[] }) => {
  let score = 0
  const dl = d.tokens.length
  const tf = new Map<string, number>()
  d.tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1))
  q.forEach(qt => {
    const f = tf.get(qt) || 0
    if (!f) return
    const i = idf.value.get(qt) || 0
    score += i * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * dl / avgdl.value)))
  })
  return score
}

// ---------- Dense (lazy-loaded) ----------
let embedder: any = null
const docEmbeddings = ref<Float32Array[] | null>(null)

async function loadEmbedder() {
  if (embedder) return embedder
  denseLoading.value = true
  try {
    const { pipeline } = await import('@xenova/transformers')
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    // Embed corpus
    const embs: Float32Array[] = []
    for (const d of corpus) {
      const out = await embedder(d.title + '. ' + d.text, { pooling: 'mean', normalize: true })
      embs.push(new Float32Array(out.data))
    }
    docEmbeddings.value = embs
    denseReady.value = true
  } finally {
    denseLoading.value = false
  }
}

const cosine = (a: Float32Array, b: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

const queryEmbedding = ref<Float32Array | null>(null)

async function denseSearch(q: string) {
  if (!embedder || !docEmbeddings.value) await loadEmbedder()
  if (!embedder || !docEmbeddings.value) return []
  const out = await embedder(q, { pooling: 'mean', normalize: true })
  const qe = new Float32Array(out.data)
  queryEmbedding.value = qe
  return docEmbeddings.value.map((de, i) => ({
    doc: corpus[i],
    score: cosine(qe, de)
  })).sort((a, b) => b.score - a.score)
}

// ---------- Combined results ----------
const results = ref<Array<{ doc: typeof corpus[number]; score: number; mode: string }>>([])
const searching = ref(false)

async function runSearch() {
  if (!query.value.trim()) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const qTok = tokenize(query.value)
    const bm25 = docs.value
      .map(d => ({ doc: corpus.find(c => c.id === d.id)!, score: bm25Score(qTok, d) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)

    if (selectedMode.value === 'bm25') {
      results.value = bm25.slice(0, 8).map(r => ({ ...r, mode: 'BM25' }))
      return
    }

    const dense = await denseSearch(query.value)

    if (selectedMode.value === 'dense') {
      results.value = dense.slice(0, 8).map(r => ({ ...r, mode: 'Dense' }))
      return
    }

    // hybrid — reciprocal rank fusion
    const rrf = new Map<string, number>()
    bm25.forEach((r, i) => rrf.set(r.doc.id, (rrf.get(r.doc.id) || 0) + 1 / (60 + i)))
    dense.forEach((r, i) => rrf.set(r.doc.id, (rrf.get(r.doc.id) || 0) + 1 / (60 + i)))
    const fused = Array.from(rrf.entries())
      .map(([id, score]) => ({ doc: corpus.find(d => d.id === id)!, score, mode: 'Hybrid' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    results.value = fused
  } finally {
    searching.value = false
  }
}

let tid: number | null = null
watch([query, selectedMode], () => {
  if (tid) clearTimeout(tid)
  tid = window.setTimeout(runSearch, 200)
})

onBeforeUnmount(() => { if (tid) clearTimeout(tid) })

const fmt = (n: number) => n.toFixed(3)
</script>

<template>
  <div class="vs">
    <div class="vs-head">
      <label class="q-label">
        <span class="overline">Query</span>
        <input
          v-model="query"
          type="text"
          placeholder="Ask something — e.g. 'how do agents choose tools?'"
          spellcheck="false"
        >
      </label>

      <div class="modes">
        <button :class="{ active: selectedMode === 'bm25' }"   @click="selectedMode = 'bm25'">BM25</button>
        <button :class="{ active: selectedMode === 'dense' }"  @click="selectedMode = 'dense'">Dense (MiniLM)</button>
        <button :class="{ active: selectedMode === 'hybrid' }" @click="selectedMode = 'hybrid'">Hybrid (RRF)</button>
      </div>
    </div>

    <div class="vs-meta">
      <span class="tag">{{ corpus.length }} documents in corpus</span>
      <span v-if="denseLoading" class="tag loading">loading MiniLM-L6-v2…</span>
      <span v-if="denseReady && !denseLoading" class="tag ok">dense embeddings ready · 384-dim</span>
      <span v-if="searching" class="tag loading">searching…</span>
    </div>

    <div v-if="!results.length && !query" class="empty">
      <p>Type a query to search. Try <em>"how does LoRA work"</em>, <em>"retrieval strategies"</em>, or <em>"agent failure modes"</em>.</p>
    </div>

    <div v-if="results.length" class="results">
      <article v-for="(r, i) in results" :key="r.doc.id" class="result">
        <div class="r-top">
          <span class="r-rank">{{ String(i + 1).padStart(2, '0') }}</span>
          <h4>{{ r.doc.title }}</h4>
          <span class="r-score" :title="`${r.mode} score`">{{ fmt(r.score) }}</span>
        </div>
        <p class="r-body">{{ r.doc.text }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.vs {
  padding: 28px;
  border: 1px solid var(--line);
  background: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.vs-head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: end;
}
@media (max-width: 720px) { .vs-head { grid-template-columns: 1fr; } }

.q-label { display: flex; flex-direction: column; gap: 8px; }
.q-label input {
  width: 100%;
  font-family: var(--serif);
  font-size: 1.2rem;
  color: var(--text);
  background: var(--ink);
  border: 1px solid var(--line-strong);
  padding: 14px 16px;
  outline: none;
  transition: border-color var(--dur-sm) ease;
}
.q-label input:focus { border-color: var(--accent); }

.modes { display: flex; gap: 6px; }
.modes button {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 12px 14px;
  border: 1px solid var(--line-strong);
  background: transparent;
  cursor: pointer;
  transition: all var(--dur-sm) var(--ease-premium);
}
.modes button:hover { border-color: var(--accent); color: var(--text); }
.modes button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--ink);
}

.vs-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 4px 8px;
  border: 1px solid var(--line);
  color: var(--text-muted);
}
.tag.loading { border-color: var(--accent); color: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
.tag.ok { border-color: var(--accent); color: var(--accent); }
@keyframes pulse { 50% { opacity: 0.5; } }

.empty {
  padding: 28px 20px;
  border: 1px dashed var(--line-strong);
  color: var(--text-dim);
  font-size: 13.5px;
  line-height: 1.55;
  text-align: center;
}
.empty em { color: var(--accent); font-style: italic; }

.results { display: flex; flex-direction: column; gap: 12px; }
.result {
  padding: 18px 20px;
  border: 1px solid var(--line);
  background: var(--ink);
  display: flex; flex-direction: column; gap: 8px;
  transition: border-color var(--dur-sm) ease, background var(--dur-sm) ease;
}
.result:hover { border-color: var(--accent); background: var(--ink-3); }

.r-top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: baseline;
}
.r-rank {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.r-top h4 {
  font-family: var(--serif);
  font-weight: 400;
  font-size: 1.15rem;
  color: var(--text);
  letter-spacing: -0.005em;
}
.r-score {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.r-body {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-dim);
}
</style>

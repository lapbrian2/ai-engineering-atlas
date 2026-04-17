// Static sitemap — built at generate time, served at /sitemap.xml

const concepts = [
  'tokenization', 'attention-mechanism', 'transformer-architecture', 'positional-encoding',
  'sampling-strategies', 'zero-shot-few-shot', 'chain-of-thought', 'self-consistency',
  'perplexity-metrics', 'exact-match-eval', 'ai-judge', 'comparative-eval', 'benchmarks',
  'rag-architecture', 'embeddings', 'vector-search', 'chunking', 're-ranking',
  'agents-react', 'tool-use', 'agent-planning', 'agent-memory',
  'finetuning-when', 'lora-qlora', 'quantization', 'model-merging',
  'dataset-curation', 'data-quality', 'data-synthesis',
  'inference-optimization', 'kv-cache', 'speculative-decoding',
  'model-routing', 'guardrails', 'gateway-caching', 'monitoring',
  'cost-modeling', 'user-feedback', 'hallucinations', 'prompt-injection'
]

const topics = [
  'foundation-models', 'prompt-engineering', 'evaluation', 'rag-agents',
  'finetuning', 'dataset-engineering', 'inference-optimization',
  'system-architecture', 'user-feedback', 'production-cost'
]

const paths = [
  'ship-a-rag-app', 'finetune-with-math', 'interview-prep',
  'transformers-from-scratch', 'scale-to-a-million'
]

const staticRoutes = ['', 'books', 'methodology', 'about']

export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'application/xml')
  const origin = 'https://ai-engineering-atlas.vercel.app'
  const today = new Date().toISOString().slice(0, 10)

  const urls = [
    ...staticRoutes.map(r => `${origin}/${r}`),
    ...topics.map(t => `${origin}/topics/${t}`),
    ...concepts.map(c => `${origin}/concepts/${c}`),
    ...paths.map(p => `${origin}/paths/${p}`)
  ]

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>`

  return body
})

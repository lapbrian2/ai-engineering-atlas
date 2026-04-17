// Lazy-loads @xenova/transformers and caches a tokenizer instance.
// Used by TokenizerPrimitive.client.vue.

type TokenizerResult = {
  tokens: Array<{ text: string; id: number }>
  chars: number
  count: number
  ratio: number
}

let tokenizerPromise: Promise<any> | null = null

async function loadTokenizer() {
  if (!tokenizerPromise) {
    tokenizerPromise = (async () => {
      const { AutoTokenizer } = await import('@xenova/transformers')
      // cl100k_base equivalent — use GPT-2 BPE as a compact proxy for V1;
      // can swap for a cl100k-spec tokenizer once one is on HF without auth.
      const tokenizer = await AutoTokenizer.from_pretrained('Xenova/gpt-3.5-turbo')
      return tokenizer
    })()
  }
  return tokenizerPromise
}

export function useTokenizer() {
  const ready = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const tokenize = async (text: string): Promise<TokenizerResult | null> => {
    try {
      loading.value = true
      const tk = await loadTokenizer()
      const encoded = tk.encode(text)
      const tokens = encoded.map((id: number) => ({
        text: tk.decode([id], { skip_special_tokens: false }),
        id
      }))
      ready.value = true
      loading.value = false
      return {
        tokens,
        chars: text.length,
        count: tokens.length,
        ratio: tokens.length ? +(text.length / tokens.length).toFixed(2) : 0
      }
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      loading.value = false
      return null
    }
  }

  return { ready, loading, error, tokenize }
}

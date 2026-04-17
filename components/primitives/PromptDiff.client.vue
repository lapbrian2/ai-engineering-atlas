<script setup lang="ts">
// Side-by-side prompt variant comparison. Shows what each prompting
// technique looks like for the same underlying task, with the model
// response pattern each typically produces. Not a live model call —
// educational illustration of the canonical techniques.

const task = ref('Classify this customer review as positive, neutral, or negative: "Took forever to arrive but works great."')

const variants = computed(() => [
  {
    id: 'zero',
    label: 'Zero-shot',
    desc: 'Describe the task. No examples.',
    prompt: `Classify the sentiment of this review as positive, neutral, or negative. Return only the label.

Review: "${taskReview.value}"
Label:`,
    response: 'neutral',
    rationale: 'Correct answer depends on the model — zero-shot is brittle on borderline cases like mixed sentiment.'
  },
  {
    id: 'few',
    label: 'Few-shot',
    desc: 'Describe the task. Add 2-3 exemplars spanning boundary cases.',
    prompt: `Classify sentiment as positive, neutral, or negative.

"Shipped fast and the product is perfect." → positive
"Never arrived. Refund issued promptly." → neutral
"Barely functional and broken after a week." → negative

Review: "${taskReview.value}"
Label:`,
    response: 'neutral',
    rationale: 'Exemplars anchor the decision boundary. Pick exemplars that span the near-miss cases your model struggles with.'
  },
  {
    id: 'cot',
    label: 'Chain-of-thought',
    desc: 'Ask the model to reason step-by-step before answering.',
    prompt: `Classify the sentiment of this review. Think step-by-step about positive and negative signals separately, then commit to a final label.

Review: "${taskReview.value}"
Reasoning:`,
    response: 'Positive signal: "works great". Negative signal: "took forever to arrive". The reviewer\'s overall judgment leans positive because product quality is emphasized last. Label: positive',
    rationale: 'Forces the model to surface competing evidence before committing. Costs more tokens; can flip ambiguous cases.'
  },
  {
    id: 'sc',
    label: 'Self-consistency',
    desc: 'Sample N independent CoT traces with temperature > 0; majority vote.',
    prompt: `Classify sentiment step-by-step.
Review: "${taskReview.value}"
Reasoning:`,
    response: 'trace 1 → positive · trace 2 → positive · trace 3 → neutral · trace 4 → positive · trace 5 → positive\nvote: positive (4/5)',
    rationale: 'Converts CoT from one-shot-brittle into majority-vote stable. Most gain on reasoning tasks; small or negative on simple classification.'
  }
])

// Pull review text from task for substitution
const taskReview = computed(() => {
  const m = task.value.match(/"([^"]+)"/)
  return m?.[1] ?? 'the sample text'
})

const selected = ref<'zero' | 'few' | 'cot' | 'sc'>('few')
</script>

<template>
  <div class="pd">
    <div class="task-row">
      <label>
        <span class="overline">Task prompt (the natural-language instruction you'd give a model)</span>
        <input v-model="task" type="text" spellcheck="false">
      </label>
    </div>

    <div class="tabs">
      <button
        v-for="v in variants"
        :key="v.id"
        :class="{ active: selected === v.id }"
        @click="selected = v.id as any"
      >
        <span class="t-label">{{ v.label }}</span>
      </button>
    </div>

    <div class="detail" v-if="variants.find(v => v.id === selected) as any">
      <p class="t-desc">{{ (variants.find(v => v.id === selected) as any).desc }}</p>

      <div class="panes">
        <div class="pane pane-prompt">
          <span class="pane-label">Prompt</span>
          <pre>{{ (variants.find(v => v.id === selected) as any).prompt }}</pre>
        </div>
        <div class="pane pane-response">
          <span class="pane-label">Typical response pattern</span>
          <pre class="response">{{ (variants.find(v => v.id === selected) as any).response }}</pre>
        </div>
      </div>

      <div class="rationale">
        <span class="overline">Why this matters</span>
        <p>{{ (variants.find(v => v.id === selected) as any).rationale }}</p>
      </div>
    </div>

    <p class="disclaimer">
      Responses are illustrative patterns for teaching — not live model calls. Real model behavior varies by provider, temperature, and prompt framing.
    </p>
  </div>
</template>

<style scoped>
.pd {
  padding: 28px;
  border: 1px solid var(--line);
  background: var(--ink-2);
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.task-row label { display: flex; flex-direction: column; gap: 8px; }
.task-row input {
  width: 100%;
  font-family: var(--serif);
  font-size: 1.05rem;
  color: var(--text);
  background: var(--ink);
  border: 1px solid var(--line-strong);
  padding: 12px 14px;
  outline: none;
  transition: border-color var(--dur-sm) ease;
}
.task-row input:focus { border-color: var(--accent); }

.tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
@media (max-width: 600px) {
  .tabs { grid-template-columns: repeat(2, 1fr); }
}
.tabs button {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 14px 12px;
  border: 1px solid var(--line-strong);
  background: transparent;
  cursor: pointer;
  transition: all var(--dur-sm) var(--ease-premium);
}
.tabs button:hover { border-color: var(--accent); color: var(--text); }
.tabs button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--ink);
}

.t-desc {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text-dim);
  max-width: 60ch;
}

.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--line-strong);
  border: 1px solid var(--line-strong);
}
@media (max-width: 720px) { .panes { grid-template-columns: 1fr; } }

.pane {
  background: var(--ink);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pane-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.pane pre {
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-wrap: break-word;
}
.pane-response pre.response { color: var(--accent); font-family: var(--serif); font-size: 14px; font-style: italic; }

.rationale {
  padding: 18px 20px;
  border: 1px solid var(--line);
  background: var(--ink);
}
.rationale .overline { display: block; margin-bottom: 8px; }
.rationale p { font-size: 13.5px; line-height: 1.55; color: var(--text-dim); }

.disclaimer {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-muted);
  padding-top: 4px;
  border-top: 1px solid var(--line);
}
</style>

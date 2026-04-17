---
id: foundation-models
order: 01
title: Understanding Foundation Models
subtitle: Training data, architecture, post-training, sampling — and how a transformer becomes a product
topic: foundation-models
difficulty: intermediate
estimatedReadMinutes: 49
hero: true
primitives:
  - tokenizer
  - attention-heatmap
  - temperature-sampler
citations:
  - { book: huyen-aie, chapters: "Ch. 2", topic: "foundation model fundamentals" }
  - { book: raschka-from-scratch, chapters: "Ch. 1-4", topic: "attention and transformer internals" }
  - { book: hands-on-llms, chapters: "Ch. 1-3", topic: "tokenization, embeddings, architecture" }
tags: [foundation-models, transformer, attention, sampling, tokenization]
updatedAt: 2026-04-17
---

## What a foundation model actually is

The phrase "foundation model" is doing a lot of work. Stanford's CRFM coined it to name a specific phenomenon: a single model, trained once on broad data at scale, that can be adapted to a wide range of downstream tasks without retraining from zero [^1]. The emphasis is adaptation, not omniscience. You take a pretrained base, then you point it at a task through prompting, fine-tuning, retrieval, or tool use.

The name is deliberately architecture-agnostic. A foundation model can be a decoder-only transformer like the GPT family, an encoder-decoder like T5, or a multimodal model that takes images and text. What makes it a foundation model is the combination of three properties: it was trained on a broad distribution of data, its training objective was general (typically next-token prediction for language), and it can be adapted to many downstream tasks [^2].

The practical consequence for engineers is that you almost never train one. You inherit a model with characteristics shaped by choices someone else made — what data went in, how it was filtered, what post-training did, what sampling it exposes. Those choices determine what the model is good at, where it fails, and how much of its behavior you can change from the outside. Understanding the layers below the API surface is how you avoid blaming the model for problems that live in your prompt, and how you avoid blaming your prompt for problems that live in the pretraining [^2].

To make this concrete: suppose you hit a ceiling on a customer support classifier. The model keeps misrouting a specific class of tickets. You could spend a week on prompt iteration. But if the underlying base was trained mostly on English web text and your tickets are technical product queries in a domain the pretraining barely touched, no amount of prompt engineering recovers the information that was never encoded in the weights. The fix lives one layer down: fine-tune, retrieve domain context, or pick a model with stronger coverage of your domain. Engineers who can localize a problem to the right layer solve it in hours. Engineers who can't can spend weeks optimizing the wrong thing.

::callout{type="info"}
A foundation model is not a finished product. It is an adaptable substrate. Most of your engineering work sits on top of it — the prompt, the retrieval layer, the evaluation harness, the output validators.
::

### The four layers you can touch

It helps to think of a deployed LLM application as a stack of layers, each with its own leverage point:

1. **Pretraining data and objective.** Fixed by the lab. You inherit it. This is where world knowledge, linguistic priors, and many latent capabilities are laid down.
2. **Architecture and weights.** Also fixed in most commercial cases. You choose which model to call, but you do not change the weights.
3. **Post-training behavior.** Partially fixed, partially yours. The lab installed instruction-following, refusals, and style. You can override some of this through system prompts, in-context examples, or (for open-weights models) your own fine-tuning.
4. **Inference-time controls.** Fully yours. Prompt, sampling parameters, retrieval, tool calls, validators, retries.

When something goes wrong, diagnose top-down. Ask: "Does the pretraining even contain the information I need?" If yes, "Is post-training preventing the model from using it?" If no, "Am I shaping the inference correctly?" Most product failures live in layer 4, but the most expensive confusions come from attacking the wrong layer.

## Training data

A language model learns the distribution of its training data. This is not a metaphor — it is the literal objective. Everything the model does downstream is a consequence of what went in, how much of it there was, and how it was weighted. If you want to predict what a model will be good at, the training corpus is the first thing to look at [^2].

Modern foundation model corpora are web-scale in the most literal sense: filtered snapshots of Common Crawl, supplemented with curated sources like books, code repositories, academic papers, and reference material. The rough order of magnitude has moved from hundreds of billions of tokens in GPT-3 era models [^3] to trillions of tokens in frontier systems today. Exact counts for closed models are rarely published; treat public numbers as estimates.

### What "the objective" actually is

The pretraining objective for a decoder-only language model is strikingly simple: given a sequence of tokens, predict the next token. Formally, the model maximizes the log-likelihood of observed sequences:

```text
L(θ) = Σ_t log P_θ(x_t | x_1, x_2, ..., x_{t-1})
```

For each position *t* in the training sequence, the model produces a probability distribution over the entire vocabulary, and the loss is the negative log-probability the model assigned to the *actual* next token that appeared in the data [^4]. The training signal is therefore dense — every single token in the corpus produces a gradient update. A single document of 4,000 tokens contributes roughly 4,000 next-token predictions to the loss.

This matters because it tells you something non-obvious about what the model is actually learning. It is not learning "facts about the world" in any explicit sense. It is learning a probability distribution over sequences of tokens that happens to be shaped by the structure of the world that produced those sequences. If the distribution contains the sentence "The capital of France is Paris" roughly 10,000 times and "The capital of France is Lyon" zero times, the model assigns a very high probability to "Paris" after seeing "The capital of France is." That is why it answers the question correctly. It is also why it sometimes answers incorrectly in domains where the training distribution is sparser or noisier — the model has no separate "knowledge" module, just a distribution.

### The three properties that actually matter

Three properties of the data matter more than raw size:

**Language mix.** Most large corpora are English-dominant by a wide margin. A model trained on 90% English will perform noticeably worse on low-resource languages, and it will transfer stylistic and cultural priors from English text into multilingual outputs. If your product serves a non-English market, the language distribution of the base model is a first-order concern.

**Domain coverage.** Code-heavy pretraining produces models that are good at code. Models trained with large fractions of academic text are better at formal reasoning tasks. Models trained on dialogue data are better conversationalists. "Capability" is not a generic quantity; it is shaped by what fraction of the corpus resembles your task [^5].

**Quality filtering.** Deduplication, toxicity filtering, and quality classifiers change what the model learns. There is an active, unresolved debate about how aggressively to filter — too little and the model memorizes boilerplate and absorbs low-quality patterns; too much and you strip out useful diversity or bias the model toward a narrow register. Different labs make different choices, and those choices are visible in model behavior even when architecture and size are comparable [^2].

One consequence worth internalizing: cutoff dates matter. A model's knowledge of the world ends roughly when its pretraining data was collected. Anything after that — new APIs, new events, new facts — has to come in through the prompt, retrieval, or tools.

### A worked example: why the model knows Python better than Haskell

A simple thought experiment makes the data-distribution point visceral. Consider two programming languages: Python and Haskell. Both are in the training corpus, but the ratio is nowhere near 1:1. GitHub data alone has orders of magnitude more Python than Haskell — Python sits somewhere near the top of popularity rankings, Haskell somewhere much further down. If the ratio in the training data is, say, 500:1, then for every time the model saw a Haskell construct it saw roughly 500 Python constructs.

The consequence is not that the model "doesn't know" Haskell. It does. But its distribution over Haskell constructs is sharper around common patterns (basic list comprehensions, simple monadic binds) and fuzzier around less common ones (advanced type-level programming, obscure extensions). Meanwhile, the Python distribution is dense across a much wider surface. On average, the model is more confident, more correct, and more fluent in Python simply because the underlying probability distribution had more evidence to shape.

The engineering takeaway: when you are choosing between two foundation models for a task, ask "what does the training distribution look like for my domain?" before you run benchmarks. The benchmarks are downstream of the distribution.

### A second worked example: why models can write SQL but struggle with novel DSLs

Extend the same logic. SQL has decades of public code and documentation; every major model has seen millions of SQL queries during training. Ask it to write a `SELECT` with a `JOIN` and a `GROUP BY`, and you get confident, correct output. Ask it to write queries in a domain-specific language your company invented last year — a configuration DSL, a custom workflow language, a proprietary query syntax — and the model fumbles. It has never seen the token sequences that define correct usage.

The fix is not "use a bigger model." A bigger model trained on the same data will still have never seen your DSL. The fix is to either (a) include DSL documentation and examples in the prompt so the model can pattern-match at inference time, (b) retrieve similar queries from a repository of examples, or (c) fine-tune on a corpus of correct DSL usage. Each of these injects the distribution the model is missing. Understanding that the model's gap is a data gap — not a reasoning gap — tells you where to spend engineering effort.

### Data quality as a lever, not a checkbox

Quality filtering deserves more attention than it usually gets. A mental model: imagine the pretraining corpus as a weighted average of writing styles, and the model's output as a weighted sample from that average. If 30% of your corpus is low-quality forum posts with "lol" and "imo" peppered through, 30% of your model's output will lean toward that register unless post-training explicitly suppresses it. If 5% of your corpus is research papers, the model will sometimes "switch register" into that style when the prompt cues it.

Labs spend enormous effort on data quality because small shifts in the mix cascade into large shifts in behavior. A model trained on the same raw data but with heavier upweighting of textbook-style content will be noticeably better at explaining concepts step-by-step, even with identical architecture and compute. This is one of the invisible reasons two models of the same size can feel so different in practice.

## Tokenization

Before a model sees text, text becomes tokens. Tokenization is not a glamorous topic, but it is where several non-obvious behaviors of LLMs originate — character counting failures, weird numeric arithmetic, inconsistent whitespace handling, and dramatic cost differences between languages all trace back here.

The dominant algorithm in production is some variant of Byte Pair Encoding (BPE) or WordPiece. The intuition is simple: start with individual bytes or characters, then iteratively merge the most frequent adjacent pair into a new token, until you have a vocabulary of fixed size (often 32K–200K). The algorithm is purely statistical — there is no grammar, no linguistic analysis, just frequency counts in the training data [^5].

### What this does in practice

Consider the sentence "The quick brown fox." A typical BPE tokenizer breaks this into roughly 5 tokens, something like:

```text
["The", " quick", " brown", " fox", "."]
```

Now try "antidisestablishmentarianism." This is one English word, but it is also rare. A typical tokenizer produces something like 6 tokens:

```text
["ant", "idis", "estab", "lish", "ment", "arianism"]
```

And try Japanese, "こんにちは世界" ("hello world"). Because the tokenizer was trained on data that was English-dominant, the merges available for Japanese characters are fewer. You can easily end up with 10+ tokens for what a human reads as two words. This is why non-English languages are often 2-4x more expensive per "equivalent" sentence — you pay per token, and the language's tokens-per-character ratio is unfavorable.

### The famous numeric quirk

Ask a base LLM to multiply two four-digit numbers and it often stumbles. Part of the reason is tokenization. Consider "1234 * 5678". A BPE tokenizer typically splits "1234" into something like `["123", "4"]` and "5678" into `["567", "8"]`, because the triplets "123" and "567" are more frequent in training data than the full four-digit strings. The model is trying to do arithmetic on chunks that do not correspond to digits at all. It has learned a lot about how digit-chunks combine, but it has not been given a clean positional representation of each digit. Specialized tokenizers (and newer models that split numbers into individual digits) mitigate this; the lesson is that arithmetic failures are often a tokenization artifact as much as a reasoning failure.

### Engineering implications

- **Token budgets are your real budget.** Your API bill, your context window, your latency — all are measured in tokens, not characters or words. Learn your tokenizer's behavior on your actual inputs.
- **Different models, different tokenizers.** GPT-4, Claude, Llama all use different tokenizers with different vocabularies. "500 tokens" on one model is not the same as "500 tokens" on another.
- **Leading whitespace changes tokens.** The token for " quick" (with leading space) is different from "quick" (no space). This is why subtle prompt formatting differences can have outsized effects.
- **Special tokens matter.** `<|endoftext|>`, `<|system|>`, `<|user|>` — these are single tokens that the model is trained to treat specially. Misplaced special tokens can break structured output.

### A concrete token-counting exercise

To ground this: here are rough tokenizer behaviors for a typical BPE tokenizer (numbers approximate, vary by model).

```text
"Hello, world."                 →  4 tokens   (Hello, ",", " world", ".")
"The quick brown fox jumped."   →  6 tokens
"antidisestablishmentarianism"  →  7 tokens  (rare long word splits heavily)
"1234567890"                    →  4 tokens  (split into digit chunks)
"こんにちは"                     →  5 tokens  (Japanese often 1 token per char)
'{"name":"alice","age":30}'     →  11 tokens (JSON syntax characters each cost)
```

The JSON example is instructive. Structured outputs cost more tokens than you might guess because the tokenizer spends tokens on braces, quotes, and colons that would be "free" in a natural-language formulation. This affects both cost and context window usage. When your prompt includes large JSON schemas, you can burn a surprising fraction of your context budget on punctuation.

### Why tokenizer choice is partly frozen

The tokenizer is trained once, before pretraining, and then the model is trained on top of it. Changing tokenizers after the fact is not free — the token ID for "cat" in the old tokenizer might not be the token ID for "cat" in a new one, so all the learned associations break. In practice, labs ship a new tokenizer with a new model generation. This is why token-level compatibility is not guaranteed across model versions, and why tooling that assumes a specific tokenizer needs to be re-checked when the underlying model changes.

<TokenizerPrimitive />

## Architecture essentials

Almost every current-generation foundation model for language is a decoder-only transformer. The transformer block has been remarkably stable since 2017, and while the details have evolved, the skeleton has not [^4][^6].

A single transformer block does roughly this:

```text
x_in
  │
  ▼
┌──────────────┐
│  LayerNorm   │   (pre-norm variant)
└──────────────┘
  │
  ▼
┌──────────────────────┐
│  Multi-head attention│   (Q, K, V projections, softmax, output proj)
└──────────────────────┘
  │
  ▼   ── residual ──►  +  x_in
  │
  ▼
┌──────────────┐
│  LayerNorm   │
└──────────────┘
  │
  ▼
┌──────────────┐
│  Feed-forward│   (usually 2 linear layers with a nonlinearity)
└──────────────┘
  │
  ▼   ── residual ──►  +
  │
  ▼
x_out
```

Stack a few dozen of these blocks, wrap them with a token embedding at the input and a linear projection to vocabulary at the output, and you have the core of a modern LLM [^6].

### Step-by-step forward pass

Let's walk a small example all the way through, with tensor shapes. Imagine a toy decoder-only model with:

- vocabulary size `V = 50,000`
- embedding/model dimension `d_model = 512`
- number of attention heads `h = 8` (so head dimension `d_k = 64`)
- feed-forward hidden dimension `d_ff = 2048`
- number of layers `L = 12`

And suppose the input is the sentence "The cat sat" tokenized to three tokens with IDs `[464, 3797, 5183]`. The sequence length `n = 3`.

**Step 1: Token embedding.** Each token ID indexes into an embedding matrix of shape `[V, d_model] = [50000, 512]`. Output: a tensor of shape `[n, d_model] = [3, 512]`. Each token is now a 512-dimensional vector — a dense representation in the model's internal space.

**Step 2: Positional encoding.** Since self-attention treats inputs as a set, position information has to be added. In the original transformer, a fixed sinusoidal vector of shape `[3, 512]` is added element-wise. In modern models using RoPE, positional information is applied inside the attention computation instead, by rotating Q and K vectors. The output shape stays `[3, 512]`.

**Step 3: Enter the first transformer block. LayerNorm.** Each of the three token vectors is normalized independently (mean 0, variance 1, then scaled by learned parameters). Shape unchanged: `[3, 512]`.

**Step 4: Q, K, V projections.** Three learned linear layers project the input into query, key, and value tensors. Each has shape `[3, 512]`. These are then reshaped to separate heads: `[3, h, d_k] = [3, 8, 64]`, and transposed to `[8, 3, 64]` so we can do attention per head in parallel.

**Step 5: Scaled dot-product attention.** For each head, compute `Q @ K^T` which gives a `[3, 3]` matrix of similarity scores — position *i* attending to position *j*. Divide by `√d_k = √64 = 8`. Apply the causal mask (set the upper triangle to `-∞`, so position 1 cannot attend to positions 2 or 3). Softmax each row. Multiply by `V` to get the weighted sum, shape `[3, 64]` per head.

**Step 6: Concatenate heads and project.** Stack the 8 head outputs back to `[3, 512]`, pass through the output projection (another learned linear layer). This is the attention output.

**Step 7: Residual connection.** Add the attention output to the input from step 3 (before the LayerNorm). This is why residuals are load-bearing: they give gradients a shortcut around attention.

**Step 8: Second LayerNorm and feed-forward.** Another LayerNorm, then two linear layers with a nonlinearity. The middle expands to `d_ff = 2048`, then projects back to 512. Shape after FFN: `[3, 512]`. Another residual connection adds this to the input of the second LayerNorm.

**Step 9: Repeat for all 12 layers.** Each layer takes the `[3, 512]` output of the previous layer and produces a new `[3, 512]` representation. By the final layer, each position's vector is a highly contextualized representation — no longer just "what is this token," but "what is this token in this context, at this position."

**Step 10: Output projection to vocabulary.** A final linear layer of shape `[512, 50000]` projects the `[3, 512]` hidden state to `[3, 50000]` — a score (logit) for every token in the vocabulary, at every position.

**Step 11: Softmax and sampling.** For next-token generation, we only care about the last position (position 3). Apply softmax to that row of logits to get a probability distribution over all 50,000 tokens. Sample from that distribution (using whatever strategy — greedy, top-p, temperature) to pick the next token. Append it to the sequence and repeat.

This is the entire core mechanism. The sophistication of modern models comes from scale (more layers, bigger dimensions, more parameters), tuning (better initialization, optimizers, regularization), and training data — not from radical architectural departures.

### Self-attention

Attention is the mechanism that lets a token's representation depend on the other tokens in the context. Each token projects into three vectors — query (Q), key (K), and value (V). The output for a given token is a weighted sum of the V vectors, where the weights come from the softmax of the dot product between the token's Q and every other token's K, scaled by the square root of the key dimension [^4].

Three subquestions usually come up here. They are worth answering carefully because the intuition compounds.

**Why the dot product?** The dot product `Q · K` is a measure of how aligned two vectors are. When two vectors point in the same direction, their dot product is large and positive. When they point in opposite directions, it is large and negative. When they are orthogonal, it is zero. In the context of attention, Q is asking "what am I looking for?" and K is advertising "here is what I offer." A high `Q · K` means "your offering matches my query." The model learns to shape Q and K projections so that this alignment captures the kind of relationships that help reduce next-token loss.

**Why softmax?** The raw dot products can be any real numbers. Softmax converts them into a probability distribution (non-negative, sums to 1), which is exactly what you want for a weighted average: the weights should be proportional, and they should sum to 1 so the output is a convex combination of the V vectors. Softmax also makes the operation differentiable and smoothly focuses attention on the most relevant keys without a hard cutoff.

**Why divide by √d_k?** This is the most subtle piece. Consider two random vectors of dimension `d_k`, each component drawn independently with variance 1. Their dot product is a sum of `d_k` products, so its variance scales with `d_k`. In other words, in a higher-dimensional space, dot products get bigger just by accident, not because of meaningful similarity. If pre-softmax scores are very large, softmax saturates — one entry is effectively 1, the rest effectively 0 — and the gradient through softmax becomes near zero. Training stalls. Dividing by `√d_k` rescales the scores back to unit variance so softmax stays in a productive regime [^4][^6].

Here is a concrete numerical example. Suppose `d_k = 64` and `Q, K` have unit-variance components. The dot product `Q · K` has variance 64, so its standard deviation is 8. Without scaling, pre-softmax scores for aligned vectors can easily hit values like 20 or 30, at which point `softmax([30, 2, 1])` is basically `[1.0, 0.0, 0.0]`. Divide by 8, and those scores become 3.75, 0.25, 0.125, and `softmax([3.75, 0.25, 0.125])` is roughly `[0.94, 0.04, 0.04]` — still concentrated on the right answer but retaining gradient signal for the others.

Causal masking — zeroing out attention from a token to future positions — is what makes a decoder "decoder-only." It enforces the autoregressive property: the representation at position *t* only depends on positions ≤ *t*. In practice, the mask is implemented by setting the upper triangle of the attention score matrix to `-∞` before softmax, so those entries contribute exactly zero probability.

### Multi-head attention

Instead of one attention computation at the full model dimension, multi-head attention splits the Q, K, V projections into multiple heads that attend in parallel subspaces, then concatenates and reprojects the results. The intuition in the original paper was that different heads can learn to track different kinds of relationships (syntactic, semantic, positional) without interfering with each other [^4]. In practice, interpretability work has shown that heads often specialize, though the picture is messier than a clean "head = feature" mapping [^7].

A worked example helps. With `d_model = 512` and 8 heads, each head operates in a 64-dimensional subspace. One head might learn to attend from pronouns back to their antecedents ("it" → "the cat"). Another might attend from verbs to their subjects. Another might attend to the first few tokens of the sequence (a kind of positional bias). Another might just attend to the current token itself (an "identity" head). By splitting the computation, the model can do all of these things in parallel without forcing a single attention pattern to be a compromise between multiple useful ones.

### Feed-forward network and residuals

After attention, each token's representation passes through a position-wise feed-forward network — typically two linear layers with a nonlinearity between them, expanding to roughly 4× the model dimension in the middle. The FFN is where a large fraction of the parameter count lives.

A useful mental model: attention moves information *between* positions; the FFN transforms information *within* a position. The FFN is effectively a 2-layer MLP applied independently to each token's vector. Interpretability work has suggested that the FFN layers function something like a key-value memory: the first linear layer acts as a set of learned "keys" (detecting patterns in the input), and the second acts as a lookup that retrieves associated content. This framing is debated and incomplete, but it gives you a handle on why FFN parameters encode so much of the model's factual knowledge.

Residual connections around both the attention and FFN sub-blocks are load-bearing. They give gradients a clean path backward through the stack, which is what makes deep transformers trainable at all [^4]. Without residuals, gradient signals at layer 1 in a 96-layer model would be the product of 96 Jacobians — any small shrinkage compounds exponentially. Residuals let gradients flow through the skip path unchanged, stabilizing training.

### Pre-norm vs post-norm

The original transformer applied LayerNorm after each sub-block ("post-norm"). Modern models almost universally apply it before ("pre-norm"), because pre-norm is more stable to train at large depths. The tradeoff is subtle — post-norm has slightly better asymptotic performance in some settings, but the training stability of pre-norm is worth it at scale [^6][^7]. This is one of those places where textbooks disagree on emphasis; treat pre-norm as the current default.

### Positional encodings

Self-attention is permutation-invariant by construction — if you shuffle the tokens, the attention computation produces the same set of outputs in a shuffled order. The model has to be told where each token sits in the sequence, and there are several competing approaches:

- **Sinusoidal (original)** — fixed position vectors added to token embeddings. Each position gets a unique vector built from sines and cosines at different frequencies [^4].
- **Learned absolute** — trainable position embeddings, used in GPT-2. Simple but does not generalize beyond the training sequence length.
- **RoPE (Rotary Position Embedding)** — rotates Q and K vectors by a position-dependent angle; widely used in recent models because it handles relative positions cleanly and generalizes better to longer contexts [^7].
- **ALiBi (Attention with Linear Biases)** — adds a static, position-dependent bias to attention scores; good extrapolation to longer sequences than seen in training.

The literature has not settled on a single winner. RoPE is the most common choice in open frontier models as of writing, but the space is actively evolving — don't assume a paper's positional scheme is the one a deployed model uses.

<AttentionHeatmap />

## Training dynamics

Knowing the architecture is half the picture. The other half is understanding what happens during training — because many behaviors engineers attribute to "the model" are actually consequences of the optimization process.

### What a training step actually does

At each step, the trainer:

1. Samples a batch of token sequences from the corpus (typically thousands of sequences, each up to a few thousand tokens long).
2. Runs them through the forward pass described above, producing logits at every position.
3. Computes the cross-entropy loss between the predicted logits and the actual next tokens.
4. Backpropagates gradients through every parameter in the network.
5. Updates parameters using an optimizer (almost always AdamW) with a carefully scheduled learning rate.

One training step on a frontier model touches billions of parameters. Billions of steps accumulate into a full training run. The total compute for a frontier model lives in the tens of millions of GPU-hours [^8].

### The shape of a healthy loss curve

When you plot training loss over steps, a healthy run looks like this:

```text
loss
  │\
  │ \
  │  \__
  │     \____
  │          \_______
  │                  \_____________
  │                                 \_________________________
  └───────────────────────────────────────────────────────────── steps
```

Steep drop early (the model learns trivial patterns: common n-grams, frequent tokens), then a long tail of slow, continuous improvement. The slope never quite goes to zero — more data and more compute continue to help, but with sharply diminishing returns.

A bad run looks different: the loss oscillates wildly, spikes upward, plateaus early, or goes NaN. Most pretraining failures show up here. "Loss spikes" during large-model training are notorious — recoverable if you rewind to a checkpoint, catastrophic if you don't. Much of the invisible work of training a frontier model is just keeping the loss curve monotonic.

### Why learning rate warmup

If you start with a large learning rate on a random-initialized transformer, gradients are huge and the model immediately diverges. If you start with a tiny learning rate, training is unnecessarily slow. The standard trick is *warmup*: start with a very small learning rate and linearly increase it over the first few thousand steps, then hold or decay it.

The intuition: at initialization, the model's predictions are random, so the loss gradient direction is noisy. Taking small steps in a noisy direction is safe. Once the gradients start pointing consistently at a better solution, you can take bigger steps. Without warmup, the first few updates blow the model far from any good region and it never recovers. This is one of those "infrastructure" details that feels trivial until you remove it and watch your run go NaN in 100 steps.

### Why the model memorizes some things and generalizes others

The training objective is next-token prediction on the training corpus. In principle, the model could memorize the entire corpus verbatim. In practice, it does a mix: it memorizes some things (famous quotes, common phrases, specific facts that appear many times) and generalizes others (grammatical patterns, reasoning structures).

What determines which? Roughly, how many times the pattern shows up and how compressible it is. A sentence that appears thousands of times with identical wording is cheap to memorize. A grammatical pattern that appears in millions of slightly different forms is cheaper to encode as a general rule than to memorize each instance. The model's parameters are a budget, and the training process allocates that budget to whichever encoding reduces loss most.

This has engineering consequences. Prompt injection works partly because some specific phrasings are much higher-probability completions than others. Data leakage from training sets works because rare strings that appeared verbatim can be regurgitated. Hallucination of specific facts often happens because the model learned a general pattern ("people have Wikipedia pages with birth years") more strongly than it learned individual facts ("this specific person's birth year").

### The cross-entropy loss, numerically

It helps to have a concrete sense of what the loss number means. Cross-entropy loss is `-log(P)` where `P` is the probability the model assigned to the correct next token. If the model assigned probability 1.0 (perfect confidence in the right answer), the loss is 0. If it assigned 0.5, the loss is ~0.69. If it assigned 0.01, the loss is ~4.6.

For a vocabulary of 50,000 tokens, a model that guesses uniformly at random has average loss `-log(1/50000) ≈ 10.8`. Healthy pretrained models on English text typically reach losses in the 1.5-2.5 range. That corresponds to an average assigned probability of roughly 8%-22% to the correct next token — which sounds low until you remember the vocabulary has 50,000 options, and the model is concentrating most of its probability mass on the handful of plausible continuations.

Perplexity, which you sometimes see reported instead of loss, is just `e^loss`. A loss of 2.0 is perplexity ~7.4, meaning the model is "as uncertain as if it were choosing uniformly from 7.4 options at each step." This is a more intuitive way to talk about the same quantity, though loss is what you actually optimize.

### Batch size, sequence length, and the compute budget

The compute per training step scales with `batch_size × sequence_length² × d_model × n_layers` (roughly — the attention term dominates at long sequences). This is why doubling sequence length quadruples attention cost. It is also why long-context models are expensive to train: every additional position in every attention layer costs the square.

Engineers often want to understand why context length is such an axis of model quality and cost. The answer is that attention scales quadratically in sequence length by construction. Innovations like flash attention, sliding-window attention, ring attention, and various sparse-attention schemes try to reduce this cost, but the fundamental `O(n²)` behavior is a ceiling that shapes model design at every level.

## Model size and scaling laws

Two papers define the shape of the conversation about scale.

Kaplan et al. 2020 established that language model loss follows smooth power laws in three variables: parameters, training tokens, and compute [^9]. Double any one of them in isolation and loss drops predictably. The paper's guidance suggested that parameter count should grow faster than data.

Hoffmann et al. 2022 — the Chinchilla paper — revised this, arguing that for a fixed compute budget, most models of the era were significantly undertrained. Their finding: parameters and training tokens should scale roughly in proportion. A "compute-optimal" model at a given FLOP budget is smaller and trained on more data than Kaplan's scaling curves suggested [^8].

### The Chinchilla math, made concrete

The Chinchilla paper's central empirical claim: for a compute-optimal model, the ratio of training tokens to parameters should be roughly 20:1. That is, a 70B-parameter model is compute-optimal when trained on roughly 1.4 trillion tokens. A 7B-parameter model is compute-optimal when trained on roughly 140 billion tokens [^8].

Why does this matter for engineers? Because it reframes how you read model announcements. If you see a new 7B model trained on 2 trillion tokens, that is dramatically over the Chinchilla-optimal point — the lab deliberately chose to spend extra compute on more data rather than on more parameters. The motivation is almost always inference cost: once deployed, every extra parameter costs memory, bandwidth, and latency at inference. If you can get equivalent quality at a smaller size by training longer, inference becomes cheaper per request.

This is why many frontier "small" models punch far above their weight class: they are overtrained relative to Chinchilla-optimal, exchanging training compute for inference efficiency. A 2026 7B model that was trained on multiples of its Chinchilla-optimal token count can outperform a 2020 175B model on many benchmarks, not because 7B is magically as capable as 175B, but because the compute invested per parameter was much higher.

### The three knobs you can turn

Think of the scaling-laws findings as three knobs. For a fixed downstream capability:

- **More parameters, same data.** Diminishing returns past the Chinchilla-optimal point. You pay at inference forever.
- **Same parameters, more data.** Continues to help for a surprisingly long time, eventually plateauing as the model approaches the irreducible loss of the data distribution.
- **More compute overall.** Lets you turn both knobs together. The optimal split depends on your objective: minimize pretraining cost, minimize inference cost, or maximize headline capability.

### The "emergent abilities" debate

The "emergent abilities" claim — that certain capabilities appear suddenly at scale rather than improving smoothly — was a popular framing [^10]. A subsequent critique argued that many apparent emergences are artifacts of discontinuous metrics (exact-match accuracy) rather than genuine phase transitions; under smoother metrics the same curves look smooth [^11]. The debate is not fully resolved, and it matters for how you reason about scaling — treat "it'll just emerge at the next size" as a hope, not a plan.

### What scaling does not buy

Even with perfect scaling, certain properties do not improve with size:

- **Knowledge cutoff.** A bigger model trained on the same data has the same cutoff date. Scaling does not give you access to post-cutoff information.
- **Prompt clarity.** If your prompt is ambiguous, a bigger model may interpret the ambiguity more "intelligently" but still cannot read your mind. Scaling does not fix ambiguous instructions.
- **Fact verification.** Bigger models have lower hallucination rates on average but still hallucinate. Scaling changes the rate, not the nature.
- **Calibration in unusual domains.** Models are more confident in their common-domain answers than uncommon ones, and the gap does not close nicely with scale.
- **Long-horizon reasoning.** Multi-step problems still degrade as the number of steps grows. Scaling helps but does not flatten the curve.

Treat these as structural limits. Engineering around them — retrieval, decomposition, verification — is more reliable than hoping the next generation will solve them.

::callout{type="warning"}
Do not budget your product roadmap on emergent abilities. If your feature requires a capability the current generation of models lacks, plan as if it will never appear. If it does emerge, treat it as upside, not baseline.
::

## Post-training

A raw pretrained model is a next-token predictor. It is not, out of the box, an assistant. It will cheerfully continue text, including continuing your instruction as if it were narration rather than following it. Post-training is what turns the base model into something that behaves like a product [^2].

To see the difference concretely, consider the prompt "What is the capital of France?" A raw base model, asked this with no other context, might complete it with "A. Paris   B. London   C. Madrid   D. Berlin   Answer:" — because the most common contexts in which that exact sentence appears in pretraining data are multiple-choice quiz questions. The base model is doing its job perfectly: predicting the highest-probability continuation. It just is not doing what you want. Post-training reshapes the distribution so that "What is the capital of France?" has a higher-probability continuation like "Paris is the capital of France" or similar.

### The three phases of modern post-training

The modern post-training stack has evolved through three major phases:

**Supervised fine-tuning (SFT).** Train the base model on a curated set of instruction–response pairs. This teaches it the shape of a helpful response — format, length, tone, the convention of actually answering the question. SFT alone can take a base model a long way, but it has a ceiling: it can only teach patterns present in the training data [^2][^7].

A typical SFT dataset might contain tens of thousands of examples like `{instruction: "Explain recursion to a beginner", response: "Recursion is when a function calls itself..."}`. Training on this dataset shifts the base model's distribution so that it continues instruction-shaped prompts with answer-shaped responses. Critically, SFT does not teach the model anything new about the world — it teaches the model to express what it already knows in a useful format.

**Reinforcement Learning from Human Feedback (RLHF).** Collect human preference judgments between pairs of model outputs, train a reward model to predict those preferences, then fine-tune the base model with reinforcement learning (typically PPO) against that reward [^12]. RLHF is what made GPT-3.5-era models feel markedly more aligned with user intent than pure SFT models. It is also expensive, unstable, and introduces its own failure modes (reward hacking, sycophancy, mode collapse on certain response shapes).

The conceptual leap in RLHF: instead of teaching the model to imitate good responses, you teach it to produce responses that humans prefer. These are different objectives. Imitation caps you at the quality of your demonstrators. Preference optimization can, in principle, exceed demonstrator quality if the reward model generalizes — though it often does not.

**Direct Preference Optimization (DPO) and successors.** DPO reframes preference learning as a direct supervised objective, eliminating the separate reward model and the RL loop [^13]. It is simpler to implement, more stable, and has become the default in many open-weights pipelines. Variants (IPO, KTO, ORPO, and others) continue to appear.

### What post-training actually changes

Post-training is also where safety behavior is installed — refusals, guardrails, style constraints. This is why the same base architecture can feel completely different depending on which lab shipped it. When a model "won't do X," the reason usually lives in post-training, not in the weights laid down during pretraining.

A practical test: if you have access to both a base model and its aligned counterpart, ask the same question with the same sampling parameters. The base model's answer will look like internet continuation — it may drift, hedge, or treat the prompt as the start of a longer document. The aligned model's answer will be shaped like an assistant response. Same underlying knowledge, different distribution over response formats.

::callout{type="info"}
When a model refuses a request, it is almost always post-training behavior, not a pretraining incapacity. The underlying model often "knows" how to do the thing — it has been trained not to. This distinction matters for prompt engineering, jailbreak analysis, and evaluation.
::

### Why post-training can degrade capabilities

An uncomfortable truth: aggressive post-training can make models worse at some tasks they were previously good at. This is sometimes called the "alignment tax." The mechanism: when you fine-tune a base model on a particular response distribution, you are shifting probability mass toward that distribution and away from other distributions. If the other distributions contained useful capabilities — a particular writing style, a domain-specific idiom, a kind of reasoning common in academic text — those capabilities can atrophy.

Labs work hard to minimize this, but the tradeoff is structural. A model that is highly tuned for polite, helpful, concise assistant responses will produce exactly that — even when you want it to write a messy, exploratory essay or generate raw creative prose. Engineers who have worked with both base models and their aligned counterparts often report a feeling that "something was lost" in alignment, even as "something was gained." Both are true.

### The role of system prompts in post-training

Post-training also installs sensitivity to system prompts. A well-aligned model follows system prompts more consistently than a poorly-aligned one. This is a learned behavior — the post-training dataset teaches the model that when text appears in a specific position or with specific markers, it should weight that context heavily. Engineers exploit this by using system prompts to install persistent behavioral constraints (tone, format, knowledge scope) without repeating them in every user message.

The failure mode: when a system prompt conflicts with a user message, different models resolve the conflict differently depending on how post-training weighted system vs. user instructions. Some models defer to system prompts nearly absolutely; others are more easily talked out of them. Knowing where your deployed model sits on that spectrum is part of deploying it responsibly.

## Sampling strategies

At inference, the model emits a distribution over the next token. Sampling is how you collapse that distribution into a choice. It is the last layer of behavior shaping between the weights and your user, and the settings you pick determine how deterministic, creative, or erratic the output feels [^2].

### Making the distribution concrete

To build intuition, consider what the distribution for a specific next-token choice actually looks like. Suppose the model has just processed "The capital of France is" and is about to predict the next token. A reasonable distribution over its 50,000-token vocabulary might be sharply peaked:

```text
Token            | Probability
-----------------|------------
" Paris"         | 0.87
" the"           | 0.04
" a"             | 0.02
" Paris,"        | 0.01
" located"       | 0.01
" one"           | 0.005
... (49994 more) | each < 0.005
```

The distribution is tight because the model is very confident. Now consider "Write a creative sentence about the ocean. The" — the model should be much more uncertain about what comes next:

```text
Token            | Probability
-----------------|------------
" ocean"         | 0.12
" waves"         | 0.08
" sea"           | 0.07
" tide"          | 0.05
" water"         | 0.04
" deep"          | 0.03
" vast"          | 0.03
... (49993 more) | long tail
```

The distribution is wider because many continuations are plausible. Sampling strategy choice is really a choice about how to navigate these two regimes — when the distribution is confident, be decisive; when it is uncertain, be appropriately varied.

### The strategies

**Greedy decoding.** Always pick the highest-probability token. Fully deterministic. Produces output that is often repetitive and bland, because the model's single most likely continuation is usually a safe, common phrase. Good for tasks where you want the most probable answer and nothing else — classification, extraction, structured output.

**Temperature.** A scalar applied to the logits before softmax: lower temperatures sharpen the distribution (closer to greedy), higher temperatures flatten it (more randomness). Temperature 0 is effectively greedy; temperature 1 samples from the raw distribution; temperature > 1 adds noise [^2][^7].

The math: given logits `z_i`, the probability of token `i` at temperature `T` is `softmax(z_i / T)`. Concretely, if the raw logits are `[3.0, 2.0, 1.0]`:

```text
T = 1.0  →  softmax([3.0, 2.0, 1.0])  ≈ [0.665, 0.244, 0.091]
T = 0.5  →  softmax([6.0, 4.0, 2.0])  ≈ [0.867, 0.117, 0.016]
T = 2.0  →  softmax([1.5, 1.0, 0.5])  ≈ [0.506, 0.307, 0.186]
T → 0    →  [1.0, 0.0, 0.0]   (collapse to argmax)
T → ∞    →  [0.333, 0.333, 0.333]   (uniform)
```

Temperature is a multiplicative dial on certainty. It does not add new possibilities; it reweights existing ones.

**Top-k.** Keep only the *k* highest-probability tokens, renormalize, sample from that restricted set. Simple and bounded, but the right *k* is context-dependent — a fixed cutoff that's generous on a high-entropy next token is way too permissive on a low-entropy one.

**Top-p (nucleus sampling).** Keep the smallest set of tokens whose cumulative probability exceeds *p*, then sample from that set [^14]. Adaptive to the shape of the distribution: narrow when the model is confident, wide when it isn't. Usually the default in production APIs, often combined with temperature.

Nucleus sampling solves a problem that plagued top-k: fixed `k` treats confident and unconfident distributions identically. With top-p at 0.9, the confident "Paris" distribution includes maybe 3 tokens (covers 94% probability in 3 tokens), while the uncertain "ocean" distribution might include 50 tokens before cumulative probability crosses 0.9. The set adapts to the model's confidence.

**Min-p.** A more recent alternative that sets a dynamic floor as a fraction of the top token's probability. Intuition: allow anything that's within a relative margin of the most likely choice. Proponents argue it's more robust than top-p at high temperatures. Less battle-tested than top-p; worth knowing about, not yet a default.

**Repetition and presence penalties.** Scalars that reduce the probability of tokens that have already appeared, either recently or at all. Useful for generation tasks where models tend to loop; can hurt when repetition is correct (code, structured data, lists with necessary repeats).

### A worked comparison

Concretely, the same prompt with different sampling behaves very differently:

```text
Prompt: "Write one sentence about the ocean."

temp=0.0, top_p=1.0  →  "The ocean is vast and mysterious, covering more than seventy
                         percent of the Earth's surface."
temp=0.7, top_p=0.9  →  "Waves unfurl against the shore in quiet, repeating arcs
                         that carry the weight of the open sea."
temp=1.2, top_p=0.95 →  "Somewhere past the breakers, a column of light falls
                         through plankton and nothing observes it fall."
```

All three are plausible continuations. None is the "correct" one — they sit in different regions of the same distribution. Notice the progression: at temperature 0, the output is factual, safe, cliché. At 0.7, it becomes more literary but still grounded. At 1.2, it becomes strange, specific, occasionally brilliant, occasionally incoherent. This is the classic quality-vs-diversity tradeoff, and where you want to sit on it depends on your product.

<TemperatureSampler />

::callout{type="info"}
Sampling parameters are a product decision, not a default. Classification: temperature 0. Creative generation: temperature ≥ 0.7 with top-p. Structured output with retries: low temperature, no top-p exotica. Pick deliberately.
::

## The probabilistic nature of AI

This is the piece that most often trips engineers coming from deterministic systems. A model with temperature > 0 will give different outputs for the same prompt. That is not a bug, not a caching problem, not a sign of something broken. It is the mechanism working as designed [^2].

### Why it feels wrong

Software engineers spend careers building deterministic systems. The same input produces the same output. When it doesn't, something is broken. LLMs invert this expectation: the same input produces a *distribution* of outputs, and picking one element from that distribution involves randomness.

The first instinct is to force determinism: set temperature to 0, pin every parameter, treat the model like a pure function. This works for some tasks. It fails for others, because temperature 0 is not actually deterministic in most APIs (floating-point nondeterminism in GPU operations creates small variations), and because many tasks genuinely benefit from variance — creative generation, exploration, diverse ideation.

A better mental model: treat the LLM as a stochastic policy. Engineers coming from reinforcement learning or robotics find this framing natural. The policy defines what the agent does given a state; the agent's actual behavior is sampled from that policy. Reliability comes from shaping the policy and validating its outputs, not from eliminating randomness.

### The compounding engineering implications

- **Evaluation needs statistics, not single runs.** One pass over a test set with temperature > 0 tells you almost nothing. You need multiple runs, variance estimates, and metrics that are robust to that variance.
- **Retries are a legitimate pattern.** If a model fails a structured-output constraint at temperature 0.3, retrying may succeed. This is not hiding bugs; it is using the distribution responsibly.
- **Structured output needs validators, not hope.** JSON mode, schema enforcement, and function calling push the distribution toward valid shapes, but the only way to guarantee a valid output is to validate and reject.
- **Determinism is available if you need it.** Temperature 0 is close to deterministic; setting a fixed random seed (where the provider exposes it) gets you closer. Know which parts of your pipeline need determinism and which benefit from variance.
- **Reproducibility is harder than it looks.** A deterministic result today may not be deterministic tomorrow if the provider updates the model, changes the tokenizer, or adjusts GPU kernels. Capture inputs and outputs for every critical evaluation.

The mental model to hold: the model is not computing an answer. It is sampling from a distribution conditioned on your input. Your job as an engineer is to shape the distribution through training, prompting, and retrieval, then collapse it safely through sampling and validation.

## Practical engineering: choosing a model size

A concrete decision you will face repeatedly: which model size do I use for this task? Here is a worked example of how to think about it.

### The task

Suppose you are building a support triage system. Incoming customer emails need to be categorized into one of 12 classes, and a short justification needs to be generated. Volume: ~10,000 emails per day. Latency: needs to return within 2 seconds. Budget: sensitive but not fixed.

### The questions to ask, in order

**1. Is this a task where raw capability is the bottleneck, or is the bottleneck elsewhere?** For a 12-class email classifier, the capability ceiling is not very high. Any instruction-tuned model above the 7B class can likely do this well if the prompt and training examples are good. This is not a task that requires frontier capability.

**2. What does the failure mode look like at each size?** A 7B model will sometimes pick the wrong class, especially for edge cases that straddle two categories. A 70B model will fail on fewer edge cases. A 400B model will fail on even fewer, but each of those ceilings is expensive to cross. For triage, small errors are often acceptable if you have a human-in-the-loop for high-stakes cases.

**3. What are the cost and latency profiles?** At 10,000 emails per day, the difference between a 7B model at $0.20 per million tokens and a 70B model at $3.00 per million tokens compounds fast. If each email plus justification averages 500 tokens in and 200 tokens out, that is 7 million tokens per day, or roughly $1.40/day on the 7B vs $21/day on the 70B. Over a year, that is $511 vs $7,665. Latency-wise, small models typically respond 3-10x faster than frontier models on the same hardware.

**4. Can you meet the quality bar with the smaller model plus engineering?** Often yes. Techniques that raise small-model performance: few-shot examples in the prompt, a retrieval layer that surfaces similar historical cases, structured output constraints, light fine-tuning on your labeled data. A 7B model with 10 in-context examples and a small fine-tune often matches an un-engineered 70B model on narrow tasks.

**5. What is the headroom on the task?** If accuracy goes from 91% to 94% by moving to a larger model, but the improvement matters, pay the cost. If accuracy goes from 91% to 91.5%, the engineering ROI is negative — spend that budget on better data, better prompts, or better validators.

### The decision

For this task, the right starting point is usually: the smallest instruction-tuned model you have access to that is at least 7B parameters, with a good prompt, a few-shot example set, and structured output. Run it at temperature 0 or very close. Measure quality against a held-out set with at least 500 labeled examples. If quality is below your bar, try better few-shot examples first, then a light fine-tune, then move up a size class only if engineering runs out of headroom.

The default mistake is the opposite: reach for the biggest model available, over-pay, over-latency, and never test whether the smaller model plus engineering would have sufficed.

### A second worked decision: coding assistant vs summarization

Consider two different products to see how the logic changes.

**Product A: a code completion assistant** for a developer IDE. Quality matters enormously — a wrong completion wastes the developer's time or ships a bug. Latency matters — anything over ~200ms feels sluggish. Throughput is moderate — one user at a time, many completions per session.

For this product, you probably want a mid-size model specialized on code, deployed on fast inference infrastructure. A 7B code-specialized model often outperforms a 70B general-purpose model on narrow code completion. The latency budget rules out the largest models. The quality bar rules out the very smallest.

**Product B: a nightly summarization job** that reads customer feedback across 100,000 entries and produces weekly theme reports. Quality matters but is judged against a human editorial review, not milliseconds. Latency is irrelevant — overnight batch. Throughput is the key constraint — the more tokens you process per dollar, the cheaper the job.

For this product, cost per token dominates. You probably want the smallest model that meets a quality bar, and you run it with batched inference during off-peak hours. You might accept slightly lower per-summary quality in exchange for dramatically lower per-job cost, and let the editorial review catch the errors.

The same framework — ask about quality ceiling, failure modes, cost, latency, and headroom — produces different answers for different products because the weights on each factor are different. Reach for the same decision tree regardless of the product, and you will make each decision with more discipline and less fashion.

### The hidden cost: ops and observability

One factor that usually goes under-counted: the operational cost of adding a model to your system. Every model in your stack needs observability — latency metrics, error rates, cost tracking, quality regression tests. A system that uses three different model sizes has three times the ops surface area. Before adding a second model "just for the hard cases," verify that the quality gain justifies the complexity of routing, evaluating, and monitoring two models instead of one.

A simple heuristic: if the quality gain from a bigger model is less than 20% on your task, it is usually better to invest in making the smaller model better. If the gain is more than 50%, the bigger model is probably worth its cost. The middle band is where careful analysis pays off — and where most premature optimization happens.

::callout{type="info"}
Model size is the first knob engineers reach for and the last knob they should turn. Try prompt engineering, retrieval, and fine-tuning before scaling up model size. The gains per dollar are dramatically higher at those layers for most production tasks.
::

## Common misconceptions

Engineers coming to LLMs from other parts of software often carry intuitions that work against them. These are the ones I see most often, and why they are wrong.

### "The model knows things"

It does not, in the way a database knows things. A model produces outputs by sampling from a learned distribution. When you ask "what is the population of Paris?" the model produces a token sequence that resembles answers it saw during training. Most of the time this recovers the right answer because most of the training data is roughly consistent. Sometimes it produces a plausible-sounding number that has no basis in any source, because the distribution is smooth and interpolates between remembered facts. This is not "lying" or "making things up." It is the underlying mechanism operating normally on a query that happened to land in a noisy region of the distribution.

The engineering consequence: for factual accuracy, do not rely on the model's memory. Retrieve the fact from a source, put it in the prompt, and let the model do what it is good at — synthesizing language around provided information.

### "Bigger model = better at my task"

Sometimes, but often not. A 70B general-purpose model may be worse than a 7B model fine-tuned on your domain. A frontier model with no retrieval may be worse than a small model with a good retrieval layer. The headline benchmark numbers are averages over tasks; your task is one specific slice, and the ranking can invert.

### "Temperature 0 means the output will always be the same"

Closer to true than at higher temperatures, but not guaranteed. Floating-point arithmetic on GPUs is not bit-exact across runs because parallel operations can execute in different orders. Minor numerical variations can push the argmax across a close boundary. In practice, temperature 0 gives you "mostly the same answer mostly" — good enough for reproducibility in most contexts, not a guarantee for audit-grade determinism.

### "The model reasons step by step when it uses chain-of-thought"

The model produces tokens that look like reasoning steps. Whether those tokens reflect an underlying computation the model would have done anyway, or whether the tokens themselves are what enables the final answer, is an active research question. Empirically, chain-of-thought prompts often improve accuracy on multi-step problems. That is enough to use them as an engineering tool. It is not the same as knowing the model is "thinking" in any deeper sense.

### "Fine-tuning teaches the model new facts"

Mostly, no. Fine-tuning adjusts the distribution over responses — it shapes *how* the model responds to certain inputs. It is very good at teaching format, style, domain-specific conventions, and in-domain response patterns. It is less good at injecting new factual knowledge, especially facts that contradict pretraining. For new facts, retrieval is almost always more effective and more controllable. Fine-tune for format and behavior; retrieve for facts.

### "Prompt engineering is hacking around a broken system"

Prompt engineering is interface design for a probabilistic system. When you work with a stochastic policy, the shape of your query is the primary lever you have. Calling this "hacking" is like calling SQL "hacking" a database. Engineers who internalize this build better systems.

### "If the model is wrong, the model is the problem"

Sometimes. Often, the model is accurately predicting the highest-probability completion given the prompt — and the prompt was ambiguous, incomplete, or conflicting. Before blaming the model, verify the prompt is asking the right question clearly, the retrieval is surfacing the right context, and the evaluation is measuring the right thing. When errors persist past those checks, you have learned something about the model; when they do not, you have learned something about your prompt.

### "Safety behavior is a solved problem"

Post-training installs refusals and guardrails, but these are probabilistic layers on a probabilistic system. Jailbreaks, prompt injection, and distributional edge cases continue to produce failures. Treat safety behavior as a defense in depth problem — system prompts, input filtering, output validation, monitoring, and human review all contribute. Do not assume the model's refusal behavior is a hard contract.

### "Context window = memory"

A large context window lets you put more tokens in the prompt. It does not give the model "memory" in any persistent sense — each request is stateless on the server side. The context window is a per-request budget for tokens, nothing more. If you want the model to remember things across requests, you build that memory externally: in a database, a vector store, a session cache, a retrieval layer. The model participates in the illusion of memory; it does not actually have any.

### "More context is always better"

It is not. There is a well-documented "lost in the middle" effect where models pay less attention to content in the middle of long contexts than at the beginning or end. A prompt that buries important instructions in the middle of 50,000 tokens of background text often underperforms a prompt with the same instructions and 2,000 tokens of targeted context. Context is a budget to spend wisely, not a dumping ground.

### "You can always chain multiple small models to replace a big one"

Sometimes. Often not. Chaining introduces error propagation — if each step is 90% reliable, three steps in series is 73% reliable, ten steps is 35%. For tasks that genuinely require holistic reasoning across a problem, a single pass through a capable model often beats a choreographed pipeline of smaller ones. Chain when the subtasks are clean and independently verifiable; do not chain when the task only makes sense as a whole.

::callout{type="warning"}
The most dangerous category of LLM failure in production is the plausible-sounding incorrect output. Engineers detect and handle obvious failures. Subtle fabrications pass through validators and reach users. Design for that failure mode specifically — with retrieval, with citations, with downstream verification — not as an afterthought.
::

## What's next

With the base layer in place, the next topics tighten the loop between model and product. **Prompt Engineering** covers how to shape the input distribution deliberately. **Evaluation** covers how to measure output quality when every run gives a different answer. Both assume the mechanics described here — read them as what you do *with* a foundation model, once you understand what it is.

The pattern repeats across every subsequent topic in this atlas: whatever layer of the stack you are working at, the question is the same — what distribution am I shaping, and what is the cheapest, highest-leverage place to shape it? Foundation models are the substrate. Everything else is how you make them useful.

## Sources

[^1]: Bommasani et al. 2021, "On the Opportunities and Risks of Foundation Models." Stanford CRFM.
[^2]: Huyen, AI Engineering, Ch. 2.
[^3]: Brown et al. 2020, "Language Models are Few-Shot Learners."
[^4]: Vaswani et al. 2017, "Attention Is All You Need."
[^5]: Hands-On Large Language Models, Ch. 1.
[^6]: Raschka, Build a Large Language Model From Scratch, Ch. 3-4.
[^7]: Hands-On Large Language Models, Ch. 3.
[^8]: Hoffmann et al. 2022, "Training Compute-Optimal Large Language Models" (Chinchilla).
[^9]: Kaplan et al. 2020, "Scaling Laws for Neural Language Models."
[^10]: Wei et al. 2022, "Emergent Abilities of Large Language Models."
[^11]: Schaeffer et al. 2023, "Are Emergent Abilities of Large Language Models a Mirage?"
[^12]: Ouyang et al. 2022, "Training Language Models to Follow Instructions with Human Feedback" (InstructGPT).
[^13]: Rafailov et al. 2023, "Direct Preference Optimization: Your Language Model is Secretly a Reward Model."
[^14]: Holtzman et al. 2019, "The Curious Case of Neural Text Degeneration."

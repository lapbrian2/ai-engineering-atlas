---
id: inference-optimization
order: 07
title: Inference Optimization
subtitle: Quantization, batching, KV cache, speculative decoding — the latency-quality-cost trilemma
topic: inference-optimization
difficulty: advanced
estimatedReadMinutes: 48
hero: false
primitives: [pareto-chart, quantization-calc]
citations:
  - { book: huyen-aie, chapters: "Ch. 9", topic: "inference optimization" }
  - { book: iusztin-labonne-handbook, chapters: "inference + deployment", topic: "production inference" }
  - { book: bouchard-production, chapters: "deployment chapters", topic: "production optimization" }
tags: [inference, quantization, kv-cache, speculative-decoding, throughput]
updatedAt: 2026-04-17
---

Training is where the model is built. Inference is where it pays for itself — or doesn't. For most production LLM systems the economics are inverted from the classical ML intuition: training happens once, inference happens forever, and the cumulative cost of serving dwarfs the one-time cost of training within weeks of launch [^1]. This topic is about the systems-level techniques that decide whether a model you've trained can actually be served at the latency, throughput, and unit economics your product requires.

The underlying tension never goes away: you can trade quality for latency, latency for throughput, and all of them for cost, but you cannot improve all four simultaneously without a genuine algorithmic win. Inference optimization is the craft of knowing which axis to compress on, for which workload, using which lever.

## The running example

Every concept in this topic will be grounded against a single working scenario. Pin it to the wall before reading further.

**The product.** A consumer chat application with a 13B-parameter instruction-tuned model as its primary backend. Roughly 10,000 daily active users at steady state, bursty during work hours, long tail of one-off sessions. Typical turn: ~400 input tokens of context and system prompt, ~200 output tokens of response. A subset of sessions carry long conversation history that balloons input length to several thousand tokens.

**The targets.**

- **p95 end-to-end latency under 2s** for the common turn. TTFT under 400ms so the stream visibly starts before the user's attention wavers.
- **$0.80 per 1M output tokens** as the cost ceiling for the rendered cost of serving — amortized hardware, not list cloud price.
- **Quality floor:** no regression on the internal task eval beyond a narrow, pre-agreed tolerance.

These three numbers are the whole game. Every lever in this topic either helps you hit them, breaks one of them to help another, or adds complexity without moving any of them. The discipline is refusing to deploy any technique you cannot justify against this table.

A few rough implications to internalize before the machinery arrives. At 10k DAU with, say, 8 turns per active user per day, you are serving roughly 80k requests/day — order of one request per second on average, with peaks likely 5-10x that. 200 output tokens per turn at $0.80/1M is $0.00016 per turn, or about $13/day of output-token cost at steady state — trivial in isolation, meaningful when compounded with prefill cost, GPU reservation, and tail overprovisioning. The 2s p95 is where the engineering concentrates: a 13B model served naively on a single GPU with static batching will blow through it on the first long prompt under load.

A second back-of-envelope that informs every downstream decision: a 13B model in BF16 is ~26 GB of weights. On an 80GB H100, that leaves ~54 GB for KV cache, activations, scratch buffers, framework overhead, and headroom for spikes. At GQA-8 with 40 layers, 40 heads, 128 head dim, BF16, each token of KV cache is roughly `40 × 2 × 5 × 128 × 2 = 102 KB` (where the `5` is the GQA group count, not the 40 query heads). 54 GB / 102 KB is about 530k tokens of KV budget, comfortably supporting hundreds of concurrent users at a few-thousand-token average context. Quantize weights to INT4 and you free another ~20 GB for KV or headroom; switch to a 70B model without quantization and you don't fit on the device at all. These numbers are why the order of optimizations in this topic starts with quantization and KV management — they directly control whether the workload fits, before any question of how fast it runs.

The rest of this topic is a tour of what you can do about that, in the order you should reach for the tools.

## Inference economics

Inference cost is not a single number. It is the product of a model (weights, architecture, context length), a workload (token distribution, concurrency, tail behavior), and a serving stack (hardware, scheduler, kernels). Changing any of the three changes the bill.

Three separate questions every serving system must answer [^1]:

- **How fast does a single request feel?** This is the latency axis — the user-perceived wait from send to complete.
- **How many requests can the cluster handle per second?** This is the throughput axis — the capacity the hardware actually delivers under load.
- **What does a million tokens cost?** This is the unit-economics axis — the price at which the product stays viable.

The traps are predictable. Teams optimize for one axis in a benchmark and discover the other two collapsed in production. A model served with batch size 1 has excellent latency and terrible throughput; the same model at batch size 64 inverts the story. The latency-quality-cost trilemma is not a slogan — it is a description of what happens every time you move a slider [^2].

A practical framing worth internalizing: **latency is a product requirement, throughput is a capacity requirement, cost is a business requirement, and quality is the constraint that bounds all three**. Optimization is the negotiation between them.

## The inference cost anatomy

To move the right levers you need a mental model of where the time and the money actually go. A single request splits into two phases with almost opposite cost profiles. Understanding this split is the prerequisite for understanding every optimization that follows [^1].

### Prefill: parallel, compute-dense

When a request arrives, the model first has to process the entire input prompt — every system-prompt token, every conversation-history token, every user-instruction token. This is the **prefill** phase. Because all input tokens are known up front, the model processes them in parallel: one large forward pass over the whole prompt, producing the KV cache entries for every layer and every input position, and emitting the first output token.

The computational character of prefill is a dense matrix multiply workload. For each transformer block, the model performs matmuls whose largest dimensions scale with the input sequence length. Attention itself has an additional quadratic component: each input token attends to every prior input token, so the attention score matrix is `L × L` where `L` is the prompt length. For short prompts this is invisible; for the long-context tail it becomes the single dominant cost per request.

Prefill saturates matrix units. A modern GPU running prefill on a non-trivial prompt is usually near its compute ceiling, not its bandwidth ceiling. The right mental model: prefill is a supercomputer-style dense workload that happens to be running inside a chatbot.

### Decode: sequential, bandwidth-dense

After prefill, the model enters the **decode** phase. It emits one token at a time, and each new token depends on all the tokens that came before it. The attention step reads every key and value in the KV cache — everything produced during prefill, plus everything produced so far during decode. Each step does a relatively small amount of compute (a single-token forward pass) against a large amount of state (weights plus KV cache).

That shape is the opposite of prefill. Decode is a memory-streaming workload: for each generated token, the accelerator has to read the model weights and the KV cache from HBM into compute units, do a tiny amount of arithmetic, and write the new KV entries back. The arithmetic intensity — FLOPs per byte of memory moved — is low, which means compute units sit idle waiting for memory. Decode is bandwidth-bound on every modern inference accelerator.

The gap between prefill and decode is not small. Prefill routinely achieves a meaningful fraction of peak tensor-core FLOPs. Single-request decode can run at a small fraction of peak, with the rest of the GPU burning power to wait for HBM. Closing that gap — via batching, via KV cache efficiency, via speculative decoding — is where the majority of the engineering effort in modern inference stacks lives [^1].

### One request, walked through

Take a concrete request from the running example: a 400-token prompt, a 200-token response, 13B parameters, served on a single H100. A stylized walkthrough of the compute:

1. **Request arrives.** Tokenization produces 400 input tokens. The scheduler admits the request to the current batch.
2. **Prefill step.** The model runs one forward pass over all 400 tokens. Per-layer matmuls scale with 400 in the sequence dimension. Attention for that pass has an `O(400^2)` score-matrix component per head, which is real but still small enough that the dense matmuls dominate total time. At the end of prefill, the KV cache contains `num_layers × 2 × num_heads × head_dim × 400` entries, and the model has emitted token #1 of the response. This is the TTFT.
3. **Decode loop.** For each subsequent output token, the model runs a forward pass over a single new token. The attention step for that token has to read the full KV cache: the 400 prefill positions plus however many decode positions have already been produced. Each decode step is cheap in FLOPs but dominated by the bandwidth cost of reading weights and KV cache.
4. **200 iterations later** the model emits an end-of-stream token (or hits the max-tokens cap). The request leaves the batch, its KV cache is released, and its slot becomes available for a new request.

The asymmetry is what you have to hold in your head as you read the rest of this topic. Everything that reduces prefill cost is matmul work — quantize activations, fuse kernels, chunk the prompt. Everything that reduces decode cost is memory work — shrink the weights, compress the KV cache, generate more than one token per forward pass.

### Where the time actually goes

For the running example — 400 input tokens, 200 output tokens on a 13B model — the rough time budget on a single modern accelerator breaks down something like this:

- **Prefill** is a single forward pass over 400 tokens. Dominated by the large dense matmuls in the feed-forward and attention projection layers; attention score computation is `O(L^2)` but still a modest share of total prefill time at this sequence length.
- **Decode** is 200 forward passes, each a much smaller compute but each paying the full cost of streaming model weights and KV cache from HBM. At a single-stream decode rate determined by `HBM_bandwidth / model_bytes`, the cumulative decode time across 200 steps dominates the total wall-clock time of the request when the batch size is 1.
- **Queue time and scheduling overhead** add a variable tax on top. On an underloaded stack this is small; on a loaded stack with badly-tuned batching it can dwarf the actual compute.

The interesting implication: for the common turn in the running example, decode is the headline cost. Every 10% reduction in ITL is roughly a 10% reduction in total latency for the common case. Every 10% reduction in prefill time matters mainly for the long-context tail, where prefill can grow to seconds. Which means the optimizations that help the common case are not necessarily the same as the ones that help the tail — and a well-designed stack has to hit both budgets simultaneously.

## Inference performance metrics

You cannot optimize what you cannot measure, and "latency" alone is too coarse to be useful. Modern serving is measured against a specific vocabulary [^1] [^2].

### Latency metrics

- **Time to first token (TTFT)** — the wall-clock delay from request submission to the first output token. Dominated by the prefill phase and by queue time waiting for a batch slot. TTFT scales roughly with input length and is what users feel as "is it thinking?"
- **Inter-token latency (ITL)** — the time between consecutive generated tokens during decode. ITL is what users feel as the stream's pace. Because decode is a synchronous step within the batch, ITL at any given moment is set by the slowest bottleneck in the active batch, not by any single request.
- **End-to-end latency** — the total time from request submission to final token, equal to `TTFT + (output_tokens − 1) × ITL_avg`. This is the number your product SLA is written against.
- **Queue time** — time spent waiting for a batch slot before prefill even begins. Often invisible in naive profiling and often the tail killer in practice.

### Throughput metrics

- **Tokens per second per user** — the streaming speed a single concurrent user observes. Roughly `1 / ITL`. This is the number that determines whether streaming feels fast or sluggish on the client.
- **System throughput (tokens/sec, cluster-wide)** — aggregate generation rate across all concurrent requests. This is what the serving cluster delivers, not what any individual user sees. The headline benchmark number most papers and blog posts report.
- **Requests per second** — how many full requests the system can accept and complete per wall-clock second at a given latency bound. This is the number that matters for capacity planning against DAU.

### Tail metrics

- **P50 / P95 / P99 latency** — the percentile cuts. Tail latency is what kills product experience; a P99 that's 10x P50 means one in a hundred users has a visibly broken session.
- **Tail ratio** — ratio of P99 to P50. A value near 1.5-2x is acceptable for most products; 5-10x is a signal that something is badly misbehaving (typically queueing, unbalanced batches, or long-context outliers sharing a batch with short requests).

### Cold vs warm paths

- **Cold start** — the first request to a replica after spin-up, when the model weights are not yet paged into HBM and the KV cache allocator is cold. TTFT on cold paths can be seconds regardless of prefill size. Cold starts are why autoscaling inference clusters is harder than autoscaling stateless web services: you cannot spin up a replica in response to the burst that is already here.
- **Warm path** — the steady-state behavior once weights are resident and the JIT/graph compile cache is hot. All published benchmark numbers are warm-path numbers. Assume nothing about your cold-path TTFT until you've measured it.

### Prefill / decode asymmetry

Prefill and decode have genuinely different cost profiles, and the metrics reflect it. Prefill is compute-bound — it processes the entire prompt in one shot and can saturate GPU matrix units. Decode is memory-bandwidth-bound — it generates one token at a time, reading the full KV cache and weights on every step. This asymmetry is the reason modern serving stacks treat the two phases separately and is the foundation for techniques like chunked prefill and disaggregated serving [^1].

A blunt but useful heuristic: if you care about TTFT, you are prefill-constrained. If you care about ITL and throughput, you are decode-constrained. Most production workloads are the latter, which is why most of the techniques below target decode.

<ParetoChart/>

## Hardware landscape

Inference performance is ultimately bounded by hardware, and two numbers matter more than any spec sheet headline: **memory capacity** (how large a model plus KV cache you can hold) and **memory bandwidth** (how fast the accelerator can stream those tensors to the compute units).

Decode-heavy workloads are memory-bandwidth-bound almost by definition: each token generation requires reading the model weights and the entire KV cache from HBM, performing a relatively small amount of compute, and writing back. When arithmetic intensity is low, compute units sit idle waiting for memory; in that regime, **bandwidth, not FLOPs, is the ceiling** [^1].

### Memory bandwidth as the decode ceiling

A back-of-envelope sanity check that is worth doing once and remembering: given a model of size `M` bytes and an accelerator with `B` bytes/sec of HBM bandwidth, the theoretical maximum per-sample decode rate is approximately `B / M` tokens per second, because each decode step has to stream the full model weights through HBM once. Batching amortizes that cost across requests in the batch, which is why batching is the single highest-leverage decode-side optimization. Quantization shrinks `M`, which is why quantization is the second. Any other technique that does not reduce `M` or increase `B` is fighting a more uphill battle.

### The accelerator families

The main accelerator families in production LLM serving:

- **NVIDIA GPUs** — A100 (Ampere) and H100 (Hopper) dominate training and inference. H100 adds native FP8 support via its Transformer Engine, which matters for post-training quantization pipelines. A100 has HBM2e; H100 has HBM3, with substantially higher bandwidth per device. Both live in the data center; consumer cards (RTX 40-series) are viable for smaller models and development. NVLink and NVSwitch provide high-bandwidth interconnects for multi-GPU serving of larger models.
- **Google TPUs** — v4/v5 used heavily internally and via GCP, with large on-chip memory and tight integration to JAX/PyTorch XLA stacks. TPU pods connect chips via fast interconnects into larger logical units for distributed serving. The software story is different from GPUs; the hardware economics at scale can be favorable for the right workload.
- **AWS Trainium and Inferentia** — Amazon's inference-optimized silicon accessible via EC2 and SageMaker, aimed at cost-per-token at scale. Neuron SDK handles model compilation; the economic story is attractive for steady-state inference where the team is willing to invest in the tooling path.

Every other axis — interconnect (NVLink, InfiniBand), host memory, disk — matters for distributed serving and model loading, not steady-state throughput. The constraint that actually limits a well-tuned serving stack is HBM bandwidth, and that is the one to check first when planning hardware [^1] [^2].

For the running example — a 13B model, mostly decode-heavy workload, p95 latency and $0.80/1M tokens — the choice of accelerator primarily changes the batch size at which you hit the cost and latency targets simultaneously. A higher-bandwidth chip with native FP8 lets you pack more concurrent users into a single device before either TTFT or ITL degrades. A lower-bandwidth chip with generous memory may still win on cost per token if you can amortize it across a large enough batch. Benchmark both on your actual traffic distribution before committing.

::callout{type="warning"}
**Published spec sheet numbers are peak numbers, not achievable numbers.** Peak HBM bandwidth assumes an idealized access pattern; real workloads hit 50-80% of that depending on kernel quality. Peak FLOPs assume fully saturated tensor cores; real workloads at realistic batch sizes hit a fraction of that in decode. Plan capacity against measured numbers on representative traffic, not marketing numbers.
::

## Model-level optimization

Model-level optimizations change the weights or the computation graph itself. They apply once and affect every subsequent request. Four families matter: quantization, distillation, pruning, and inference-time use of adapters.

### Quantization

Quantization maps high-precision weights (FP16/BF16) to lower-bit formats — INT8, INT4, or custom 4-bit types — trading some representational precision for smaller memory footprint and higher effective bandwidth. For decode-bound inference, this is often the single highest-leverage intervention because it simultaneously reduces the memory the weights consume and increases the effective token rate per unit of bandwidth [^1].

The first distinction that matters is **what is quantized**:

- **Weight-only quantization** compresses the model weights only; activations remain in the original precision. Memory footprint shrinks, HBM bandwidth consumed per decode step drops, and the dequant happens on the fly inside the kernel. This is the dominant choice for decode-heavy workloads because weights dominate HBM traffic there.
- **Weight + activation quantization** compresses both weights and activations, which allows the actual matmuls to run at reduced precision — not just the memory traffic. This is what accelerates prefill meaningfully, because prefill is compute-bound, and reduced-precision matmuls run faster on tensor cores that support them.

The second distinction is **when it is quantized**:

- **Post-training quantization (PTQ)** takes an already-trained FP16/BF16 model and compresses it using a small calibration set. No gradient updates. Fast, cheap, lossy in a controlled way.
- **Quantization-aware training (QAT)** bakes quantization into the training process, simulating the lower-precision arithmetic during forward passes so the model learns to be robust to it. Higher quality at low bit-widths, much more expensive.

For production serving, PTQ is almost always the starting point. You reach for QAT only when PTQ's quality loss is unacceptable and retraining is feasible.

#### The main PTQ families

- **GPTQ** (Frantar et al., 2022) — one-shot post-training quantization using approximate second-order information to minimize reconstruction error layer-by-layer [^3]. Concretely, GPTQ uses an Hessian-aware iterative scheme: it quantizes weights in a column-by-column order, using the inverse of the layer's Hessian (computed from calibration activations) to compensate downstream columns for the error introduced by earlier ones. This produces much better quality at 4-bit than naive rounding. GPTQ is a standard 4-bit PTQ baseline for open-weight LLMs.
- **AWQ — Activation-aware Weight Quantization** (Lin et al., 2023) — based on the observation that a small salient fraction of weights dominate quantization error because they correspond to outlier activations. AWQ identifies the per-channel activation magnitudes on calibration data and applies a mathematically equivalent scaling transform that protects the weights associated with high-magnitude activations, then quantizes the rest aggressively [^4]. The result is comparable or better than GPTQ on many models, with a cheaper offline step.
- **SmoothQuant** (Xiao et al., 2022) — migrates quantization difficulty from activations to weights via an offline mathematically-equivalent transform. The core insight: activation outliers are the main obstacle to INT8 activation quantization, but their magnitudes can be "smoothed" into the weights ahead of time via a per-channel scaling that preserves the forward-pass math. After smoothing, both weights and activations can be quantized to INT8 with modest quality loss, unlocking the prefill speedups that weight-only quantization cannot provide [^5].
- **FP8** — 8-bit floating point formats (E4M3 with 4 exponent / 3 mantissa bits, and E5M2 with 5 / 2) supported natively on H100 via the Transformer Engine and on newer accelerators generally. FP8 has a much wider dynamic range than INT8 at the same bit-width because the exponent lets it represent both tiny and huge values, at the cost of coarser relative precision. This matters because activation distributions in transformers routinely have a few extreme-magnitude channels that destroy INT8 accuracy; FP8 handles them gracefully without the calibration gymnastics INT8 requires. The Transformer Engine on H100 can dynamically choose per-tensor FP8 format and maintain the loss scaling that keeps the numerics stable [^1].

#### Worked example: what changes when you switch to FP8

Consider a matrix multiply inside an attention block during prefill. In BF16, each weight and activation uses 2 bytes; the matmul is performed at BF16 precision on the tensor cores. Switch to FP8:

- **Memory footprint halves.** Each element is 1 byte instead of 2. The HBM bandwidth consumed per matmul halves.
- **Tensor-core throughput roughly doubles** for the matmul itself on hardware with FP8 support, because FP8 matmul instructions have higher throughput than BF16 on the same silicon.
- **Dynamic range is preserved, relative precision is reduced.** A BF16 value has ~8 bits of mantissa; E4M3 has 3. That means rounding error per multiplication is bigger. For transformers this usually doesn't matter because the subsequent accumulation happens at higher precision (typically FP32) inside the tensor core.
- **Outlier behavior matters.** If a single channel has activations 100x larger than the rest, FP8 handles it because the exponent moves; INT8 would clip it. This is why FP8 is more forgiving than INT8 for transformer activations without calibration work.
- **Per-tensor scaling is required.** Each tensor gets a scale factor so that its values fit the FP8 dynamic range cleanly. The Transformer Engine handles this automatically based on observed activation statistics; rolling your own is where FP8 deployments usually go wrong.

The net effect: prefill that was compute-bound in BF16 becomes substantially faster in FP8, at the cost of a small amount of quality that you have to verify on your own eval. Weight-only quantization to INT4 stacks with this: FP8 activations × INT4 weights is the standard stack for modern H100 inference pipelines optimizing both prefill and decode simultaneously.

#### NF4 vs INT4

One more distinction worth pinning down. **NF4** (NormalFloat 4) is a 4-bit format designed by the QLoRA authors specifically for *training*: it maps to the quantiles of a standard normal distribution, which is the theoretical optimum for normally-distributed weights. NF4 is excellent for LoRA fine-tuning on a quantized base model because gradient flow through the dequantized weights is well-behaved. For inference serving, **INT4** via GPTQ or AWQ is the standard choice because the kernels are more widely optimized and the quality-on-eval is typically equivalent once calibration is done well. The rule of thumb: NF4 for training, INT4 for serving.

<QuantizationCalc/>

::callout{type="warning"}
**Quantization quality depends on the model, calibration data, and task — do not trust benchmark numbers from a different model.** A method that preserves quality on one architecture can silently regress on another. Run your own eval on your own data before shipping a quantized model, every time [^1].
::

### Distillation, pruning, LoRA at inference

Quantization is the most important model-level lever but it is not the only one.

- **Distillation** — train a smaller "student" model to mimic a larger "teacher." The resulting student is cheaper to serve and often recovers most of the teacher's quality on the distilled task distribution. Used extensively in production where the deployed model is a task-specific distillate of a much larger frontier model [^1]. The student's inference cost is a straightforward function of its size; the expensive part is the distillation training run itself. Distillation is the right move when quantization has been pushed as far as it will go and you still need more efficiency.
- **Pruning** — remove weights or structured blocks that contribute little to outputs. Structured pruning (heads, layers, channels) yields real speedups because it shrinks the dense matmul dimensions that the hardware actually executes. Unstructured sparsity — removing individual scalar weights — is theoretically attractive but hard to accelerate on standard GPUs without specialized sparse kernels; it usually shows up as a memory-footprint win without a corresponding speed win. NVIDIA's 2:4 structured sparsity (two of every four contiguous weights are zero) is the commercially viable middle ground on Ampere and later.
- **LoRA adapters at inference** — two options. **Merge** the adapter into the base weights for zero added latency, producing a task-specific checkpoint. Or **keep adapters separate** and serve multiple adapters against a shared base model, swapping per-request. The latter enables multi-tenant serving from a single loaded base, at the cost of managing adapter routing and the small overhead of the extra matmul. Frameworks like vLLM and TGI have first-class support for multi-LoRA serving, which is the right architecture when you have dozens of per-customer fine-tunes of a common base.

The unifying principle: every model-level optimization spends quality (or training-time work) to buy inference efficiency. Measure the quality cost on *your* eval, not the published benchmark.

## KV cache and PagedAttention

Transformer decoding generates one token at a time, and each step's attention computation needs the keys and values from every previous position. Recomputing them is catastrophically wasteful — instead, they are stored and reused: the **KV cache** [^1].

### Layout and cost

A standard transformer KV cache scales as:

```
KV cache bytes = batch_size
               × num_layers
               × 2                    // K and V
               × num_heads
               × head_dim
               × sequence_length
               × bytes_per_element
```

For a 13B-class model with, say, 40 layers, 40 heads, 128-dim heads, serving 64 concurrent requests with average sequence length 1024 in BF16 (2 bytes), the KV cache alone is:

```
64 × 40 × 2 × 40 × 128 × 1024 × 2 bytes
= ~54 GB
```

That is larger than the model itself at 13B parameters × 2 bytes = ~26 GB. At long contexts and high concurrency, this number rivals or exceeds the weight footprint — and, critically, it is per-batch, not shared. KV cache memory management, not compute, becomes the practical ceiling on concurrent users per GPU.

### Naive allocation and the fragmentation problem

The straightforward way to implement a KV cache is to pre-allocate a contiguous slab per request sized for the worst-case sequence length. If any request might reach 4096 tokens, every slot reserves 4096 tokens' worth of KV memory, even if the actual request only uses 200. Under realistic traffic — a mix of short and long sequences — the slots are mostly empty space, and the cluster runs out of memory before it runs out of compute [^6].

Fragmentation comes in two forms:

- **Internal fragmentation** — reserved capacity within a slot that goes unused because the request didn't reach max length.
- **External fragmentation** — gaps between freed slots that are too small to host a new request but aggregate to significant wasted memory.

On a 40GB or 80GB HBM budget, naive allocation routinely wastes 40-60% of KV memory to fragmentation, which directly caps achievable concurrency.

### PagedAttention

**PagedAttention** (Kwon et al., 2023), the technique introduced with vLLM, borrows the virtual memory paging idea from operating systems [^6]. KV cache is stored in fixed-size blocks (typically 16 or 32 tokens per block) that need not be contiguous in physical HBM. Each request maintains a block table mapping logical sequence positions to physical block addresses. Attention kernels are rewritten to read from the block table rather than a contiguous buffer.

The consequences:

- **Fragmentation nearly disappears.** Blocks are fixed-size, so any freed block is a viable home for any new request. Internal fragmentation is bounded by the block size (typically small) rather than by the worst-case sequence length.
- **Memory sharing becomes possible.** Multiple requests that share a prefix (e.g., the same system prompt) can share the underlying blocks, with copy-on-write semantics when their sequences diverge. For workloads with heavy prefix reuse — RAG systems, chat applications with a long fixed system prompt, few-shot prompts reused across users — this is a large memory win on top of the fragmentation fix.
- **Dynamic growth is cheap.** Adding a new token just allocates a new block when the current one fills up. No copying, no reallocation of contiguous regions.

PagedAttention is now standard in vLLM, has been adopted by TGI and SGLang in their own forms, and is the main reason a 13B model can reasonably serve hundreds of concurrent requests on a single H100. For the running example, this technique alone is typically the difference between "requires four GPUs" and "fits on one" at the target concurrency.

### Prefix caching

Built on top of PagedAttention is **prefix caching**: keep the KV blocks for a commonly-reused prefix alive across requests so subsequent requests starting with the same prefix skip the prefill work for that portion entirely. The hit path becomes: new request → match prefix against the cache → reuse KV blocks for the matched tokens → only prefill the tail. For the running example with a long fixed system prompt, this cuts TTFT on warm-cache paths by most of the prefill time. Prefix caching is a standard feature in modern serving stacks and should be on by default for any workload where the prefix is substantially reused.

## FlashAttention: IO-aware attention

Closely related to KV cache management but focused on the attention computation itself is **FlashAttention** (Dao et al., 2022), which rewrites the attention kernel to be IO-aware — tiling, recomputation, and careful use of SRAM to minimize reads and writes to HBM [^7]. FlashAttention changes the wall-clock time of attention without changing its mathematical result; it is a kernel-level optimization that became foundational to both training and inference.

### The problem with naive attention

Standard attention computes `Q K^T`, applies softmax, and multiplies by `V`. The naive implementation materializes the full `L × L` attention score matrix in HBM. For long sequences this is:

- **Memory-wasteful.** The score matrix can be larger than the activations themselves and never serves any purpose outside the immediate softmax.
- **IO-heavy.** The score matrix is written to HBM and then immediately read back, consuming bandwidth.

The naive compute scales quadratically with sequence length; worse, the *memory traffic* also scales quadratically, which is usually the real bottleneck before the arithmetic is.

### What FlashAttention does

FlashAttention tiles the attention computation so that the full score matrix is never materialized in HBM. The kernel loads blocks of `Q`, `K`, and `V` into on-chip SRAM, computes partial softmax statistics (running maximum and exponent sum) in SRAM, multiplies into `V` to accumulate output tiles, and writes only the output back to HBM. The score matrix lives entirely in SRAM and is recomputed during the backward pass rather than stored.

The mathematical trick is the **online softmax**: the softmax over a sequence can be computed incrementally as new blocks arrive, keeping running statistics that let the algorithm combine partial results without needing to see the full score vector at once. This is what makes the tiling possible without breaking the softmax normalization.

The result: **attention memory traffic scales linearly with sequence length, not quadratically**, because the only thing ever written to HBM is the input and output — never the intermediate score matrix. The arithmetic count is unchanged (still `O(L^2)`); the bandwidth cost drops to `O(L)`. On realistic hardware, bandwidth is the binding constraint, so this translates to a substantial wall-clock speedup and — more importantly — makes long-context attention feasible without blowing the memory budget.

### FlashAttention-2

FlashAttention-2 (Dao, 2023) refines the partition across thread blocks, reduces non-matmul FLOPs, and improves parallelization along the sequence dimension. The algorithmic core is the same; the gains are from better hardware utilization on Ampere and Hopper generation GPUs [^8]. FlashAttention-2 is what most current inference stacks integrate.

### FlashAttention-3

FlashAttention-3 (Shah et al., 2024) targets the specific capabilities of H100: asynchronous execution via the Tensor Memory Accelerator, warp-group matmul instructions (WGMMA), and native FP8 support. It pipelines the attention computation across the asynchronous units so that data movement and compute overlap tightly, pushing attention throughput closer to the peak the hardware can support [^9]. For an H100-based serving stack, FlashAttention-3 kernels are the current best-in-class.

For the running example, FlashAttention-2 or -3 is not optional. It is how long-context prefill finishes in under the TTFT budget when the occasional user turns up with a 4000-token conversation history. Every production serving framework mentioned in this topic ships FlashAttention integrated by default.

## Continuous batching (Orca)

A single decode step underutilizes modern GPUs — one token of generation does not come close to saturating the matrix units. Batching amortizes the cost of reading weights across multiple requests. The batching scheme you choose changes throughput by a large multiple [^1] [^2].

### Static batching and its failure mode

**Static batching** forms a batch, runs it to completion, forms the next batch. Simple. Terrible for LLM serving because requests finish at different times: a batch waits on its slowest member while faster requests sit idle. Under the running example's workload — a mix of 50-token responses and 500-token responses in the same batch — the 50-token requests complete in a tenth of the time and then wait nine times their own duration for the slow requests to finish. During that wait, their slot produces nothing.

Worse, static batching blocks new arrivals from joining the batch until the current one is fully complete. On bursty workloads this means every arrival during a long-running batch sits in the queue, inflating TTFT well past any prefill-based expectation.

### Continuous batching

**Continuous batching** — also called *in-flight batching* or *iteration-level scheduling* — batches at the token level rather than the request level. Each iteration, completed sequences leave the batch and new requests join. Introduced in the Orca paper (Yu et al., 2022) [^10]. The scheduler's job changes from "form a batch, run it to completion" to "on each forward pass, decide which requests are in the batch this step," taking into account memory constraints, fairness, and any arrival queue.

The effect on bursty, mixed-length workloads is the one that shows up in the literature: continuous batching delivers 3-5x higher throughput than static batching on realistic LLM workloads, depending on the variance in sequence lengths and arrival patterns, because the GPU is productive on every iteration rather than waiting on the slowest in-flight request [^10]. Critically, it also shortens queue time dramatically: a new request can join the batch on the next iteration rather than waiting for the current batch to drain.

Continuous batching is now the default scheduling policy in every modern serving framework — vLLM, TGI, SGLang, TensorRT-LLM. It is rarely worth the engineering effort to implement a custom scheduler; the return on investment comes from picking a framework that implements it well and from configuring its batch-size and memory-fraction knobs for your workload.

For the running example, continuous batching is the single largest throughput-side win available. At 10k DAU with bursty arrivals, the difference between static batching (requests wait for a full batch to complete before joining) and continuous batching (requests join on the next forward pass) is the difference between p95 queue times in the multi-second range and p95 queue times near zero. No amount of per-request optimization compensates for bad scheduling; no amount of scheduling compensates for bad per-request kernels. You need both.

::callout{type="warning"}
**Continuous batching interacts with p99 latency in non-obvious ways.** When the batch is full and new requests arrive, they wait. When memory is the binding constraint (long contexts, high concurrency), new requests may be evicted or preempted. The scheduler's policy — FCFS vs priority vs fair — determines tail behavior. Measure p99 under realistic burst and mixed-length load, not just steady-state throughput.
::

## Speculative decoding

Decode is sequential: token N+1 depends on token N. That serial dependency is the headline reason decode runs far below peak FLOPs on modern hardware — each step has to wait for the previous one to finish before it can start. **Speculative decoding** breaks the dependency by using a small, fast *draft model* to propose several tokens ahead, which the large *target model* then verifies in parallel in a single forward pass [^11] [^12].

### The algorithm

1. **Draft phase.** A small, fast model (the *draft model*) generates `k` candidate tokens autoregressively. The draft model is cheap, so this is fast even though it is serial.
2. **Verification phase.** The target model runs a single forward pass over the proposed `k+1` positions (the prior context plus the `k` draft tokens), producing the target distribution at each position.
3. **Accept/reject.** For each draft token, a rejection-sampling step compares the target model's distribution to the draft's. Tokens where the target distribution is at least as likely are accepted outright. Tokens where the target distribution is less likely are accepted probabilistically, such that the overall sampling distribution matches the target model exactly. On the first rejection, the algorithm commits all accepted tokens up to that point plus one corrected token sampled from a residual distribution, then returns to step 1.

The critical property, proved in the Leviathan et al. paper: **the output distribution is identical to the target model's own distribution**. Speculative decoding is a lossless speedup, not an approximation [^11]. The sampling distribution is preserved exactly when the verification is done correctly, because the rejection-sampling step is constructed to make it so.

### Expected speedup

Let `α` be the expected acceptance rate — the average fraction of draft tokens accepted per round. The per-round cost is one full target forward pass (for verification of `k+1` positions) plus `k` draft forward passes. The per-round output is roughly `1 + αk` accepted tokens in expectation. The speedup over pure target decoding is approximately:

```
speedup ≈ (1 + αk) / (1 + k × (draft_cost / target_cost))
```

When the draft model is much cheaper than the target (`draft_cost / target_cost` small) and agreement is high (`α` close to 1), the speedup approaches `1 + k`. When agreement is poor or the draft is not cheap enough, the speedup collapses toward 1 or even below — you can make things slower if you get the pairing wrong [^11] [^12].

The technique only helps when the draft model agrees with the target model often enough that the amortized cost of drafting + verifying is lower than pure target-model decoding. That condition is workload-dependent, which is why published speedup ratios vary across models and tasks and should not be quoted out of context. Typical production speedups on chat workloads with a well-matched draft are in a meaningful multi-fold range; speculative decoding alone is one of the highest-leverage decode optimizations available after quantization and KV cache management.

### Medusa

**Medusa** (Cai et al., 2024) replaces the separate draft model with multiple lightweight decoding heads attached directly to the target model [^13]. Each Medusa head is trained to predict tokens at a future offset given the same hidden state — head 1 predicts token `t+1`, head 2 predicts `t+2`, and so on. Candidate next-token sequences are assembled from the top-`k` predictions of each head, organized into a tree whose branches represent alternative continuations. A single target forward pass with a tree attention mask can verify all branches simultaneously, and the longest accepted prefix is committed.

Medusa has two attractions over classical speculative decoding. First, there is no separate draft model to serve, which simplifies the deployment topology. Second, the heads share the target model's hidden states, which makes agreement inherently higher — the heads are trained to predict what the target would predict, rather than approximating it from a separate parameter set. The tradeoff is the offline work: the heads must be trained on top of the target model, which is cheap relative to full training but is not zero.

### EAGLE

**EAGLE** (Li et al., 2024) takes a different angle: instead of predicting tokens, predict the *features* (penultimate-layer hidden states) of the target model and then use the target's language-model head to turn those features into token probabilities. EAGLE's draft is an autoregressive feature predictor conditioned on the target model's own past features, which makes its predictions correlate tightly with the target model's behavior [^14]. EAGLE-2 and EAGLE-3 refine the tree search and scaling behavior. On many chat workloads EAGLE reports higher acceptance rates and correspondingly higher speedups than vanilla speculative decoding.

The three techniques — classical speculative decoding, Medusa, EAGLE — occupy different points on a complexity-vs-speedup tradeoff. For the running example, the right starting point is classical speculative decoding with a small draft model (e.g., a 1B companion to the 13B target), because the implementation is standard across serving frameworks and the expected speedup on a typical chat workload is in the useful range. Move to Medusa or EAGLE if speculative decoding does not hit the ITL target and you're willing to pay the training cost.

### Draft-target pairing in practice

The expected acceptance rate `α` is the single most important tunable in any speculative decoding deployment. Three ways it goes wrong in practice:

- **Family mismatch.** Using a draft from a different model family than the target (e.g., a 1B from one vendor drafting for a 13B from another) typically gives poor acceptance because the token distributions diverge. Prefer drafts from the same family, trained on similar data.
- **Quantization mismatch.** If the target is quantized to INT4 but the draft is in BF16, their distributions diverge in subtle ways and acceptance drops. Quantize both to compatible precisions before measuring.
- **Temperature mismatch.** Speculative decoding's acceptance math assumes both models are sampled at the same temperature. Sampling the target at one temperature and the draft at another silently breaks the distribution-preserving property. Keep them in sync.

The acceptance rate should be logged as a first-class metric of any speculative decoding deployment. If it drops — because of a model update, a quantization change, a prompt-distribution shift — the effective speedup collapses and the stack quietly degrades to something slower than pure target decoding in the worst case.

## Chunked prefill

Prefill and decode have opposing profiles — prefill is compute-dense, decode is memory-bandwidth-bound — so running them together naively wastes one or the other. **Chunked prefill** splits long prompts into smaller chunks and interleaves them with decode steps, keeping both the compute units and the memory pipeline busy [^1].

### The problem

On a long-context request, prefill can take hundreds of milliseconds or more. While prefill is running, decode for other in-flight requests stalls, because the scheduler cannot fit a prefill pass and a decode pass into the same iteration efficiently without interference. The result is spiky ITL for ongoing decode streams every time a long-prefill request arrives, and long TTFT for the arriving request itself because it has to wait for whatever else the scheduler has already committed to.

### Chunked prefill

Chunked prefill takes the long prompt and splits it into fixed-size chunks (e.g., 512 or 1024 tokens each). Each iteration, the scheduler runs one chunk of prefill *plus* the usual decode step for in-flight requests, packed into a single forward pass. The in-flight decode streams continue to emit tokens while the new request's prefill progresses piecewise. When the last chunk finishes, the new request joins the regular decode rotation.

The benefits:

- **Smoother ITL for in-flight requests.** Decode no longer stalls behind full prefill passes; it advances every iteration, including during prefill of a new arrival.
- **Better GPU utilization.** The combined chunk-prefill-plus-decode pass uses more of the tensor cores and memory bandwidth per iteration than either alone, because the two workloads have complementary bottlenecks.
- **Predictable TTFT under load.** The arriving request's TTFT becomes `chunk_size / throughput + one_decode_step` per chunk rather than a single blocking full-prefill pass.

The cost is scheduler complexity: the framework has to choose chunk sizes, decide how aggressively to co-schedule chunks with decode steps, and manage the memory of a partial KV cache during prefill. This is done well in vLLM and TGI's recent versions; it is one of the reasons their long-context latency profiles are substantially better than older serving stacks.

### Disaggregated serving

An adjacent technique, sometimes confused with chunked prefill and sometimes deployed alongside it, is **disaggregated serving**: physically separating prefill from decode onto different GPU pools. Prefill workers run on hardware optimized for compute throughput; decode workers run on hardware optimized for memory bandwidth; the KV cache is transferred between them over a fast interconnect after prefill completes. This lets each phase be provisioned and scheduled independently — the prefill pool autoscales with prompt arrival rate and length distribution, the decode pool autoscales with active conversation count. For large-scale deployments this can substantially improve both average and tail latency because the two phases no longer compete for the same physical resources. It adds operational complexity (two pools to manage, a KV transfer protocol to engineer) and is usually overkill for workloads at the running example's scale, but it is the direction serious production stacks are headed as context lengths grow.

## Attention memory: MQA and GQA

The KV cache size scales with `num_heads`, which means any reduction in heads is a direct reduction in KV memory. Two architectural variants have become standard for controlling this.

### Multi-head attention (MHA)

Standard transformer attention uses one key-head and one value-head per query-head. Each head has its own learned projection, its own attention pattern, and its own contribution to the KV cache. For a model with 40 heads, the KV cache stores 40 K tensors and 40 V tensors per layer per sequence position. This is maximal expressiveness and maximal memory.

### Multi-query attention (MQA)

**Multi-query attention** (Shazeer, 2019) shares a single K and single V across all query heads. The queries are still per-head; the keys and values are one-per-layer. The KV cache shrinks by a factor equal to the number of heads — 40x in the example above. This is a substantial memory win that also reduces the memory bandwidth consumed per decode step, which as established is the binding constraint.

The downside: MQA reduces the expressive capacity of attention, and on many models this shows up as a quality regression if applied to a pretrained MHA model without retraining. MQA works best when trained into the model from scratch.

### Grouped-query attention (GQA)

**Grouped-query attention** (Ainslie et al., 2023) is the middle ground [^15]. Instead of all heads sharing one K/V (MQA) or each head having its own (MHA), GQA groups heads — say, 40 query heads sharing 8 K/V pairs, giving each K/V pair a group of 5 query heads. The KV cache shrinks by the group ratio (5x in this example) rather than the full head count, and the quality cost is much smaller than MQA because each group gets its own attention pattern.

GQA is the default in most current open-weight models at the 7B-70B scale: Llama 2 70B, Llama 3, Mistral, many others. For a serving stack, GQA changes the KV cache sizing calculation directly: a 13B model with GQA group ratio of 8 has an 8x smaller KV cache per token than the same model with standard MHA, which directly translates to 8x more concurrent users at the same memory budget, up to the other constraints.

For the running example, if the 13B model is MHA, the KV cache bill at realistic concurrency is substantial; if it is GQA-8, it is comfortable. This is the kind of architectural choice that often matters more for serving economics than any downstream optimization.

### KV cache quantization

A complementary lever to attention grouping is quantizing the KV cache itself. The KV cache is a large fraction of HBM traffic during decode; compressing it from BF16 to INT8 halves both its storage footprint and its bandwidth consumption per step. Several frameworks now support per-channel or per-token KV quantization with minimal quality impact, particularly for the V tensors (which are less sensitive to quantization error than Q/K). Aggressive KV quantization — INT4 or lower — is an active research area; results are model-dependent and should be evaluated carefully before shipping. For the running example, INT8 KV cache on top of INT4 weights is the standard modern configuration and typically buys meaningful concurrency headroom at minimal quality cost.

### Sliding window attention

For models trained with it, **sliding window attention** (used in Mistral's architecture, among others) bounds each token's attention to a fixed-size window of recent positions rather than the entire prior sequence. The KV cache for a sliding-window model is bounded by the window size, not the full context length, so long contexts become dramatically cheaper to serve. Sliding window has to be baked into the model at training time — you cannot retrofit it onto a standard transformer — but where it is available, it is one of the more dramatic long-context serving wins.

## Routing and cascade architectures

Not every request needs the biggest model. A well-designed serving architecture routes requests to the cheapest model that can handle them, falls back to larger models when necessary, and caches aggressively to avoid recomputation entirely. These are application-level optimizations that sit above the single-model serving stack but often dominate end-to-end cost.

### Cascade models

A **cascade** routes every request first to a small, cheap model. The cheap model either answers directly or, based on a confidence signal (log-probability of its answer, classifier on top of its output, length/complexity heuristic on the question), escalates to a larger model. The escalation rate determines the blended cost per request: if the cheap model handles 70% of traffic at 1/10th the cost of the large model, the blended cost is `0.7 × 0.1 + 0.3 × 1.0 = 0.37` — a 2.7x cost reduction at equivalent end-to-end quality [^1].

Cascades work when (a) a meaningful fraction of traffic is handleable by a cheaper model, (b) a cheap and reliable confidence signal exists for the cheap model, and (c) the latency of the two-step path for escalated requests is still within budget. All three are empirical conditions to verify on your own workload.

### Semantic caching

**Semantic caching** stores (query embedding, response) pairs and, on new queries, retrieves by embedding similarity. If the retrieved cache entry is similar enough to the new query, the cached response is returned directly. This is zero-cost beyond the embedding lookup, and for workloads with heavy query repetition — FAQ-style interactions, support, onboarding — it can eliminate a large fraction of LLM calls entirely.

The gotchas are the ones you'd expect. Cache staleness: if the underlying knowledge changes, the cache returns stale answers until invalidated. False hits: if the similarity threshold is too loose, semantically similar but different queries get the wrong answer. The right threshold is workload-dependent and should be tuned against a held-out set of pairs that *should* match versus pairs that should not.

### Mixture of specialists

A **mixture of specialists** routes each request to a model specialized for its task: a code model for code, a medical model for medical questions, a general model for the rest. The router can be a small classifier, a keyword matcher, or a lightweight LLM itself. Versus a single large model, the advantage is that each specialist can be smaller than a single generalist would need to be to cover the same tasks at the same quality. The disadvantage is operational: more models to train, maintain, fine-tune, and monitor. For narrowly-scoped products, specialists win; for products whose surface area is genuinely general, a single well-served frontier model usually wins on total system cost once operational overhead is counted.

Cascade, cache, and specialists compose: a production inference architecture often has a semantic cache in front of a cascade whose tail routes across multiple specialist models. Each layer is evaluated against the latency/quality/cost table separately, but the savings multiply.

### Distributed serving

For models that do not fit on a single accelerator — or for workloads whose throughput requirements exceed a single device — you split the model across multiple GPUs. Three schemes matter in practice:

- **Tensor parallelism** — shard each weight matrix across GPUs, with each GPU computing a slice of the matmul and an all-reduce at the end. Keeps latency low because all GPUs compute in parallel on each forward pass; costs bandwidth on the interconnect every layer. Works well within a single node with NVLink; scales poorly across nodes without high-bandwidth networking. The default for serving single-copy large models.
- **Pipeline parallelism** — partition the model by layer across GPUs, with each GPU holding a contiguous range of layers. Requests flow through the pipeline like a production line. Reduces per-device memory but introduces pipeline-fill latency (the first token has to traverse every stage). Works across nodes with less bandwidth pressure because only activations move between stages. Often combined with micro-batching to fill the pipeline.
- **Data parallelism** — replicate the full model across GPUs, route different requests to different replicas. Does not help if the model doesn't fit on one device; does help throughput linearly once it does. The standard horizontal scaling pattern.

For the running example, a 13B model fits comfortably on a single accelerator, so tensor and pipeline parallelism are unnecessary — data parallelism across replicas handles throughput, and autoscaling handles bursts. The complexity of distributed serving arrives when you move to 70B+ models; for 7B-13B, single-device serving is the right choice and much simpler to operate.

## Serving frameworks

Several open-source frameworks implement the techniques above as end-to-end serving stacks. Each bundles its own mix of continuous batching, paged KV cache, quantization support, and scheduling policy. The differences matter less than the shared baseline — all of the serious ones implement continuous batching, paged KV cache, and FlashAttention — but they diverge in what they specialize for.

- **vLLM** — introduced PagedAttention and continuous batching as a unified serving system [^6]. Widely used as a reference implementation. Strong on throughput and memory efficiency; comprehensive quantization support (GPTQ, AWQ, FP8, and more via integrations); first-class multi-LoRA serving. A reasonable default choice for a new deployment.
- **TGI — Text Generation Inference** — Hugging Face's production serving stack, integrated with the Hub ecosystem and supporting multiple quantization backends. Strong operational features: streaming, health checks, observability hooks. Favored when the team is already deep in the Hugging Face ecosystem.
- **SGLang** — emphasizes structured-generation and prompt-reuse primitives alongside continuous batching and paged KV cache. The SGLang runtime treats prompts as programs and can aggressively share KV cache across requests with common structure. Favored when the workload has heavy structured prompting (agent tool-use, constrained generation, complex RAG) or when prompt reuse across requests is a first-class concern.
- **llama.cpp** — CPU and GPU inference with a heavy focus on consumer hardware, aggressive quantization (2-bit through 8-bit), and minimal dependencies. The go-to for local inference, edge deployment, small-model serving on modest hardware. Not the right choice for a data-center serving stack at the running example's scale, but essential in the ecosystem.
- **TensorRT-LLM** — NVIDIA's optimized stack for serving on NVIDIA hardware. Deep integration with the Transformer Engine, custom kernels, aggressive graph optimization. Favored when you are committed to NVIDIA hardware and willing to invest in NVIDIA's tooling path for maximum performance at the cost of less portability.

These are reference points, not endorsements. The right framework for a given workload depends on model family, quantization needs, multi-tenancy requirements, hardware, and operational preferences. Benchmark on your own traffic before committing — published throughput comparisons shift with every release and rarely capture the workload you actually have.

::callout{type="warning"}
**Throughput optimization without a quality regression test is a trap.** Continuous batching, quantization, and speculative decoding all preserve quality *when correctly implemented*. Implementation bugs, calibration drift, and draft-target mismatch silently degrade outputs. Always re-run your eval after any inference-stack change, and prefer frameworks that version their kernels and quantization recipes so regressions are reproducible.
::

## The pareto frontier

The techniques in this topic do not stack additively. Pushing every slider to maximum produces a model that is fast, cheap, and bad. The production craft is choosing a **point on the pareto frontier** that fits the product: the combination of quantization level, batch policy, model size, and hardware where marginal quality loss is no longer worth the efficiency gain [^1] [^2].

### The three dimensions

Every inference configuration occupies a point in a three-dimensional space:

- **Latency** — end-to-end p95 for a typical request. For the running example, the budget is 2s.
- **Quality** — the score on the product's own eval. Held relative to an unquantized, unbatched, unoptimized baseline on the same eval.
- **Cost** — dollars per 1M output tokens, amortized. For the running example, the budget is $0.80/1M.

The pareto frontier is the set of configurations where improving any one dimension requires giving up on another. Configurations off the frontier are strictly dominated — there exists another configuration that is better on at least one axis and no worse on the others. The optimization work is almost always about moving *onto* the frontier, not about picking a point on it — teams leave enormous amounts of performance on the table because their current configuration is dominated by a reachable alternative they haven't tried.

### Walking the frontier

For the running example, a sequence of moves that typically walks a stack from off-frontier to on-frontier, in approximate order of reversibility:

1. **Start with an unquantized, continuous-batching, PagedAttention baseline.** This is the floor: no quality loss, modern scheduling, standard kernels. Measure p50/p95 TTFT, p50/p95 ITL, throughput, and cost on a representative traffic replay. If this is already within budget, stop.
2. **Turn on prefix caching** if the workload has meaningful prefix reuse (system prompts, few-shot prefixes). Pure win: no quality cost, often a large TTFT and cost win.
3. **Quantize weights to INT4** via AWQ or GPTQ. Measure the quality hit on your eval. This is typically the single biggest cost and latency win available, at a small and measurable quality cost. If the hit is unacceptable, try the other method — AWQ vs GPTQ often trade places depending on the model.
4. **Enable speculative decoding** with a paired draft model. Measure ITL and the acceptance rate. If the acceptance rate is high, you get a large ITL win for free (lossless). If it isn't, try a different draft pairing or skip the technique.
5. **Turn on FP8 activations** (H100) if prefill is the bottleneck and the eval tolerates it. Measure carefully — this is the quantization that most often surprises with regressions.
6. **Consider distillation or a smaller base model** only if the quantized, speculated, batched stack still doesn't meet the budget. Distillation is the most expensive lever (training time) and the hardest to reverse.
7. **Routing and caching** in front of the model address what single-model optimization cannot. Often the biggest cost wins live here, not in the kernel.

At each step, the criterion is the same: is this configuration on the pareto frontier of (latency, quality, cost) for my product? If yes, keep it. If not, back out. No optimization that pushes you off the frontier should be shipped, no matter how impressive its benchmark number looks.

### Durable heuristics

Some heuristics for navigating the frontier that survive across workloads:

- **Start with the unquantized baseline on your eval.** You cannot measure the cost of any optimization without this number. Most teams skip it and then cannot tell whether their production model is fine or quietly broken.
- **Apply optimizations in order of reversibility.** Scheduler changes (continuous batching, paged KV cache) are free quality-wise and should be on by default. Weight-only quantization is next and usually low-cost on quality. Aggressive activation quantization and distillation come last because they are the hardest to undo.
- **Match the optimization to the bottleneck.** Decode-bound workloads benefit most from weight quantization, KV cache efficiency, and speculative decoding. Prefill-bound workloads benefit from activation quantization, FlashAttention, and chunked prefill. Applying the wrong lever wastes engineering time.
- **Measure on your traffic.** Published benchmark throughput rarely translates. Token distributions, concurrency patterns, and tail behavior are specific to your workload.
- **Beware compound tuning.** Quantization interacts with speculative decoding (the draft and target must agree well under quantization). Batching interacts with KV cache budget. Long-context traffic interacts with everything. Hold one knob fixed at a time during exploration, then re-test the full stack together before shipping.

The discipline is the same as the rest of the AI engineering stack: define the eval, hold quality fixed, push the other knobs until they stop helping, and keep the comparison honest.

## What's next

This topic covered what happens inside a single serving node. Getting from "my model runs fast on one GPU" to "my application serves reliably at scale" introduces a different class of problems: request routing, caching strategies, multi-model orchestration, failover, and the operational surfaces that decide whether an inference stack survives contact with real traffic.

- **System Architecture** — the layer above the serving node: gateways, routers, caches, circuit breakers, and the patterns that make AI-enabled applications composable and resilient.
- **Production** — the operational discipline of running what you've built: observability, guardrails, cost control, incident response, and the discipline that separates demos from durable systems.

## Sources

[^1]: Huyen, C. (2024). *AI Engineering*. Chapter 9, "Inference Optimization."
[^2]: Iusztin, P., & Labonne, M. *LLM Engineer's Handbook*. Inference and deployment chapters.
[^3]: Frantar, E., Ashkboos, S., Hoefler, T., & Alistarh, D. (2022). "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers." arXiv:2210.17323.
[^4]: Lin, J., Tang, J., Tang, H., Yang, S., Chen, W.-M., Wang, W.-C., Xiao, G., Dang, X., Gan, C., & Han, S. (2023). "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration." arXiv:2306.00978.
[^5]: Xiao, G., Lin, J., Seznec, M., Demouth, J., & Han, S. (2022). "SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models." arXiv:2211.10438.
[^6]: Kwon, W., Li, Z., Zhuang, S., Sheng, Y., Zheng, L., Yu, C. H., Gonzalez, J. E., Zhang, H., & Stoica, I. (2023). "Efficient Memory Management for Large Language Model Serving with PagedAttention." SOSP 2023. arXiv:2309.06180.
[^7]: Dao, T., Fu, D. Y., Ermon, S., Rudra, A., & Ré, C. (2022). "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness." NeurIPS 2022. arXiv:2205.14135.
[^8]: Dao, T. (2023). "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning." arXiv:2307.08691.
[^9]: Shah, J., Bikshandi, G., Zhang, Y., Thakkar, V., Ramani, P., & Dao, T. (2024). "FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-Precision." arXiv:2407.08608.
[^10]: Yu, G.-I., Jeong, J. S., Kim, G.-W., Kim, S., & Chun, B.-G. (2022). "Orca: A Distributed Serving System for Transformer-Based Generative Models." OSDI 2022.
[^11]: Leviathan, Y., Kalman, M., & Matias, Y. (2023). "Fast Inference from Transformers via Speculative Decoding." ICML 2023. arXiv:2211.17192.
[^12]: Chen, C., Borgeaud, S., Irving, G., Lespiau, J.-B., Sifre, L., & Jumper, J. (2023). "Accelerating Large Language Model Decoding with Speculative Sampling." arXiv:2302.01318.
[^13]: Cai, T., Li, Y., Geng, Z., Peng, H., Lee, J. D., Chen, D., & Dao, T. (2024). "Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads." arXiv:2401.10774.
[^14]: Li, Y., Wei, F., Zhang, C., & Zhang, H. (2024). "EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty." arXiv:2401.15077.
[^15]: Ainslie, J., Lee-Thorp, J., de Jong, M., Zemlyanskiy, Y., Lebrón, F., & Sanghai, S. (2023). "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints." arXiv:2305.13245.
[^16]: Bouchard, L.-F. *Production-Ready AI*. Deployment chapters on inference optimization in production.

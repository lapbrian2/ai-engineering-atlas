<script setup lang="ts">
// Single Canvas 2D component that switches between 8 visualizations.
// Shares IntersectionObserver + resize patterns across all types.

type VizType = 'bpe' | 'attn' | 'sample' | 'shot' | 'cot' | 'retr' | 'agent' | 'lora'

const props = defineProps<{ type: VizType }>()

const canvas = ref<HTMLCanvasElement | null>(null)
let visible = false
let io: IntersectionObserver | null = null
let raf = 0
const t0 = performance.now()

const render = (ctx: CanvasRenderingContext2D) => {
  if (!visible || !canvas.value) {
    raf = requestAnimationFrame(() => render(ctx))
    return
  }
  const w = canvas.value.clientWidth
  const h = canvas.value.clientHeight
  const t = (performance.now() - t0) / 1000

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0E0E15'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(232,232,238,0.25)'
  ctx.lineWidth = 1

  switch (props.type) {
    case 'bpe':    drawBpe(ctx, w, h, t); break
    case 'attn':   drawAttn(ctx, w, h, t); break
    case 'sample': drawSample(ctx, w, h, t); break
    case 'shot':   drawShot(ctx, w, h, t); break
    case 'cot':    drawCot(ctx, w, h, t); break
    case 'retr':   drawRetr(ctx, w, h, t); break
    case 'agent':  drawAgent(ctx, w, h, t); break
    case 'lora':   drawLora(ctx, w, h, t); break
  }
  raf = requestAnimationFrame(() => render(ctx))
}

function drawBpe(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const tokens = ['The', ' av', 'ail', 'ability', ' of', ' mod', 'els']
  let x = 10, y = h / 2
  tokens.forEach((tk, i) => {
    const width = tk.length * 7 + 10
    const pulse = Math.sin(t * 2 + i * 0.3) * 0.08 + 0.5
    ctx.fillStyle = i % 3 === 0 ? `rgba(209,91,44,${0.45 + pulse * 0.15})` : 'rgba(232,232,238,0.12)'
    ctx.fillRect(x, y - 10, width, 20)
    ctx.strokeRect(x, y - 10, width, 20)
    ctx.fillStyle = 'rgba(232,232,238,0.85)'
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.fillText(tk.trim() || '·', x + 4, y + 3)
    x += width + 2
  })
}

function drawAttn(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const n = 12
  const cw = (w - 20) / n, ch = (h - 20) / n
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const base = Math.exp(-Math.pow((i - j) / 3, 2)) * (0.5 + 0.5 * Math.sin(i * 0.6 + j * 0.3 + t * 0.8))
      const a = Math.max(0.05, base * 0.85)
      ctx.fillStyle = `rgba(209, 91, 44, ${a})`
      ctx.fillRect(10 + i * cw, 10 + j * ch, cw - 1, ch - 1)
    }
  }
}

function drawSample(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const n = 26
  const cw = (w - 20) / n
  const wave = Math.sin(t * 1.5) * 2
  for (let i = 0; i < n; i++) {
    const peak = Math.exp(-Math.pow((i - 6 + wave) / 3, 2)) + Math.exp(-Math.pow((i - 16 - wave) / 2.5, 2)) * 0.6
    const hh = peak * (h - 30)
    ctx.fillStyle = i === Math.round(6 + wave) ? 'rgba(209,91,44,0.95)' : 'rgba(232,232,238,0.3)'
    ctx.fillRect(10 + i * cw, h - 10 - hh, cw - 1.5, hh)
  }
}

function drawShot(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const rows = 4, cols = 8
  const cw = (w - 20) / cols, ch = (h - 20) / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const filled = idx < 18
      const highlight = idx === 17 + Math.floor(t * 0.8) % 2
      ctx.fillStyle = highlight ? 'rgba(209,91,44,0.9)' : filled ? 'rgba(232,232,238,0.2)' : 'rgba(232,232,238,0.05)'
      ctx.fillRect(10 + c * cw, 10 + r * ch, cw - 2, ch - 2)
    }
  }
}

function drawCot(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const boxes = [
    { x: 20, y: 60, l: 'Q' },
    { x: 90, y: 40, l: 'S' },
    { x: 160, y: 80, l: 'S' },
    { x: 230, y: 50, l: 'A' }
  ]
  ctx.strokeStyle = 'rgba(209,91,44,0.6)'
  ctx.lineWidth = 1
  for (let i = 0; i < boxes.length - 1; i++) {
    const b = boxes[i], n = boxes[i + 1]
    ctx.beginPath()
    ctx.moveTo(b.x + 30, b.y + 15)
    ctx.lineTo(n.x, n.y + 15)
    ctx.stroke()
  }
  boxes.forEach((b, i) => {
    const pulse = Math.sin(t * 2 - i * 0.6) * 0.15 + 0.85
    ctx.fillStyle = (i === 0 || i === boxes.length - 1) ? `rgba(209,91,44,${pulse})` : 'rgba(232,232,238,0.15)'
    ctx.strokeStyle = 'rgba(232,232,238,0.4)'
    ctx.fillRect(b.x, b.y, 30, 30)
    ctx.strokeRect(b.x, b.y, 30, 30)
    ctx.fillStyle = '#E8E8EE'
    ctx.font = '11px JetBrains Mono'
    ctx.fillText(b.l, b.x + 10, b.y + 20)
  })
}

function drawRetr(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  for (let i = 0; i < 40; i++) {
    const seed = i * 2.73
    ctx.fillStyle = 'rgba(232,232,238,0.3)'
    const bx = 20 + ((Math.sin(seed) + 1) / 2) * (w - 40)
    const by = 20 + ((Math.cos(seed * 1.3) + 1) / 2) * (h - 40)
    ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, Math.PI * 2); ctx.fill()
  }
  const qx = w / 2, qy = h / 2
  const neighbors: Array<[number, number]> = [[qx + 30, qy - 20], [qx - 20, qy + 25], [qx + 18, qy + 30], [qx - 25, qy - 15]]
  ctx.strokeStyle = 'rgba(209,91,44,0.6)'
  neighbors.forEach(([nx, ny]) => {
    ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(nx, ny); ctx.stroke()
    ctx.fillStyle = 'rgba(209,91,44,0.8)'
    ctx.beginPath(); ctx.arc(nx, ny, 2.8, 0, Math.PI * 2); ctx.fill()
  })
  ctx.fillStyle = '#E8E8EE'
  ctx.beginPath(); ctx.arc(qx, qy, 4, 0, Math.PI * 2); ctx.fill()
  const pulse = 42 + Math.sin(t * 1.5) * 6
  ctx.strokeStyle = `rgba(209,91,44,${0.8 - Math.sin(t * 1.5) * 0.2})`
  ctx.beginPath(); ctx.arc(qx, qy, pulse, 0, Math.PI * 2); ctx.stroke()
}

function drawAgent(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 3
  const nodes = ['think', 'act', 'observe', 'reflect']
  const active = Math.floor(t * 0.9) % nodes.length
  nodes.forEach((n, i) => {
    const ang = (i / nodes.length) * Math.PI * 2 - Math.PI / 2
    const nx = cx + Math.cos(ang) * r, ny = cy + Math.sin(ang) * r
    ctx.fillStyle = i === active ? 'rgba(209,91,44,0.95)' : 'rgba(232,232,238,0.18)'
    ctx.beginPath(); ctx.arc(nx, ny, 16, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = i === active ? '#0A0A0E' : '#E8E8EE'
    ctx.font = '9px JetBrains Mono'
    const tw = ctx.measureText(n).width
    ctx.fillText(n, nx - tw / 2, ny + 3)
  })
  ctx.strokeStyle = 'rgba(209,91,44,0.45)'
  ctx.beginPath()
  for (let i = 0; i < nodes.length; i++) {
    const a = i / nodes.length * Math.PI * 2 - Math.PI / 2
    const b = (i + 1) / nodes.length * Math.PI * 2 - Math.PI / 2
    ctx.moveTo(cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20))
    ctx.lineTo(cx + Math.cos(b) * (r - 20), cy + Math.sin(b) * (r - 20))
  }
  ctx.stroke()
}

function drawLora(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const pad = 10
  const bw = (w - pad * 2 - 30) / 3, bh = h - pad * 2 - 10
  ctx.fillStyle = 'rgba(232,232,238,0.12)'
  ctx.fillRect(pad, pad, bw, bh)
  ctx.strokeStyle = 'rgba(232,232,238,0.4)'
  ctx.strokeRect(pad, pad, bw, bh)
  ctx.fillStyle = '#E8E8EE'
  ctx.font = '11px JetBrains Mono'
  ctx.fillText('W', pad + bw / 2 - 4, pad + bh / 2 + 4)
  ctx.fillText('+', pad + bw + 10, pad + bh / 2 + 4)
  const lb = bw * 0.7, lh = bh
  const pulse = Math.sin(t * 1.4) * 0.15 + 0.7
  ctx.fillStyle = `rgba(209,91,44,${pulse})`
  ctx.fillRect(pad + bw + 24, pad, lb * 0.35, lh)
  ctx.fillRect(pad + bw + 24 + lb * 0.4, pad, lb * 0.35, lh)
  ctx.fillStyle = '#E8E8EE'
  ctx.fillText('A', pad + bw + 26 + lb * 0.1, pad + lh / 2 + 4)
  ctx.fillText('B', pad + bw + 26 + lb * 0.5, pad + lh / 2 + 4)
}

onMounted(() => {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')!
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

  const resize = () => {
    if (!canvas.value) return
    canvas.value.width = canvas.value.clientWidth * dpr
    canvas.value.height = canvas.value.clientHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting }, { threshold: 0 })
  io.observe(canvas.value)

  setTimeout(resize, 80)
  window.addEventListener('resize', resize)
  raf = requestAnimationFrame(() => render(ctx))

  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize)
    cancelAnimationFrame(raf)
    io?.disconnect()
  })
})
</script>

<template>
  <canvas ref="canvas" />
</template>

<style scoped>
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>

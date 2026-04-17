precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(in vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res.xy) / min(u_res.x, u_res.y);
  p *= 1.4;

  float t = u_time * 0.05;

  // Domain-warped fbm
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t * 0.5));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.8));
  float n = fbm(p + 4.0 * r);

  // Cursor influence
  vec2 mp = (u_mouse * 2.0 - 1.0);
  mp.x *= u_res.x / u_res.y;
  float md = 1.0 - smoothstep(0.0, 1.2, length(p - mp));

  // Base + accent
  vec3 base   = vec3(0.042, 0.042, 0.058);
  vec3 accent = vec3(0.819, 0.356, 0.172);

  float glow = smoothstep(0.35, 0.75, n);
  float accentMask = smoothstep(0.55, 0.9, n) * 0.42 + md * 0.28;

  vec3 col = mix(base, base * 2.3, glow * 0.45);
  col = mix(col, accent * 0.92, accentMask);

  // Vignette
  float vig = smoothstep(1.2, 0.3, length(p));
  col *= vig * 0.9 + 0.1;

  // Film grain
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.025;

  gl_FragColor = vec4(col, 1.0);
}

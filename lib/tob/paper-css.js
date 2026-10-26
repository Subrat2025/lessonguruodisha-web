// === TOB === Shared "paper" stylesheet for task/project detail bodies.
// No heavy imports here so BOTH the client detail component and the
// server-side image/PDF builders can use the exact same look as the source
// HTML (match tables, word boxes, answer lines, step timeline, question
// bubbles, checklist boxes). Rules are namespaced under `.tp`.
export const TOB_PAPER_CSS = `
.tp{--sky:#1fa2d9;--sky-d:#1577a8;--leaf:#1f7a46;--leaf-d:#145c33;--leaf-l:#e6f4ec;
  --mango:#f7b32b;--mango-l:#fff6e3;--plum:#7c3aed;--plum-l:#f3ecff;--coral:#c93a22;
  --line:#e7e3f1;--muted:#6b7280;--ink:#1f2937;--paper:#fff;
  color:var(--ink);font-family:'Noto Sans Oriya','Baloo Bhaina 2',system-ui,sans-serif}
.tp *{box-sizing:border-box}
.tp .q{font-weight:700;margin-bottom:4px}
.tp .task{background:var(--mango-l);border:2px dashed var(--mango);border-radius:14px;padding:12px 16px}
.tp .answer{background:var(--leaf-l);border-left:5px solid var(--leaf);border-radius:0 12px 12px 0;padding:8px 14px;font-size:14px}
.tp .match{display:grid;grid-template-columns:1fr 60px 1fr;max-width:460px;margin-top:8px;gap:6px 0}
.tp .match .h{font-weight:800;color:#7a4f00}
.tp .match div{padding:2px 0}
.tp .match .dots{border-bottom:2px dotted #c9a24a;height:16px}
.tp ol.steps{margin:4px 0;padding-left:0;list-style:none;counter-reset:s}
.tp ol.steps li{counter-increment:s;position:relative;padding-left:40px;margin:10px 0;min-height:26px}
.tp ol.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:var(--leaf);color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}
.tp ol.steps li:not(:last-child)::after{content:"";position:absolute;left:12px;top:26px;bottom:-10px;width:2px;background:#cfe6d8}
.tp .oq{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tp .oq div{background:var(--plum-l);border-radius:12px;padding:8px 12px 8px 34px;font-size:14px;position:relative}
.tp .oq div::before{content:"?";position:absolute;left:10px;top:8px;width:18px;height:18px;border-radius:50%;background:var(--plum);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
.tp table{border-collapse:collapse;width:100%;font-size:13.5px}
.tp table.chk td,.tp table.chk th{border:1px solid var(--line);padding:6px 8px}
.tp table.chk th{background:#f6f9fc;font-weight:700;color:var(--muted)}
.tp .chk td:nth-child(1){width:46px;text-align:center;font-weight:700;color:var(--muted)}
.tp .chk td:nth-child(n+3),.tp .chk th:nth-child(n+3){width:58px;text-align:center}
.tp .box{display:inline-block;width:18px;height:18px;border:2px solid #8aa0b5;border-radius:4px;vertical-align:middle;cursor:pointer}
.tp .box.on{background:var(--leaf);border-color:var(--leaf)}
.tp .lines{min-height:110px;border:1.5px solid var(--line);border-radius:12px;background:repeating-linear-gradient(#fff 0 33px,#c9d6e3 33px 34px)}
.tp .nbox{border:2px dashed #b9c6d3;border-radius:12px;min-height:60px;padding:10px 14px;display:flex;justify-content:space-between;align-items:flex-end;font-size:13.5px;color:var(--muted);gap:12px;flex-wrap:wrap}
.tp .tw{overflow-x:auto}
.tp img{max-width:100%;height:auto}
.tp h4{display:none}
`

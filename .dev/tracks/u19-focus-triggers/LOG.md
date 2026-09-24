# U19 — focus-triggers — LOG

## 2026-09-24 start (claude opus worker)
- Spec gelezen. Plan: FocusMode krijgt modi (`temperature`, `wind`), bronnen per modus in
  recency-volgorde; winnaar = modus van de laatst geactiveerde nog-actieve bron (laatste wint),
  per modus een eigen tween. Kaartlabel-handlers + `lastMapPointer` weg. Pin wordt één waarde
  (`temperature | wind | undefined`) zodat pins elkaar uitsluiten.
- Wind: DEFAULT intensity 1.9 → 1.27 (×2/3, afgerond op de knopstap 0,01; opgeslagen v2-tuning
  blijft gelden via sanitize). Windfocus: intensiteit × (1 + focus·½) → ×3/2 bij volle focus.

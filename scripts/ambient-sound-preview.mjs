/**
 * Did You Hear That?
 * Lets players preview ambient sounds by hovering over the canvas.
 *
 * Uses manual Sound playback (not playAtPosition, which requires a token
 * inside the radius) with full fidelity to the GM's settings:
 *   - doc.volume       → max volume
 *   - doc.easing       → distance-based linear attenuation
 *   - doc.effects.base → base AudioNode effect applied via sound.applyEffects()
 *   - doc.effects.muffled → applied when cursor is behind a wall (doc.walls)
 *
 * Tested against Foundry VTT v14.
 */

const MODULE_ID = "did-you-hear-that";

// ─── Settings ────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "DYHT.SettingEnabled",
    hint: "DYHT.SettingEnabledHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "fadeDuration", {
    name: "DYHT.SettingFadeDuration",
    hint: "DYHT.SettingFadeDurationHint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 2000, step: 50 },
    default: 300,
  });

  const reRender = () => { if (!game.user?.isGM) renderAllIcons(); };

  game.settings.register(MODULE_ID, "showIcon", {
    name: "DYHT.SettingShowIcon",
    hint: "DYHT.SettingShowIconHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: reRender,
  });

  game.settings.register(MODULE_ID, "iconClass", {
    name: "DYHT.SettingIconClass",
    hint: "DYHT.SettingIconClassHint",
    scope: "world",
    config: true,
    type: String,
    default: "fa-light fa-ear",
    onChange: reRender,
  });

  game.settings.register(MODULE_ID, "iconSize", {
    name: "DYHT.SettingIconSize",
    hint: "DYHT.SettingIconSizeHint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 16, max: 256, step: 4 },
    default: 32,
    onChange: reRender,
  });

  game.settings.register(MODULE_ID, "iconColor", {
    name: "DYHT.SettingIconColor",
    hint: "DYHT.SettingIconColorHint",
    scope: "world",
    config: true,
    type: String,
    default: "#ffffff",
    onChange: reRender,
  });

  game.settings.register(MODULE_ID, "iconOpacity", {
    name: "DYHT.SettingIconOpacity",
    hint: "DYHT.SettingIconOpacityHint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.5,
    onChange: reRender,
  });
});

// Hide GM-only world settings from non-GM players in the settings UI. World
// settings normally render as read-only rows for players; we want them gone
// entirely so players only see the two toggles that affect their client.
Hooks.on("renderSettingsConfig", (app, html) => {
  if (game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const gmOnly = ["fadeDuration", "iconClass", "iconSize", "iconColor", "iconOpacity"];
  for (const key of gmOnly) {
    const row = root.querySelector(`[name="${MODULE_ID}.${key}"]`)?.closest(".form-group");
    if (row) row.style.display = "none";
  }
});

// ─── State ────────────────────────────────────────────────────────────────────

let _activeSound  = null;
let _activeDoc    = null;
let _activeEffect = null; // current AudioNode effect applied to the sound
const _iconSprites = new Map(); // doc.id -> PIXI.Text marker at sound origin

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the radius of an AmbientSoundDocument in canvas pixels.
 */
function getRadiusPx(doc) {
  const placeable = doc.object;
  if (placeable?.radius) return placeable.radius;
  const { size: gridSize, distance: gridDistance } = canvas.grid;
  return (doc.radius / gridDistance) * gridSize;
}

/**
 * Compute the attenuated volume for the cursor at pos.
 * Mirrors Foundry's own easing logic: linear falloff from doc.volume at the
 * origin to 0 at the radius edge. If easing is off, flat doc.volume.
 * Also scales by the client's global Ambient volume slider.
 */
function computeVolume(doc, pos) {
  const radiusPx = getRadiusPx(doc);
  const dist = Math.hypot(doc.x - pos.x, doc.y - pos.y);
  let vol = doc.volume ?? 1.0;

  if (doc.easing && radiusPx > 0) {
    const t = Math.min(1, Math.max(0, dist / radiusPx));
    vol *= (1 - t);
  }

  // Respect the player's global Ambient volume channel.
  const envVol = game.settings.get("core", "globalAmbientVolume") ?? 1.0;
  return Math.min(1, Math.max(0, vol * envVol));
}

/**
 * Check whether the cursor at pos is behind a wall relative to doc's origin.
 * Used to decide whether to apply the muffled effect.
 * Returns false if the sound isn't wall-constrained.
 */
function isMuffled(doc, pos) {
  if (!doc.walls) return false;
  // Cast a ray from sound origin to cursor; if it hits a wall, we're muffled.
  try {
    const origin = { x: doc.x, y: doc.y };
    const collision = CONFIG.Canvas.polygonBackends.sound.testCollision(
      origin, pos, { type: "sound", mode: "any" }
    );
    return !!collision;
  } catch (_e) {
    return false;
  }
}

/**
 * Build an AudioNode effect from a { type, intensity } config object.
 * Uses CONFIG.soundEffects — the same registry the core UI uses.
 * Returns null if the type is unrecognised or missing.
 */
function buildEffect(context, effectConfig) {
  if (!effectConfig?.type) return null;
  const entry = CONFIG.soundEffects?.[effectConfig.type];
  if (!entry?.effectClass) return null;
  try {
    return new entry.effectClass(context, { intensity: effectConfig.intensity ?? 5 });
  } catch (_e) {
    return null;
  }
}

/**
 * Find the first non-hidden AmbientSoundDocument whose radius covers pos.
 * Uses doc.x/doc.y for Levels module compatibility.
 */
function findSoundAtPosition(pos) {
  if (!canvas?.sounds?.placeables) return null;
  for (const placeable of canvas.sounds.placeables) {
    const doc = placeable.document;
    if (doc.hidden) continue;
    const radiusPx = getRadiusPx(doc);
    if (radiusPx <= 0) continue;
    const dx = doc.x - pos.x;
    const dy = doc.y - pos.y;
    if (Math.hypot(dx, dy) <= radiusPx) return doc;
  }
  return null;
}

/**
 * Resolve a Font Awesome class string (e.g. "fa-solid fa-volume-high") into the
 * underlying glyph + font-family by sniffing the ::before pseudo-element. This
 * way the user can pick any FA Pro icon by class name without us hard-coding
 * unicode points.
 */
function resolveFaGlyph(className) {
  const el = document.createElement("i");
  el.className = className;
  el.style.position = "absolute";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  const style = getComputedStyle(el, "::before");
  let content = style.content || "";
  const fontFamily = style.fontFamily || "Font Awesome 7 Pro";
  const fontWeight = style.fontWeight || "900";
  document.body.removeChild(el);

  // getComputedStyle wraps the glyph in literal quotes; duotone joins two quoted
  // glyphs with " / ". Strip all quotes and slashes, then keep only the first
  // codepoint so duotone fallbacks render as a single glyph.
  content = content.replace(/["'/]/g, "").trim();
  const chars = [...content];
  if (chars.length > 1) content = chars[0];

  return { content, fontFamily, fontWeight };
}

function buildIconSprite(doc) {
  const className = game.settings.get(MODULE_ID, "iconClass") || "fa-solid fa-volume-high";
  const size      = game.settings.get(MODULE_ID, "iconSize") ?? 64;
  const colorStr  = game.settings.get(MODULE_ID, "iconColor") || "#ffffff";
  const opacity   = game.settings.get(MODULE_ID, "iconOpacity") ?? 0.5;
  const { content, fontFamily, fontWeight } = resolveFaGlyph(className);
  if (!content) return null;

  const tint = parseInt(colorStr.replace("#", ""), 16);
  const families = [
    fontFamily,
    "Font Awesome 7 Pro",
    "Font Awesome 6 Pro",
    "Font Awesome 6 Free",
    "FontAwesome",
  ].filter(Boolean);
  const text = new PIXI.Text(content, {
    fontFamily: families,
    fontWeight,
    fontSize: size,
    fill: isNaN(tint) ? 0xffffff : tint,
    stroke: 0x000000,
    strokeThickness: Math.max(2, Math.round(size / 12)),
    align: "center",
  });
  text.anchor.set(0.5);
  text.position.set(doc.x, doc.y);
  text.alpha = Math.min(1, Math.max(0, opacity));
  text.eventMode = "none";
  return text;
}

function removeIconFor(docId) {
  const sprite = _iconSprites.get(docId);
  if (!sprite) return;
  try { sprite.parent?.removeChild(sprite); sprite.destroy(); }
  catch (_e) { /* already gone */ }
  _iconSprites.delete(docId);
}

function clearAllIcons() {
  for (const id of [..._iconSprites.keys()]) removeIconFor(id);
}

function renderAllIcons() {
  clearAllIcons();
  if (!game.settings.get(MODULE_ID, "showIcon")) return;
  if (!canvas?.sounds?.placeables) return;

  const layer = canvas.sounds ?? canvas.stage;
  for (const placeable of canvas.sounds.placeables) {
    const doc = placeable.document;
    if (doc.hidden) continue;
    const sprite = buildIconSprite(doc);
    if (!sprite) continue;
    layer.addChild(sprite);
    _iconSprites.set(doc.id, sprite);
  }
}

// ─── Preview control ─────────────────────────────────────────────────────────

async function stopPreview() {
  if (!_activeSound) return;
  const sound = _activeSound;
  _activeSound  = null;
  _activeDoc    = null;
  _activeEffect = null;
  const fade = game.settings.get(MODULE_ID, "fadeDuration");
  try {
    if (fade > 0 && sound.playing) await sound.fade(0, { duration: fade });
    sound.stop();
  } catch (_e) { /* already stopped */ }
}

async function startPreview(doc, pos) {
  if (doc === _activeDoc) return;
  await stopPreview();

  if (!doc.path) return;
  const fade = game.settings.get(MODULE_ID, "fadeDuration");
  const vol  = computeVolume(doc, pos);

  const sound = new foundry.audio.Sound(doc.path, { context: game.audio.environment });
  _activeSound = sound;
  _activeDoc   = doc;

  try {
    await sound.load();
    if (_activeSound !== sound) { sound.stop(); return; } // moved away during load

    // Decide which effect to apply: muffled if behind a wall, base otherwise.
    const muffled = isMuffled(doc, pos);
    const effectCfg = muffled ? doc.effects?.muffled : doc.effects?.base;
    const effectNode = buildEffect(sound.context, effectCfg);
    _activeEffect = effectNode;

    // Apply effects before play so the pipeline is ready.
    if (effectNode) sound.applyEffects([effectNode]);

    await sound.play({
      loop:   doc.repeat !== false,
      volume: fade > 0 ? 0 : vol,
    });

    if (fade > 0 && sound.playing) await sound.fade(vol, { duration: fade });

  } catch (err) {
    console.warn(`${MODULE_ID} | Could not preview "${doc.path}":`, err);
    _activeSound  = null;
    _activeDoc    = null;
    _activeEffect = null;
  }
}

/**
 * Called every pointermove tick while inside the same sound's radius.
 * Updates volume for distance attenuation and swaps effects if muffled state changed.
 */
function updatePreview(doc, pos) {
  if (!_activeSound?.playing) return;

  const vol = computeVolume(doc, pos);
  try { _activeSound.volume = vol; } catch (_e) { /* stopping */ }

  // Swap effect if muffled state changed.
  const muffled = isMuffled(doc, pos);
  const effectCfg = muffled ? doc.effects?.muffled : doc.effects?.base;
  const wantType  = effectCfg?.type ?? null;
  const haveType  = _activeEffect ? Object.keys(CONFIG.soundEffects ?? {}).find(
    k => _activeEffect instanceof CONFIG.soundEffects[k]?.effectClass
  ) : null;

  if (wantType !== haveType) {
    const newEffect = buildEffect(_activeSound.context, effectCfg);
    _activeEffect = newEffect;
    try {
      _activeSound.applyEffects(newEffect ? [newEffect] : []);
    } catch (_e) { /* stopping */ }
  }
}

// ─── Canvas event listeners ───────────────────────────────────────────────────

function onPointerMove(event) {
  if (!game.settings.get(MODULE_ID, "enabled")) { stopPreview(); return; }

  const pos   = event.data.getLocalPosition(canvas.stage);
  const found = findSoundAtPosition(pos);

  if (found) {
    if (found === _activeDoc) updatePreview(found, pos);
    else startPreview(found, pos);
  } else {
    stopPreview();
  }
}

function onPointerLeave(_event) { stopPreview(); }

function attachListeners() {
  canvas.stage.off("pointermove", onPointerMove);
  canvas.stage.off("pointerleave", onPointerLeave);
  canvas.stage.on("pointermove", onPointerMove);
  canvas.stage.on("pointerleave", onPointerLeave);
}

function detachListeners() {
  canvas.stage?.off("pointermove", onPointerMove);
  canvas.stage?.off("pointerleave", onPointerLeave);
  stopPreview();
  clearAllIcons();
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.on("canvasReady", () => {
  if (game.user.isGM) return;
  attachListeners();
  renderAllIcons();
});

Hooks.on("canvasTearDown", () => {
  if (game.user.isGM) return;
  detachListeners();
});

// Keep origin icons in sync with the sounds layer. Players only — GM already
// has the native control icon for placement.
function refreshIconsForPlayers() {
  if (game.user.isGM) return;
  renderAllIcons();
}

Hooks.on("createAmbientSound",  refreshIconsForPlayers);
Hooks.on("updateAmbientSound",  refreshIconsForPlayers);
Hooks.on("deleteAmbientSound",  refreshIconsForPlayers);

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
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0, max: 2000, step: 50 },
    default: 300,
  });
});

// ─── State ────────────────────────────────────────────────────────────────────

let _activeSound  = null;
let _activeDoc    = null;
let _activeEffect = null; // current AudioNode effect applied to the sound

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
    const ray = new Ray(origin, pos);
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
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

Hooks.on("canvasReady", () => {
  if (game.user.isGM) return;
  attachListeners();
});

Hooks.on("canvasTearDown", () => {
  if (game.user.isGM) return;
  detachListeners();
});

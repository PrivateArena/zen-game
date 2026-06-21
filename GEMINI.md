# Local Asset Generation APIs Reference

Instead of searching or downloading 2D game graphics or voiceover dialogs online, you can leverage the local AI services configured in our environment to generate assets procedurally.

---

## 🎨 1. Paint API (Image & Sprite Generation)
The local image generation pipeline (`zenlights` Paint server) runs locally on port `8765` using ONNX Runtime. It supports high-speed generation with models like **SDXL-Turbo**, **LCM**, **Bonsai (FLUX.2)**, and the specialized **pixel-studio** model.

* **Base URL**: `http://localhost:8765/paint`

> [!TIP]
> **Optimal Pixel Art Path**: For production-ready game sprites, load the specialized `pixel-studio` model before generating:
> ```bash
> curl -s -X POST http://localhost:8765/paint/load \
>   -H "Content-Type: application/json" \
>   -d '{"model": "pixel-studio"}'
> ```


### Generate Image
Trigger the creation of a PNG asset (e.g. background textures, items, or mechs).

* **Method**: `POST`
* **Endpoint**: `/paint/generate`
* **JSON Body Parameters**:
  * `prompt` (string, required): Detailed prompt describing the visual element.
  * `negative_prompt` (string, optional): What to exclude (only for SDXL models).
  * `width` (number, optional, default: `512`): Width.
  * `height` (number, optional, default: `512`): Height.
  * `steps` (number, optional, default: `4`): Denoising inference steps.
  * `seed` (number, optional): Random seed.
  * `pixel_size` (number, optional, default: `64`): Target grid size (e.g., `16`, `32`, `64`, `128`) for pixel art. (Used by `pixel-studio`).
  * `palette` (string, optional, default: `"custom"`): Palette preset (`"pico8"`, `"gameboy"`, `"nes"`, `"c64"`, `"custom"`). (Used by `pixel-studio`).
  * `palette_size` (number, optional, default: `16`): Max colors for custom palette extraction. (Used by `pixel-studio`).
  * `outline` (boolean, optional, default: `true`): Generates an outline around transparent shapes. (Used by `pixel-studio`).
  * `outline_color` (string, optional): Hex color (e.g., `"#000000"`) for custom outline colors. (Used by `pixel-studio`).
  * `transparent` (boolean, optional, default: `true`): Automatically key out/flood-fill solid backgrounds. (Used by `pixel-studio`).
  * `clean_doubles` (boolean, optional, default: `true`): Cleans L-shaped double pixels on diagonals. (Used by `pixel-studio`).
  * `dither` (boolean, optional, default: `false`): Apply Floyd-Steinberg error diffusion dithering (only with preset palettes). (Used by `pixel-studio`).

#### Example Request (Using pixel-studio):
```bash
curl -s -X POST http://localhost:8765/paint/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "axe warrior gameboy style",
    "pixel_size": 64,
    "palette": "gameboy",
    "transparent": true,
    "outline": true,
    "clean_doubles": true
  }'
```

#### Example Response:
```json
{
  "path": "/tmp/zen-paint/zp_1715456729000_42.png",
  "duration_ms": 3280,
  "width": 512,
  "height": 512,
  "seed": 42
}
```

### Download / Serve Output
To retrieve the generated PNG:
```bash
curl -o power_core.png http://localhost:8765/paint/outputs/zp_1715456729000_42.png
```

---

## 🔊 2. TTS API (Speech & Dialog Voiceovers)
The local text-to-speech system (`zen-tts` server) runs on port `5055` using Piper, Kokoro-82M, and KittenTTS models to generate high-fidelity WAV speech.

* **Base URL**: `http://localhost:5055`

### Synthesize Speech
Generates a raw binary WAV stream of a dialog sentence.

* **Method**: `POST`
* **Endpoint**: `/tts`
* **JSON Body Parameters**:
  * `text` (string, required): Sentence text to synthesize.
  * `voice` (string, required): Voice model identifier.
  * `speed` (number, optional, default: `1.0`): Speed multiplier.

#### Available Voice Keys (Kokoro-82M):
* `af_bella` (Female, realistic)
* `af_sarah` (Female, standard)
* `am_adam` (Male, standard)
* `am_michael` (Male, standard)

#### Example Request:
```bash
curl -s -X POST http://localhost:5055/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Critical warning: Alliance grid shield collapsing in ten seconds.",
    "voice": "af_bella",
    "speed": 1.1
  }' \
  -o shield_warning.wav
```

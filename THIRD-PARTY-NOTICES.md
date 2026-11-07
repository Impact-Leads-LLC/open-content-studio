# Third-party notices

The MIT License in [LICENSE](LICENSE) covers the code and documents written for this studio. These parts were made by
other people and keep their own licences.

| Part | Where | Licence |
|---|---|---|
| Libre Franklin, Poppins and Archivo fonts | every `fonts/` folder and `app/assets/postcard/` | SIL Open Font License 1.1. The licence text sits beside each font as `OFL-<name>.txt` |
| Humanizer guide, by Siqi Chen | `v2-claude/plugins/studio/skills/humanizer/` | MIT, in that folder's `LICENSE` |
| YuNet face detector (`face_detection_yunet_2023mar.onnx`), OpenCV Zoo, by Shiqi Yu and contributors | `engines/*/assets/models/` | MIT. See the `README.md` beside the model |
| GSAP 3, by GreenSock | `engines/*/assets/vendor/gsap.min.js` | The GSAP Standard License (https://gsap.com/standard-license), free for commercial use. The file keeps its own header |
| Sound effects (whoosh, click, pop, impact) | `engines/*/assets/sfx/` | From the HyperFrames sound library (Apache 2.0), which sources them from Pixabay under the Pixabay Content License. See `v1-tool/engines/SFX-CREDITS.md` |
| npm and Python packages | installed by `package.json`, `requirements` lines and the setup | Each package's own licence |

The studio also calls outside services (Supabase, Vercel, Anthropic, your scheduler, fal.ai, Google). You open those
accounts yourself and their terms apply to your use of them.

# BlockLand Shaders

A browser block-building sandbox with a shader pipeline inspired by BSL-style shader packs:

- Sun and moon shadows (shadow map, soft PCF filtering)
- Ambient occlusion baked into the block mesh
- Bloom on bright sky and lamp blocks
- God rays through trees and terrain
- Animated reflective water, swaying leaves, procedural clouds and stars
- Day/night cycle, ACES tone mapping, vignette

Pure static files (HTML, CSS, JS). No build step, no dependencies. Needs a browser with WebGL2.

## Deploy on GitHub Pages

1. Create a new repository and upload everything from this folder to the repository root.
2. Go to Settings > Pages.
3. Under "Build and deployment", choose "Deploy from a branch", pick `main` and `/ (root)`, then Save.
4. Your site goes live at `https://<your-username>.github.io/<repo-name>/` in about a minute.

Netlify, Vercel and Cloudflare Pages also work: point them at this folder with no build command.

## Run locally

Open `index.html` directly, or run a local server:

    python3 -m http.server 8080

## Files

- `index.html`, `style.css`: page, menu and HUD
- `js/main.js`: engine (world generation, meshing, shaders, player)

## Notes

All textures are generated in code, so there are no image assets to host. This is an original project and is not affiliated with Mojang, Microsoft or the authors of BSL Shaders.
